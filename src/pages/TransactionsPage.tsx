import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import ResizableDataTable from "@/components/ResizableDataTable";

import { addDaily, deleteDaily, listDaily, updateDaily, type DailyRecord } from "../api/daily";
import { addLoanTransaction, listLoans } from "../api/loans";
import { listCategories } from "../api/categories";

import { ACCOUNTS, TRAN_TYPES, DAILY_PERSON_LIKE_CATEGORIES } from "../lib/constants";
import { formatINR, mmddyyyyToISO, safeLower } from "../lib/format";

type CategoryTypeFilter = "All" | "Expense" | "Income" | "Investment" | "Loan" | "Unknown";
const CATEGORY_TYPE_OPTIONS: CategoryTypeFilter[] = ["All", "Expense", "Income", "Investment", "Loan", "Unknown"];

type FinanceDraft = {
  date: string;
  category: string;
  amount: number;
  tranType: string;
  account: string;
  description: string;
  place: string;
  referenceId: string;
};

type LoanDraft = {
  date: string;
  kind: "Loan" | "Lend";
  person: string;
  amount: number;
  tranType: "Credit" | "Debit";
  account: string;
  description: string;
  referenceId: string;
};

const todayISO = new Date().toISOString().slice(0, 10);
const currentMonth = new Date().toISOString().slice(0, 7);

function yearMonthFromDailyDate(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  return iso ? iso.slice(0, 7) : "";
}
function dateToTs(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export default function TransactionsPage() {
  const qc = useQueryClient();

  const dailyQ = useQuery({ queryKey: ["daily"], queryFn: listDaily });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const loansQ = useQuery({ queryKey: ["loans"], queryFn: listLoans }); // for Person suggestions

  const records = dailyQ.data?.records ?? [];
  const categoryConfig = categoriesQ.data?.records ?? [];
  const useTypeSystem = categoryConfig.length > 0;

  const categoryTypeByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoryConfig) map.set(c.category, c.type);
    return map;
  }, [categoryConfig]);

  const getType = (cat: string): CategoryTypeFilter => {
    const t = categoryTypeByName.get(cat);
    if (!t) return "Unknown";
    if (t === "Expense" || t === "Income" || t === "Investment" || t === "Loan") return t;
    return "Unknown";
  };

  const personOptions = useMemo(() => {
    const set = new Set<string>();
    const loanRows = loansQ.data?.records ?? [];
    for (const r of loanRows) if (r.person) set.add(r.person.trim());
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [loansQ.data]);

  // ---------- Finance form ----------
  const [financeType, setFinanceType] = useState<CategoryTypeFilter>("Expense");

  const activeCategories = useMemo(() => categoryConfig.filter((c) => c.active), [categoryConfig]);

  const financeCategoryOptions = useMemo(() => {
    const allowedTypes = new Set(["Expense", "Income", "Investment"]);
    const type = allowedTypes.has(financeType) ? financeType : "Expense";

    const fromCfg = activeCategories
      .filter((c) => c.type === type)
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.category.localeCompare(b.category))
      .map((c) => c.category);

    if (fromCfg.length) return fromCfg;

    // fallback
    return Array.from(new Set(records.map((r) => r.category).filter(Boolean))).sort();
  }, [activeCategories, financeType, records]);

  const [finance, setFinance] = useState<FinanceDraft>({
    date: todayISO,
    category: "NA",
    amount: 0,
    tranType: "Debit",
    account: "UPI",
    description: "",
    place: "",
    referenceId: "NA",
  });

  useEffect(() => {
    if (!financeCategoryOptions.length) return;
    if (!finance.category || !financeCategoryOptions.includes(finance.category)) {
      setFinance((s) => ({ ...s, category: financeCategoryOptions[0] }));
    }
  }, [financeCategoryOptions]);

  const addFinanceMut = useMutation({
    mutationFn: () => addDaily(finance),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["daily"] });
      setFinance((s) => ({ ...s, amount: 0, description: "", place: "" }));
    },
  });

  // ---------- Loan/Lend form (append-only; no upsert-by-person) ----------
  const [loan, setLoan] = useState<LoanDraft>({
    date: todayISO,
    kind: "Loan",
    person: "",
    amount: 0,
    tranType: "Credit",
    account: "UPI",
    description: "",
    referenceId: "NA",
  });

  const addLoanMut = useMutation({
    mutationFn: () => addLoanTransaction(loan),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["daily"] });
      await qc.invalidateQueries({ queryKey: ["loans"] });
      setLoan((s) => ({ ...s, person: "", amount: 0, description: "" }));
    },
  });

  // ---------- Table filters ----------
  const [q, setQ] = useState("");
  const [month, setMonth] = useState<string>(currentMonth);
  const [categoryType, setCategoryType] = useState<CategoryTypeFilter>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [accountFilter, setAccountFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const [onlyInvestments, setOnlyInvestments] = useState(false);
  const [onlyLoans, setOnlyLoans] = useState(false);

  useEffect(() => {
    setCategoryFilter("All");
  }, [categoryType]);

  const accountOptions = useMemo(() => {
    const set = new Set(records.map((r) => r.account).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of categoryConfig) set.add(c.category);
    for (const r of records) if (r.category) set.add(r.category);

    const list = Array.from(set).sort();
    if (categoryType === "All") return ["All", ...list];

    return ["All", ...list.filter((c) => getType(c) === categoryType)];
  }, [records, categoryConfig, categoryType, categoryTypeByName]);

  const filtered = useMemo(() => {
    let rows = [...records];

    if (month) rows = rows.filter((r) => yearMonthFromDailyDate(r.date) === month);

    if (onlyInvestments && useTypeSystem) rows = rows.filter((r) => getType(r.category || "NA") === "Investment");
    if (onlyLoans && useTypeSystem) rows = rows.filter((r) => getType(r.category || "NA") === "Loan");

    if (categoryType !== "All" && useTypeSystem) rows = rows.filter((r) => getType(r.category || "NA") === categoryType);

    if (categoryFilter !== "All") rows = rows.filter((r) => r.category === categoryFilter);
    if (accountFilter !== "All") rows = rows.filter((r) => r.account === accountFilter);
    if (typeFilter !== "All") rows = rows.filter((r) => safeLower(r.tranType) === safeLower(typeFilter));

    const qq = safeLower(q).trim();
    if (qq) {
      rows = rows.filter((r) => {
        const hay = [r.id, r.date, r.category, r.tranType, r.account, r.description, r.place, r.referenceId]
          .map((x) => safeLower(x))
          .join(" | ");
        return hay.includes(qq);
      });
    }

    return rows;
  }, [
    records,
    month,
    onlyInvestments,
    onlyLoans,
    categoryType,
    categoryFilter,
    accountFilter,
    typeFilter,
    q,
    useTypeSystem,
    categoryTypeByName,
  ]);

  const totalCredit = useMemo(
    () => filtered.filter((r) => safeLower(r.tranType) === "credit").reduce((a, r) => a + (r.amount || 0), 0),
    [filtered]
  );
  const totalDebit = useMemo(
    () => filtered.filter((r) => safeLower(r.tranType) === "debit").reduce((a, r) => a + (r.amount || 0), 0),
    [filtered]
  );
  const net = totalCredit - totalDebit;

  function clearFilters() {
    setMonth("");
    setCategoryType("All");
    setCategoryFilter("All");
    setAccountFilter("All");
    setTypeFilter("All");
    setOnlyInvestments(false);
    setOnlyLoans(false);
    setQ("");
  }

  // ---------- Edit / Delete ----------
  const [editing, setEditing] = useState<DailyRecord | null>(null);
  const [editDraft, setEditDraft] = useState<FinanceDraft | null>(null);

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing || !editDraft) throw new Error("No edit draft");
      return updateDaily(editing.id, editDraft);
    },
    onSuccess: async () => {
      setEditing(null);
      setEditDraft(null);
      await qc.invalidateQueries({ queryKey: ["daily"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => deleteDaily(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["daily"] });
    },
  });

  function openEdit(r: DailyRecord) {
    setEditing(r);
    setEditDraft({
      date: mmddyyyyToISO(r.date) || todayISO,
      category: r.category || "NA",
      amount: r.amount || 0,
      tranType: r.tranType || "Debit",
      account: r.account || "UPI",
      description: r.description || "",
      place: r.place || "",
      referenceId: r.referenceId || "NA",
    });
  }

  const columns = useMemo<ColumnDef<DailyRecord>[]>(() => {
    return [
      { accessorKey: "id", header: "ID", size: 50 },
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => dateToTs(row.date),
        cell: ({ row }) => row.original.date,
        size: 100,
      },
      { id: "amount", header: "Amount", size: 100, cell: ({ row }) => formatINR(row.original.amount) },

      // {
      //   id: "catType",
      //   header: "Cat Type",
      //   size: 120,
      //   meta: { className: "hidden lg:table-cell" },
      //   cell: ({ row }) => <Badge variant="outline">{getType(row.original.category || "NA")}</Badge>,
      // },

      {
        accessorKey: "category",
        header: "Category",
        size: 160,
        cell: ({ row }) => <span className="block truncate" title={row.original.category}>{row.original.category}</span>,
      },

      { accessorKey: "tranType", header: "Type", size: 70 },
      { accessorKey: "account", header: "Account", size: 100, meta: { className: "hidden lg:table-cell" } },

      {
        accessorKey: "description",
        header: "Description",
        size: 180,
        cell: ({ row }) => <span className="block truncate" title={row.original.description}>{row.original.description}</span>,
      },
      {
        accessorKey: "place",
        header: "Place / Person",
        size: 180,
        cell: ({ row }) => <span className="block truncate" title={row.original.place}>{row.original.place}</span>,
      },

      { accessorKey: "referenceId", header: "Ref", size: 60, meta: { className: "hidden xl:table-cell" } },

      {
        id: "actions",
        header: "Actions",
        size: 170,
        enableResizing: false,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(r)}>Edit</Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleteMut.isPending}>Delete</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete record #{r.id}?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate(r.id)}>
                      Yes, Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ];
  }, [deleteMut.isPending, categoryTypeByName]);

  if (dailyQ.isLoading) return <div>Loading…</div>;
  if (dailyQ.isError) return <div className="text-destructive">Failed to load Daily records.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">All actions ask for confirmation.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Credit: {formatINR(totalCredit)}</Badge>
          <Badge variant="secondary">Debit: {formatINR(totalDebit)}</Badge>
          <Badge variant={net >= 0 ? "default" : "destructive"}>Net: {formatINR(net)}</Badge>
        </div>
      </div>

      <Tabs defaultValue="finance" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="finance">Finance Record</TabsTrigger>
          <TabsTrigger value="loan">Loan / Lend</TabsTrigger>
        </TabsList>

        <TabsContent value="finance" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Add Finance Record</CardTitle></CardHeader>

            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={finance.date} onChange={(e) => setFinance(s => ({ ...s, date: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Category Type</label>
                <Select value={financeType} onValueChange={(v: any) => setFinanceType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Expense", "Income", "Investment"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={finance.category} onValueChange={(v) => setFinance(s => ({ ...s, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {financeCategoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input type="number" value={finance.amount} onChange={(e) => setFinance(s => ({ ...s, amount: Number(e.target.value) }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tran Type</label>
                <Select value={finance.tranType} onValueChange={(v) => setFinance(s => ({ ...s, tranType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Account</label>
                <Select value={finance.account} onValueChange={(v) => setFinance(s => ({ ...s, account: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={finance.description} onChange={(e) => setFinance(s => ({ ...s, description: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Place</label>
                <Input value={finance.place} onChange={(e) => setFinance(s => ({ ...s, place: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Reference Id</label>
                <Input value={finance.referenceId} onChange={(e) => setFinance(s => ({ ...s, referenceId: e.target.value }))} />
              </div>

              <div className="lg:col-span-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={addFinanceMut.isPending || finance.amount <= 0}>
                      Add Finance Record
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm add finance record?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Date: {finance.date}</div>
                      <div>Category: {finance.category}</div>
                      <div>Amount: {formatINR(finance.amount)}</div>
                      <div>Type: {finance.tranType}</div>
                      <div>Account: {finance.account}</div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => addFinanceMut.mutate()}>
                        Yes, Add
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loan" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Add Loan / Lend Record</CardTitle></CardHeader>

            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={loan.date} onChange={(e) => setLoan(s => ({ ...s, date: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select
                  value={loan.kind}
                  onValueChange={(v: "Loan" | "Lend") => {
                    const tranType = v === "Loan" ? "Credit" : "Debit";
                    setLoan((s) => ({ ...s, kind: v, tranType }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Loan">Loan (I borrowed)</SelectItem>
                    <SelectItem value="Lend">Lend (I gave)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Person</label>
                {/* dropdown suggestions + free typing */}
                <Input
                  list="person-list"
                  value={loan.person}
                  onChange={(e) => setLoan(s => ({ ...s, person: e.target.value }))}
                  placeholder="Select or type person name"
                />
                <datalist id="person-list">
                  {personOptions.map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input type="number" value={loan.amount} onChange={(e) => setLoan(s => ({ ...s, amount: Number(e.target.value) }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tran Type</label>
                <Select value={loan.tranType} onValueChange={(v: any) => setLoan(s => ({ ...s, tranType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Credit">Credit</SelectItem>
                    <SelectItem value="Debit">Debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Account</label>
                <Select value={loan.account} onValueChange={(v) => setLoan(s => ({ ...s, account: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={loan.description} onChange={(e) => setLoan(s => ({ ...s, description: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Reference Id</label>
                <Input value={loan.referenceId} onChange={(e) => setLoan(s => ({ ...s, referenceId: e.target.value }))} />
              </div>

              <div className="lg:col-span-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={addLoanMut.isPending || loan.amount <= 0 || !loan.person}>
                      Add Loan/Lend (Daily + Loans)
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm add loan/lend?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Date: {loan.date}</div>
                      <div>Type: {loan.kind}</div>
                      <div>Person: {loan.person}</div>
                      <div>Amount: {formatINR(loan.amount)}</div>
                      <div>Account: {loan.account}</div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => addLoanMut.mutate()}>
                        Yes, Add
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="mt-2 text-xs text-muted-foreground">
                  Note: Person is stored in Daily’s Place column (schema unchanged).
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* All records table */}
      <Card>
        <CardHeader className="gap-2">
          <CardTitle>All Daily Records</CardTitle>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
            <div className="lg:col-span-4">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Month</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Category Type</label>
              <Select value={categoryType} onValueChange={(v: any) => setCategoryType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Account</label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accountOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Credit/Debit</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["All", "Credit", "Debit"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-10 flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant={onlyInvestments ? "default" : "outline"}
                onClick={() => {
                  setOnlyInvestments((v) => {
                    const next = !v;
                    if (next) setOnlyLoans(false);
                    return next;
                  });
                }}
                disabled={!useTypeSystem}
              >
                Only Investments
              </Button>

              <Button
                size="sm"
                variant={onlyLoans ? "default" : "outline"}
                onClick={() => {
                  setOnlyLoans((v) => {
                    const next = !v;
                    if (next) setOnlyInvestments(false);
                    return next;
                  });
                }}
                disabled={!useTypeSystem}
              >
                Only Loans/Lends
              </Button>

              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>

            <div className="lg:col-span-2 pt-2 text-sm text-muted-foreground lg:text-right">
              Showing <b>{filtered.length}</b> of {records.length}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <ResizableDataTable
            data={filtered}
            columns={columns}
            storageKey="daily-table-widths"
            getRowId={(r) => String(r.id)}
            maxHeight="65vh"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            Click headers (ID/Date) to sort. Drag edges to resize.
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setEditDraft(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Daily Record</DialogTitle></DialogHeader>

          {editing && editDraft && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={editDraft.date} onChange={(e) => setEditDraft(s => s ? ({ ...s, date: e.target.value }) : s)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input type="number" value={editDraft.amount} onChange={(e) => setEditDraft(s => s ? ({ ...s, amount: Number(e.target.value) }) : s)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Input value={editDraft.category} onChange={(e) => setEditDraft(s => s ? ({ ...s, category: e.target.value }) : s)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tran Type</label>
                <Input value={editDraft.tranType} onChange={(e) => setEditDraft(s => s ? ({ ...s, tranType: e.target.value }) : s)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Account</label>
                <Input value={editDraft.account} onChange={(e) => setEditDraft(s => s ? ({ ...s, account: e.target.value }) : s)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  {DAILY_PERSON_LIKE_CATEGORIES.has(editDraft.category) ? "Person (stored in Place column)" : "Place"}
                </label>
                <Input value={editDraft.place} onChange={(e) => setEditDraft(s => s ? ({ ...s, place: e.target.value }) : s)} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={editDraft.description} onChange={(e) => setEditDraft(s => s ? ({ ...s, description: e.target.value }) : s)} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Reference Id</label>
                <Input value={editDraft.referenceId} onChange={(e) => setEditDraft(s => s ? ({ ...s, referenceId: e.target.value }) : s)} />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditing(null); setEditDraft(null); }}>
              Cancel
            </Button>

            {/* Confirm update */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={updateMut.isPending || !editDraft || (editDraft.amount ?? 0) <= 0}>
                  Save
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm update record #{editing?.id}?</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateMut.mutate()}>
                    Yes, Update
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
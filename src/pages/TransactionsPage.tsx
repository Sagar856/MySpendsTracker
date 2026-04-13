import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { addDaily, deleteDaily, listDaily, updateDaily, type DailyRecord } from "../api/daily";
import { addLoanTransaction } from "../api/loans";
import {
  ACCOUNTS,
  FINANCE_CATEGORIES,
  LOAN_CATEGORIES,
  TRAN_TYPES,
  DAILY_PERSON_LIKE_CATEGORIES,
} from "../lib/constants";
import { formatINR, mmddyyyyToISO, safeLower } from "../lib/format";

type FinanceDraft = {
  date: string; // yyyy-mm-dd
  category: string;
  amount: number;
  tranType: string;
  account: string;
  description: string;
  place: string;
  referenceId: string;
};

type LoanDraft = {
  date: string; // yyyy-mm-dd
  kind: "Loan" | "Lend";
  person: string;
  amount: number;
  tranType: "Credit" | "Debit";
  account: string;
  description: string;
  referenceId: string;
};

const todayISO = new Date().toISOString().slice(0, 10);

export default function TransactionsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["daily"],
    queryFn: listDaily,
  });

  const records = data?.records ?? [];

  // ---- Add Finance
  const [finance, setFinance] = useState<FinanceDraft>({
    date: todayISO,
    category: FINANCE_CATEGORIES[0],
    amount: 0,
    tranType: "Debit",
    account: "UPI",
    description: "",
    place: "",
    referenceId: "NA",
  });

  const addFinanceMut = useMutation({
    mutationFn: () => addDaily(finance),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["daily"] });
      setFinance((s) => ({ ...s, amount: 0, description: "", place: "" }));
    },
  });

  // ---- Add Loan/Lend (atomic)
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
      setLoan((s) => ({ ...s, person: "", amount: 0, description: "" }));
    },
  });

  // ---- Search / filter
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const qq = safeLower(q).trim();
    if (!qq) return records;

    return records.filter((r) => {
      const hay = [
        r.id,
        r.date,
        r.category,
        r.tranType,
        r.account,
        r.description,
        r.place,
        r.referenceId,
      ]
        .map((x) => safeLower(x))
        .join(" | ");
      return hay.includes(qq);
    });
  }, [records, q]);

  // ---- Edit dialog state
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

  const totalCredit = useMemo(
    () => filtered.filter((r) => safeLower(r.tranType) === "credit").reduce((a, r) => a + (r.amount || 0), 0),
    [filtered]
  );
  const totalDebit = useMemo(
    () => filtered.filter((r) => safeLower(r.tranType) === "debit").reduce((a, r) => a + (r.amount || 0), 0),
    [filtered]
  );
  const net = totalCredit - totalDebit;

  if (isLoading) return <div>Loading…</div>;
  if (error) return <div className="text-destructive">Failed to load Daily records.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Add finance records or loan/lend records. All entries are stored in Google Sheets.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Credit: {formatINR(totalCredit)}</Badge>
          <Badge variant="secondary">Debit: {formatINR(totalDebit)}</Badge>
          <Badge variant={net >= 0 ? "default" : "destructive"}>Net: {formatINR(net)}</Badge>
        </div>
      </div>

      <Tabs defaultValue="finance" className="w-full">
        <TabsList>
          <TabsTrigger value="finance">Finance Record</TabsTrigger>
          <TabsTrigger value="loan">Loan / Lend</TabsTrigger>
        </TabsList>

        <TabsContent value="finance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Finance Record</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={finance.date} onChange={(e) => setFinance(s => ({ ...s, date: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={finance.category} onValueChange={(v) => setFinance(s => ({ ...s, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINANCE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  value={finance.amount}
                  onChange={(e) => setFinance(s => ({ ...s, amount: Number(e.target.value) }))}
                  min={0}
                />
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

              <div>
                <label className="text-xs text-muted-foreground">Reference Id</label>
                <Input value={finance.referenceId} onChange={(e) => setFinance(s => ({ ...s, referenceId: e.target.value }))} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={finance.description} onChange={(e) => setFinance(s => ({ ...s, description: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Place</label>
                <Input value={finance.place} onChange={(e) => setFinance(s => ({ ...s, place: e.target.value }))} />
              </div>

              <div className="md:col-span-3 flex gap-2">
                <Button
                  onClick={() => addFinanceMut.mutate()}
                  disabled={addFinanceMut.isPending || finance.amount <= 0}
                >
                  {addFinanceMut.isPending ? "Adding…" : "Add Finance Record"}
                </Button>
                {addFinanceMut.isError && (
                  <span className="text-sm text-destructive">Failed: {(addFinanceMut.error as any)?.message}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loan" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Loan / Lend Record</CardTitle>
            </CardHeader>
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
                    // sensible defaults:
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
                <Input value={loan.person} onChange={(e) => setLoan(s => ({ ...s, person: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  value={loan.amount}
                  onChange={(e) => setLoan(s => ({ ...s, amount: Number(e.target.value) }))}
                  min={0}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tran Type</label>
                <Select value={loan.tranType} onValueChange={(v: "Credit" | "Debit") => setLoan(s => ({ ...s, tranType: v }))}>
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

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={loan.description} onChange={(e) => setLoan(s => ({ ...s, description: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Reference Id</label>
                <Input value={loan.referenceId} onChange={(e) => setLoan(s => ({ ...s, referenceId: e.target.value }))} />
              </div>

              <div className="md:col-span-3 flex gap-2">
                <Button
                  onClick={() => addLoanMut.mutate()}
                  disabled={addLoanMut.isPending || loan.amount <= 0 || !loan.person}
                >
                  {addLoanMut.isPending ? "Adding…" : "Add Loan/Lend (Daily + Loans)"}
                </Button>
                {addLoanMut.isError && (
                  <span className="text-sm text-destructive">Failed: {(addLoanMut.error as any)?.message}</span>
                )}
              </div>

              <div className="md:col-span-3 text-xs text-muted-foreground">
                Note: For Loan/Lend records, the <b>Person</b> is stored in Daily’s <b>Place</b> column (same sheet schema).
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>All Daily Records</CardTitle>
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <Input
              placeholder="Search by category, description, place/person, id, account…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="md:max-w-md"
            />
            <div className="text-sm text-muted-foreground">
              Showing <b>{filtered.length}</b> of {records.length}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="w-full overflow-x-auto border rounded-md">
            <div className="min-w-[1100px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>{/* Place/Person */}Place / Person</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.id}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{formatINR(r.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={LOAN_CATEGORIES.includes(r.category as any) ? "secondary" : "outline"}>
                          {r.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.tranType}</TableCell>
                      <TableCell>{r.account}</TableCell>
                      <TableCell className="max-w-[180px] sm:max-w-[260px] truncate">{r.description}</TableCell>
                      <TableCell className="max-w-[140px] sm:max-w-[200px] truncate">{r.place}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{r.referenceId}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          Edit
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={deleteMut.isPending}>
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete record #{r.id}?</AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMut.mutate(r.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No records match the search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setEditDraft(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Daily Record</DialogTitle>
          </DialogHeader>

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
                <div className="text-[11px] text-muted-foreground mt-1">
                  Tip: keep consistent categories for dashboards.
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tran Type</label>
                <Select value={editDraft.tranType} onValueChange={(v) => setEditDraft(s => s ? ({ ...s, tranType: v }) : s)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Account</label>
                <Select value={editDraft.account} onValueChange={(v) => setEditDraft(s => s ? ({ ...s, account: v }) : s)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            <Button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || !editDraft || (editDraft.amount ?? 0) <= 0}
            >
              {updateMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
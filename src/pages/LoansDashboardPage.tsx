import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { listLoans, updateLoan, deleteLoan, type LoanRecord } from "../api/loans";
import { addLoanPayment, listLoanPayments, settleLoan } from "../api/loanPayments";
import { formatINR, mmddyyyyToISO, safeLower } from "../lib/format";
import { ACCOUNTS } from "../lib/constants";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import ResizableDataTable from "@/components/ResizableDataTable";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";

const COLORS = ["#7ccf00", "#9ae600", "#bbf451", "#5ea500", "#497d00", "#3c6300"];
const todayISO = new Date().toISOString().slice(0, 10);

function dateToTs(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function daysSince(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function isSettled(r: LoanRecord) {
  return safeLower(r.status) === "settled" || (r.balanceAmount || 0) <= 0;
}

export default function LoansDashboardPage() {
  const qc = useQueryClient();
  const loansQ = useQuery({ queryKey: ["loans"], queryFn: listLoans });
  const records = loansQ.data?.records ?? [];

  // ---------------- Filters ----------------
  const people = useMemo(
    () => ["All", ...Array.from(new Set(records.map((r) => r.person).filter(Boolean))).sort()],
    [records]
  );
  const loanOrLendOptions = useMemo(
    () => ["All", ...Array.from(new Set(records.map((r) => r.loanOrLend).filter(Boolean))).sort()],
    [records]
  );
  const statusOptions = useMemo(
    () => ["All", ...Array.from(new Set(records.map((r) => r.status).filter(Boolean))).sort()],
    [records]
  );

  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(true);

  const [person, setPerson] = useState("All");
  const [kind, setKind] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return records.filter((r) => {
      if (openOnly && isSettled(r)) return false;

      if (person !== "All" && r.person !== person) return false;
      if (kind !== "All" && r.loanOrLend !== kind) return false;
      if (status !== "All" && r.status !== status) return false;

      if (qq) {
        const hay = `${r.id} ${r.person} ${r.loanOrLend} ${r.status} ${r.description || ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      return true;
    });
  }, [records, openOnly, person, kind, status, q]);

  // ---------------- Metrics ----------------
  const metrics = useMemo(() => {
    const open = filtered.filter((r) => !isSettled(r));

    const loanOutstanding = open
      .filter((r) => r.loanOrLend === "Loan")
      .reduce((a, r) => a + (r.balanceAmount || 0), 0);

    const lendOutstanding = open
      .filter((r) => r.loanOrLend === "Lend")
      .reduce((a, r) => a + (r.balanceAmount || 0), 0);

    return {
      openCount: open.length,
      totalCount: filtered.length,
      loanOutstanding,
      lendOutstanding,
      netOutstanding: lendOutstanding - loanOutstanding,
    };
  }, [filtered]);

  // ---------------- Charts ----------------
  // Outstanding by person (Balance_Amount), stacked Loan vs Lend
  const outstandingByPerson = useMemo(() => {
    const open = filtered.filter((r) => !isSettled(r));
    const map = new Map<string, { name: string; loan: number; lend: number; total: number }>();

    for (const r of open) {
      const key = r.person || "Unknown";
      const cur = map.get(key) || { name: key, loan: 0, lend: 0, total: 0 };

      const amt = r.balanceAmount || 0;
      if (r.loanOrLend === "Loan") cur.loan += amt;
      if (r.loanOrLend === "Lend") cur.lend += amt;

      cur.total = cur.loan + cur.lend;
      map.set(key, cur);
    }

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .reverse(); // reverse for vertical readability
  }, [filtered]);

  const outstandingSplit = useMemo(() => {
    const open = filtered.filter((r) => !isSettled(r));
    const loan = open.filter((r) => r.loanOrLend === "Loan").reduce((a, r) => a + (r.balanceAmount || 0), 0);
    const lend = open.filter((r) => r.loanOrLend === "Lend").reduce((a, r) => a + (r.balanceAmount || 0), 0);
    return [
      { name: "Loan Outstanding", value: loan },
      { name: "Lend Outstanding", value: lend },
    ];
  }, [filtered]);

  const statusSplit = useMemo(() => {
    const settledCount = filtered.filter((r) => isSettled(r)).length;
    const openCount = filtered.length - settledCount;
    return [
      { name: "Open", value: openCount },
      { name: "Settled", value: settledCount },
    ];
  }, [filtered]);

  // ---------------- Edit Loan (Lend&Loan) ----------------
  const [editing, setEditing] = useState<LoanRecord | null>(null);
  const [draft, setDraft] = useState({
    person: "",
    initialDate: todayISO,
    totalAmount: 0,
    loanOrLend: "Loan" as "Loan" | "Lend",
    description: "",
    settledDate: "",
    transferredAmount: 0,
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No editing record");
      return updateLoan(editing.id, draft);
    },
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => deleteLoan(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });

  function openEdit(r: LoanRecord) {
    setEditing(r);
    setDraft({
      person: r.person || "",
      initialDate: mmddyyyyToISO(r.initialDate) || todayISO,
      totalAmount: r.totalAmount || 0,
      loanOrLend: r.loanOrLend === "Lend" ? "Lend" : "Loan",
      description: r.description || "",
      settledDate: mmddyyyyToISO(r.settledDate || "") || "",
      transferredAmount: r.transferredAmount || 0,
    });
  }

  // ---------------- Payments dialog ----------------
  const [payLoan, setPayLoan] = useState<LoanRecord | null>(null);

  // Keep payLoan fresh after loans refetch (so remaining updates immediately)
  useEffect(() => {
    if (!payLoan?.id) return;
    const latest = records.find((r) => r.id === payLoan.id);
    if (latest) setPayLoan(latest);
  }, [records, payLoan?.id]);

  const paymentsQ = useQuery({
    queryKey: ["loanPayments", payLoan?.id],
    queryFn: () => listLoanPayments(payLoan!.id),
    enabled: !!payLoan?.id,
  });
  const payments = paymentsQ.data?.records ?? [];

  const loanTotals = useMemo(() => {
    if (!payLoan) return { total: 0, paid: 0, remaining: 0, pct: 0 };
    const total = payLoan.totalAmount || 0;
    const paid = payLoan.transferredAmount || 0;
    const remaining = Math.max(0, total - paid);
    const pct = total > 0 ? clamp((paid / total) * 100, 0, 100) : 0;
    return { total, paid, remaining, pct };
  }, [payLoan]);

  const [payDate, setPayDate] = useState(todayISO);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>("UPI");
  const [payNote, setPayNote] = useState<string>("");

  // Auto-suggest payment amount when opening dialog or when remaining changes
  useEffect(() => {
    if (!payLoan) return;
    setPayAmount(loanTotals.remaining);
    setPayNote("");
    setPayMethod("UPI");
    setPayDate(todayISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payLoan?.id]);

  useEffect(() => {
    if (!payLoan) return;
    // If user hasn't typed a custom amount (>0), keep syncing to remaining
    setPayAmount((prev) => (prev <= 0 ? loanTotals.remaining : prev));
  }, [loanTotals.remaining, payLoan]);

  const addPaymentMut = useMutation({
    mutationFn: async () => {
      if (!payLoan) throw new Error("No loan selected");
      return addLoanPayment({
        loanId: payLoan.id,
        date: payDate,
        amount: payAmount,
        method: payMethod,
        note: payNote,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["loanPayments", payLoan?.id] });
      await qc.invalidateQueries({ queryKey: ["loans"] });
      setPayNote("");
      // keep amount at remaining (it will recalc after loan refresh)
      setPayAmount(0);
    },
  });

  const settleMut = useMutation({
    mutationFn: async (loanId: number) => {
      return settleLoan({
        loanId,
        date: todayISO,
        method: "UPI",
        note: "Settled from app",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["loans"] });
      if (payLoan?.id) await qc.invalidateQueries({ queryKey: ["loanPayments", payLoan.id] });
    },
  });

  // ---------------- Table ----------------
  const columns = useMemo<ColumnDef<LoanRecord>[]>(() => {
    return [
      { accessorKey: "id", header: "ID", size: 60 },

      {
        id: "initialDate",
        header: "Initial",
        accessorFn: (row) => dateToTs(row.initialDate),
        cell: ({ row }) => row.original.initialDate,
        size: 110,
        meta: { className: "hidden md:table-cell" },
      },

      {
        id: "ageDays",
        header: "Age",
        accessorFn: (row) => daysSince(row.initialDate),
        cell: ({ row }) => {
          const d = daysSince(row.original.initialDate);
          return <span title={`${d} days since initial date`}>{d}d</span>;
        },
        size: 80,
        meta: { className: "hidden lg:table-cell" },
      },

      {
        accessorKey: "person",
        header: "Person",
        size: 180,
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.person}>
            {row.original.person}
          </span>
        ),
      },

      {
        id: "totalAmount",
        header: "Total",
        accessorFn: (row) => row.totalAmount || 0,
        cell: ({ row }) => formatINR(row.original.totalAmount),
        size: 120,
      },

      {
        id: "paidAmount",
        header: "Paid",
        accessorFn: (row) => row.transferredAmount || 0,
        cell: ({ row }) => formatINR(row.original.transferredAmount || 0),
        size: 120,
        meta: { className: "hidden lg:table-cell" },
      },

      {
        id: "balanceAmount",
        header: "Balance",
        accessorFn: (row) => row.balanceAmount || 0,
        cell: ({ row }) => formatINR(row.original.balanceAmount),
        size: 120,
      },

      {
        id: "progress",
        header: "Progress",
        accessorFn: (row) => {
          const t = row.totalAmount || 0;
          const p = row.transferredAmount || 0;
          return t > 0 ? (p / t) * 100 : 0;
        },
        cell: ({ row }) => {
          const t = row.original.totalAmount || 0;
          const p = row.original.transferredAmount || 0;
          const pct = t > 0 ? clamp((p / t) * 100, 0, 100) : 0;

          return (
            <div className="min-w-[140px]">
              <div className="text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
        size: 170,
        meta: { className: "hidden xl:table-cell" },
      },

      {
        accessorKey: "loanOrLend",
        header: "Type",
        size: 90,
        cell: ({ row }) => (
          <Badge variant={row.original.loanOrLend === "Loan" ? "destructive" : "default"}>
            {row.original.loanOrLend}
          </Badge>
        ),
      },

      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <Badge variant={isSettled(row.original) ? "secondary" : "outline"}>
            {isSettled(row.original) ? "Open" : row.original.status || "Open"}
          </Badge>
        ),
      },

      {
        id: "actions",
        header: "Actions",
        size: 340,
        enableResizing: false,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const settled = isSettled(r);

          return (
            <div className="flex justify-end gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setPayLoan(r)}>
                Payments
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={settled || settleMut.isPending}>
                    Settle
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Settle loan #{r.id}?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <div className="text-sm text-muted-foreground">
                    Adds a final payment equal to remaining balance and sets Settled_Date.
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => settleMut.mutate(r.id)}>
                      Yes, Settle
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={deleteMut.isPending}>
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete loan record #{r.id}?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <div className="text-sm text-muted-foreground">
                    This deletes the loan row. Payments in LoanPayments remain unless removed manually.
                  </div>
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
  }, [deleteMut.isPending, settleMut.isPending, payLoan?.id]);

  if (loansQ.isLoading) return <div>Loading…</div>;
  if (loansQ.isError) return <div className="text-destructive">Failed to load Loans data.</div>;

  const resetFilters = () => {
    setQ("");
    setOpenOnly(true);
    setPerson("All");
    setKind("All");
    setStatus("All");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Loans Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Open-only view helps you focus on outstanding items. Use Payments to record partial repayments.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="text-xs text-muted-foreground">Search</label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search person / description / id…"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Person</label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">LoanOrLend</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {loanOrLendOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={openOnly ? "default" : "outline"}
              onClick={() => setOpenOnly((v) => !v)}
            >
              {openOnly ? "Open Only" : "All (Open + Settled)"}
            </Button>

            <Button size="sm" variant="secondary" onClick={resetFilters}>
              Reset
            </Button>

            <div className="ml-auto text-sm text-muted-foreground">
              Showing <b>{filtered.length}</b> records
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Loan Outstanding</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{formatINR(metrics.loanOutstanding)}</div>
            <div className="text-xs text-muted-foreground">Money you owe</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Lend Outstanding</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{formatINR(metrics.lendOutstanding)}</div>
            <div className="text-xs text-muted-foreground">Money others owe you</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Net Outstanding</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-lg font-semibold ${metrics.netOutstanding >= 0 ? "" : "text-destructive"}`}>
              {formatINR(metrics.netOutstanding)}
            </div>
            <div className="text-xs text-muted-foreground">Lend − Loan</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Open Records</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{metrics.openCount}</div>
            <div className="text-xs text-muted-foreground">Out of {metrics.totalCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Outstanding by Person (Balance)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outstandingByPerson} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tickFormatter={(v) => formatINR(Number(v))} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Legend />
                <Bar dataKey="loan" name="Loan" stackId="a" fill="#5ea500" radius={[6, 6, 6, 6]} />
                <Bar dataKey="lend" name="Lend" stackId="a" fill="#7ccf00" radius={[6, 6, 6, 6]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Outstanding Split</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={outstandingSplit} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} label>
                  {outstandingSplit.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Status (Count)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusSplit} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} label>
                  {statusSplit.map((_, i) => (
                    <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>All Loan Records</CardTitle></CardHeader>
        <CardContent>
          <ResizableDataTable
            data={filtered}
            columns={columns}
            storageKey="loans-table-widths"
            getRowId={(r) => String(r.id)}
            maxHeight="65vh"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            Click headers to sort. Drag column edges to resize. Long text is trimmed; hover to see full value.
          </div>
        </CardContent>
      </Card>

      {/* Payments dialog */}
      <Dialog open={!!payLoan} onOpenChange={(v) => { if (!v) setPayLoan(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Payments — Loan #{payLoan?.id} • {payLoan?.person}
            </DialogTitle>
          </DialogHeader>

          {payLoan && (
            <div className="space-y-4">
              {/* Totals */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-semibold">{formatINR(loanTotals.total)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="font-semibold">{formatINR(loanTotals.paid)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Remaining</div>
                  <div className="font-semibold">{formatINR(loanTotals.remaining)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Progress</div>
                  <div className="font-semibold">{loanTotals.pct.toFixed(0)}%</div>
                  <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${loanTotals.pct}%` }} />
                  </div>
                </div>
              </div>

              {/* Add payment */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <Input
                    type="number"
                    min={0}
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                  />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Suggested: {formatINR(loanTotals.remaining)}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Method</label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Note</label>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </div>

                <div className="md:col-span-5 flex flex-wrap gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={addPaymentMut.isPending || payAmount <= 0 || loanTotals.remaining <= 0}>
                        Add Payment
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm add payment?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <div className="text-sm text-muted-foreground">
                        Amount: {formatINR(payAmount)} • Date: {payDate} • Method: {payMethod}
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => addPaymentMut.mutate()}>
                          Yes, Add
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="secondary"
                        disabled={settleMut.isPending || loanTotals.remaining <= 0}
                      >
                        Mark as Settled
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Settle this loan now?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <div className="text-sm text-muted-foreground">
                        This will add a final payment equal to remaining ({formatINR(loanTotals.remaining)}).
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => settleMut.mutate(payLoan.id)}>
                          Yes, Settle
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Payments list */}
              <div className="border rounded-md overflow-hidden">
                <div className="max-h-[40vh] overflow-auto">
                  <table className="w-full text-sm table-fixed">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="p-2 text-left w-[80px]">ID</th>
                        <th className="p-2 text-left w-[120px]">Date</th>
                        <th className="p-2 text-left w-[140px]">Amount</th>
                        <th className="p-2 text-left w-[120px]">Method</th>
                        <th className="p-2 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b">
                          <td className="p-2">{p.id}</td>
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">{formatINR(p.amount)}</td>
                          <td className="p-2">{p.method}</td>
                          <td className="p-2 truncate" title={p.note}>
                            {p.note}
                          </td>
                        </tr>
                      ))}
                      {payments.length === 0 && (
                        <tr>
                          <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                            No payments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPayLoan(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Loan Record</DialogTitle></DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Person</label>
              <Input value={draft.person} onChange={(e) => setDraft((s) => ({ ...s, person: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Initial Date</label>
              <Input type="date" value={draft.initialDate} onChange={(e) => setDraft((s) => ({ ...s, initialDate: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Total Amount</label>
              <Input type="number" value={draft.totalAmount} onChange={(e) => setDraft((s) => ({ ...s, totalAmount: Number(e.target.value) }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">LoanOrLend</label>
              <Select value={draft.loanOrLend} onValueChange={(v: "Loan" | "Lend") => setDraft((s) => ({ ...s, loanOrLend: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Loan">Loan</SelectItem>
                  <SelectItem value="Lend">Lend</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={draft.description} onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Settled Date</label>
              <Input type="date" value={draft.settledDate} onChange={(e) => setDraft((s) => ({ ...s, settledDate: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Transferred Amount</label>
              <Input type="number" value={draft.transferredAmount} onChange={(e) => setDraft((s) => ({ ...s, transferredAmount: Number(e.target.value) }))} />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={updateMut.isPending || !draft.person || draft.totalAmount <= 0}>
                  Save
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm update loan #{editing?.id}?</AlertDialogTitle>
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
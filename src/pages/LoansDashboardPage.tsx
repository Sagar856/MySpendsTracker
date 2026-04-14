import { useMemo, useState } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

import ResizableDataTable from "@/components/ResizableDataTable";

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#7ccf00", "#9ae600", "#bbf451", "#5ea500", "#497d00", "#3c6300"];
const todayISO = new Date().toISOString().slice(0, 10);

function dateToTs(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export default function LoansDashboardPage() {
  const qc = useQueryClient();
  const loansQ = useQuery({ queryKey: ["loans"], queryFn: listLoans });
  const records = loansQ.data?.records ?? [];

  // Filters
  const people = useMemo(
    () => ["All", ...Array.from(new Set(records.map(r => r.person).filter(Boolean))).sort()],
    [records]
  );
  const loanOrLendOptions = useMemo(
    () => ["All", ...Array.from(new Set(records.map(r => r.loanOrLend).filter(Boolean))).sort()],
    [records]
  );
  const statusOptions = useMemo(
    () => ["All", ...Array.from(new Set(records.map(r => r.status).filter(Boolean))).sort()],
    [records]
  );

  const [person, setPerson] = useState("All");
  const [kind, setKind] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (person !== "All" && r.person !== person) return false;
      if (kind !== "All" && r.loanOrLend !== kind) return false;
      if (status !== "All" && r.status !== status) return false;
      return true;
    });
  }, [records, person, kind, status]);

  // Metrics
  const outstanding = useMemo(() => {
    const open = filtered.filter(r => safeLower(r.status) !== "settled");
    const loan = open.filter(r => r.loanOrLend === "Loan").reduce((a, r) => a + (r.balanceAmount || 0), 0);
    const lend = open.filter(r => r.loanOrLend === "Lend").reduce((a, r) => a + (r.balanceAmount || 0), 0);
    return { loan, lend, count: filtered.length };
  }, [filtered]);

  // Charts
  const byPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.person || "Unknown", (map.get(r.person || "Unknown") || 0) + (r.totalAmount || 0));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [filtered]);

  const loanLendCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.loanOrLend || "Unknown", (map.get(r.loanOrLend || "Unknown") || 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.status || "Unknown", (map.get(r.status || "Unknown") || 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Edit Loan (Lend&Loan)
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
      loanOrLend: (r.loanOrLend === "Lend" ? "Lend" : "Loan"),
      description: r.description || "",
      settledDate: mmddyyyyToISO(r.settledDate || "") || "",
      transferredAmount: r.transferredAmount || 0,
    });
  }

  // Payments dialog
  const [payLoan, setPayLoan] = useState<LoanRecord | null>(null);
  const paymentsQ = useQuery({
    queryKey: ["loanPayments", payLoan?.id],
    queryFn: () => listLoanPayments(payLoan!.id),
    enabled: !!payLoan?.id,
  });

  const payments = paymentsQ.data?.records ?? [];

  const [payDate, setPayDate] = useState(todayISO);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>("UPI");
  const [payNote, setPayNote] = useState<string>("");

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
      setPayAmount(0);
      setPayNote("");
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
    },
  });

  const columns = useMemo<ColumnDef<LoanRecord>[]>(() => {
    return [
      { accessorKey: "id", header: "ID", size: 60 },
      {
        id: "initialDate",
        header: "Initial Date",
        accessorFn: (row) => dateToTs(row.initialDate),
        cell: ({ row }) => row.original.initialDate,
        size: 100,
        meta: { className: "hidden md:table-cell" },
      },
      {
        accessorKey: "person",
        header: "Person",
        size: 180,
        cell: ({ row }) => <span className="block truncate" title={row.original.person}>{row.original.person}</span>,
      },
      {
        id: "totalAmount",
        header: "Total",
        size: 100,
        cell: ({ row }) => formatINR(row.original.totalAmount),
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
        id: "balanceAmount",
        header: "Balance",
        size: 100,
        cell: ({ row }) => formatINR(row.original.balanceAmount),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 140,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => <span className="block truncate" title={row.original.status}>{row.original.status}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        size: 320,
        enableResizing: false,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const isSettled = safeLower(r.status) === "settled" || (r.balanceAmount || 0) <= 0;

          return (
            <div className="flex justify-end gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { setPayLoan(r); }}>
                Payments
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={isSettled || settleMut.isPending}>
                    Mark as settled
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Settle loan #{r.id}?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <div className="text-sm text-muted-foreground">
                    This will add a final payment equal to the remaining balance and set Settled_Date.
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
                    This deletes the loan row. Payments in LoanPayments will remain unless you remove them manually.
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
  }, [deleteMut.isPending, settleMut.isPending]);

  if (loansQ.isLoading) return <div>Loading…</div>;
  if (loansQ.isError) return <div className="text-destructive">Failed to load Loans data.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Loans Dashboard</h1>
        <p className="text-sm text-muted-foreground">Now supports repayments + settle from app.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Person</label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {people.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">LoanOrLend</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {loanOrLendOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-3 flex gap-2 flex-wrap">
            <Badge variant="secondary">Loan Outstanding: {formatINR(outstanding.loan)}</Badge>
            <Badge variant="secondary">Lend Outstanding: {formatINR(outstanding.lend)}</Badge>
            <Badge variant="outline">Records: {outstanding.count}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Amount by Person (Total_Amount)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPerson}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Bar dataKey="value" fill="#7ccf00" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Loan vs Lend (Count)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={loanLendCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} label>
                  {loanLendCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

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
            Click headers (ID/Initial Date) to sort. Drag edges to resize.
          </div>
        </CardContent>
      </Card>

      {/* Payments dialog */}
      <Dialog open={!!payLoan} onOpenChange={(v) => { if (!v) setPayLoan(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payments — Loan #{payLoan?.id}</DialogTitle>
          </DialogHeader>

          {payLoan && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <Input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Method</label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Note</label>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </div>

                <div className="md:col-span-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={addPaymentMut.isPending || payAmount <= 0}>
                        Add Payment
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm add payment?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <div className="text-sm text-muted-foreground">
                        Amount: {formatINR(payAmount)} • Date: {payDate}
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => addPaymentMut.mutate()}>
                          Yes, Add
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

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
                          <td className="p-2 truncate" title={p.note}>{p.note}</td>
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
              <Input value={draft.person} onChange={(e) => setDraft(s => ({ ...s, person: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Initial Date</label>
              <Input type="date" value={draft.initialDate} onChange={(e) => setDraft(s => ({ ...s, initialDate: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Total Amount</label>
              <Input type="number" value={draft.totalAmount} onChange={(e) => setDraft(s => ({ ...s, totalAmount: Number(e.target.value) }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">LoanOrLend</label>
              <Select value={draft.loanOrLend} onValueChange={(v: "Loan" | "Lend") => setDraft(s => ({ ...s, loanOrLend: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Loan">Loan</SelectItem>
                  <SelectItem value="Lend">Lend</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={draft.description} onChange={(e) => setDraft(s => ({ ...s, description: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Settled Date</label>
              <Input type="date" value={draft.settledDate} onChange={(e) => setDraft(s => ({ ...s, settledDate: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Transferred Amount</label>
              <Input type="number" value={draft.transferredAmount} onChange={(e) => setDraft(s => ({ ...s, transferredAmount: Number(e.target.value) }))} />
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
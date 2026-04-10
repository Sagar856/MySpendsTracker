import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listLoans, updateLoan, deleteLoan, type LoanRecord } from "../api/loans";
import { formatINR, mmddyyyyToISO, safeLower } from "../lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#9333ea", "#0ea5e9"];
const todayISO = new Date().toISOString().slice(0, 10);

export default function LoansDashboardPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["loans"], queryFn: listLoans });
  const records = data?.records ?? [];

  // Filters
  const people = useMemo(() => ["All", ...Array.from(new Set(records.map(r => r.person).filter(Boolean))).sort()], [records]);
  const loanOrLendOptions = useMemo(() => ["All", ...Array.from(new Set(records.map(r => r.loanOrLend).filter(Boolean))).sort()], [records]);
  const statusOptions = useMemo(() => ["All", ...Array.from(new Set(records.map(r => r.status).filter(Boolean))).sort()], [records]);

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

  // Edit / delete (Loans sheet)
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

  if (isLoading) return <div>Loading…</div>;
  if (error) return <div className="text-destructive">Failed to load Loans data.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Loans Dashboard</h1>
        <p className="text-sm text-muted-foreground">Based on Lend&Loan sheet.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

          <div className="md:col-span-3 flex gap-2 flex-wrap">
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
                <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
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

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Status Distribution (Count)</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} label>
                  {statusCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
          <div className="overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Initial</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>LoanOrLend</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>{r.person}</TableCell>
                    <TableCell>{r.initialDate}</TableCell>
                    <TableCell>{formatINR(r.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={r.loanOrLend === "Loan" ? "destructive" : "default"}>
                        {r.loanOrLend}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatINR(r.balanceAmount)}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={deleteMut.isPending}>Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete loan record #{r.id}?</AlertDialogTitle>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMut.mutate(r.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No records match the filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
              <div className="text-[11px] text-muted-foreground mt-1">Leave empty if not settled.</div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Transferred Amount</label>
              <Input
                type="number"
                value={draft.transferredAmount}
                onChange={(e) => setDraft(s => ({ ...s, transferredAmount: Number(e.target.value) }))}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || !draft.person || draft.totalAmount <= 0}
            >
              {updateMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
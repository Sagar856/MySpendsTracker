import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDaily } from "../api/daily";
import { deleteBudget, listBudgets, upsertBudget, type BudgetRecord } from "../api/budgets";
import { formatINR, safeLower, mmddyyyyToISO } from "../lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
} from "recharts";

const COLORS = ["#7ccf00", "#9ae600", "#bbf451", "#5ea500", "#497d00", "#3c6300"];

function yearMonthFromDailyDate(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  return iso ? iso.slice(0, 7) : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ProgressRow({
  category,
  spent,
  budget,
}: {
  category: string;
  spent: number;
  budget: number;
}) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const barPct = clamp(pct, 0, 100);

  const over = budget > 0 && spent > budget;
  const near = budget > 0 && spent / budget >= 0.85 && spent <= budget;

  const barClass = over
    ? "bg-destructive"
    : near
      ? "bg-primary/80"
      : "bg-primary";

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate" title={category}>{category}</div>
          <div className="text-xs text-muted-foreground">
            Spent {formatINR(spent)} / Budget {formatINR(budget)}
          </div>
        </div>

        <Badge variant={over ? "destructive" : "secondary"}>
          {budget > 0 ? `${pct.toFixed(0)}%` : "—"}
        </Badge>
      </div>

      <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${barPct}%` }} />
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        {budget === 0 ? (
          <span>Set a budget to see progress.</span>
        ) : over ? (
          <span className="text-destructive">
            Over by {formatINR(spent - budget)}
          </span>
        ) : (
          <span>Remaining {formatINR(budget - spent)}</span>
        )}
      </div>
    </div>
  );
}

export default function MonthlyDashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["daily"],
    queryFn: listDaily,
  });
  const records = data?.records ?? [];

  // Existing filters for "Insights"
  const categories = useMemo(() => {
    const set = new Set(records.map((r) => r.category).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  const tranTypes = useMemo(() => {
    const set = new Set(records.map((r) => r.tranType).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultStartISO = firstOfMonth.toISOString().slice(0, 10);
  const defaultEndISO = today.toISOString().slice(0, 10);

  const [category, setCategory] = useState("All");
  const [tranType, setTranType] = useState("All");
  const [start, setStart] = useState(defaultStartISO);
  const [end, setEnd] = useState(defaultEndISO);

  const filtered = useMemo(() => {
    const s = new Date(start);
    const e = new Date(end);

    return records.filter((r) => {
      if (category !== "All" && r.category !== category) return false;
      if (tranType !== "All" && r.tranType !== tranType) return false;

      const iso = mmddyyyyToISO(r.date);
      if (!iso) return false;
      const d = new Date(iso);
      return d >= s && d <= e;
    });
  }, [records, category, tranType, start, end]);

  const totals = useMemo(() => {
    let credit = 0, debit = 0;
    for (const r of filtered) {
      if (safeLower(r.tranType) === "credit") credit += r.amount || 0;
      else if (safeLower(r.tranType) === "debit") debit += r.amount || 0;
    }
    return { credit, debit, net: credit - debit };
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      map.set(r.category || "NA", (map.get(r.category || "NA") || 0) + (r.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const creditDebitCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const k = r.tranType || "NA";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // -------------------- Budgets --------------------
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);

  const budgetsQ = useQuery({
    queryKey: ["budgets", budgetMonth],
    queryFn: () => listBudgets(budgetMonth),
    enabled: !!budgetMonth,
  });

  const budgets = budgetsQ.data?.records ?? [];

  // spent per category for selected budgetMonth (Debit only)
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (yearMonthFromDailyDate(r.date) !== budgetMonth) continue;
      if (safeLower(r.tranType) !== "debit") continue;
      const cat = r.category || "NA";
      map.set(cat, (map.get(cat) || 0) + (r.amount || 0));
    }
    return map;
  }, [records, budgetMonth]);

  const budgetSummary = useMemo(() => {
    const totalBudget = budgets.reduce((a, b) => a + (b.budgetAmount || 0), 0);
    const totalSpent = budgets.reduce((a, b) => a + (spentByCategory.get(b.category) || 0), 0);
    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent };
  }, [budgets, spentByCategory]);

  const allCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) if (r.category) set.add(r.category);
    for (const b of budgets) if (b.category) set.add(b.category);
    return Array.from(set).sort();
  }, [records, budgets]);

  const [budgetCategory, setBudgetCategory] = useState<string>("");
  const [budgetAmount, setBudgetAmount] = useState<number>(0);

  // set default category once categories available
  useMemo(() => {
    if (!budgetCategory && allCategoryOptions.length) setBudgetCategory(allCategoryOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCategoryOptions.join("|")]);

  const upsertMut = useMutation({
    mutationFn: () =>
      upsertBudget({
        month: budgetMonth,
        category: budgetCategory,
        budgetAmount: Number(budgetAmount || 0),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["budgets", budgetMonth] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBudget(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["budgets", budgetMonth] });
    },
  });

  function onEditBudgetRow(b: BudgetRecord) {
    setEditingBudgetId(b.id);
    setBudgetMonth(b.month);
    setBudgetCategory(b.category);
    setBudgetAmount(b.budgetAmount);
  }

  function cancelEdit() {
    setEditingBudgetId(null);
    setBudgetAmount(0);
  }

  if (isLoading) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Monthly Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Insights from Daily + Budgets progress for a selected month.
        </p>
      </div>

      {/* Insights filters */}
      <Card>
        <CardHeader>
          <CardTitle>Insights Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Tran Type</label>
            <Select value={tranType} onValueChange={setTranType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tranTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Start</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">End</label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>

          <div className="md:col-span-4 flex gap-2 flex-wrap">
            <Badge variant="secondary">Credit: {formatINR(totals.credit)}</Badge>
            <Badge variant="secondary">Debit: {formatINR(totals.debit)}</Badge>
            <Badge variant={totals.net >= 0 ? "default" : "destructive"}>Balance: {formatINR(totals.net)}</Badge>
            <Badge variant="outline">Records: {filtered.length}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Total by Category</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Bar dataKey="value" fill="#7ccf00" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="text-xs text-muted-foreground mt-2">
              Hover to see values. (X labels hidden to stay clean)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Credit vs Debit (Count)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={creditDebitCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} label>
                  {creditDebitCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Budgets section */}
      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-3">
              <label className="text-xs text-muted-foreground">Budget Month</label>
              <Input
                type="month"
                value={budgetMonth}
                onChange={(e) => setBudgetMonth(e.target.value)}
              />
            </div>

            <div className="lg:col-span-4">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={budgetCategory} onValueChange={setBudgetCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <label className="text-xs text-muted-foreground">Budget Amount</label>
              <Input
                type="number"
                min={0}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(Number(e.target.value))}
              />
            </div>

            <div className="lg:col-span-2 flex gap-2">
              <Button
                className="w-full"
                onClick={() => upsertMut.mutate()}
                disabled={!budgetMonth || !budgetCategory || upsertMut.isPending}
              >
                {upsertMut.isPending ? "Saving…" : editingBudgetId ? "Update" : "Save"}
              </Button>

              {editingBudgetId && (
                <Button className="w-full" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
              {editingBudgetId && (
                <Badge variant="outline">Editing: {budgetCategory}</Badge>
              )}
            </div>
          </div>

          {budgetsQ.isError && (
            <div className="text-sm text-destructive">
              Failed to load budgets. Ensure Budgets sheet exists with correct headers.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Total Budget: {formatINR(budgetSummary.totalBudget)}</Badge>
            <Badge variant="secondary">Spent: {formatINR(budgetSummary.totalSpent)}</Badge>
            <Badge variant={budgetSummary.remaining >= 0 ? "default" : "destructive"}>
              Remaining: {formatINR(budgetSummary.remaining)}
            </Badge>
            <Badge variant="outline">Budget Items: {budgets.length}</Badge>
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {budgets.map((b) => (
              <ProgressRow
                key={b.id}
                category={b.category}
                spent={spentByCategory.get(b.category) || 0}
                budget={b.budgetAmount}
              />
            ))}
          </div>

          {/* Budgets list (compact) */}
          {budgets.length > 0 && (
            <div className="border rounded-md p-3 space-y-2">
              <div className="text-sm font-medium">Manage Budgets</div>

              <div className="space-y-2">
                {budgets.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-md p-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={b.category}>{b.category}</div>
                      <div className="text-xs text-muted-foreground">
                        Budget {formatINR(b.budgetAmount)} • Updated {b.updatedAt}
                      </div>
                    </div>

                    <div className="flex gap-2 sm:justify-end">
                      <Button size="sm" variant="outline" onClick={() => onEditBudgetRow(b)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMut.mutate(b.id)}
                        disabled={deleteMut.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground">
                Spent is calculated from Daily for the selected month (Debit only).
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
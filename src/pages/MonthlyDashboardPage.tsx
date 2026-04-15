import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listDaily } from "../api/daily";
import { deleteBudget, listBudgets, upsertBudget, type BudgetRecord } from "../api/budgets";
import { listCategories } from "../api/categories";
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
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
} from "recharts";

type CategoryTypeFilter = "All" | "Expense" | "Income" | "Investment" | "Loan" | "Unknown";
const CATEGORY_TYPE_OPTIONS: CategoryTypeFilter[] = ["All", "Expense", "Income", "Investment", "Loan", "Unknown"];

const COLORS = ["#7ccf00", "#9ae600", "#bbf451", "#5ea500", "#497d00", "#3c6300"];

function yearMonthFromDailyDate(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  return iso ? iso.slice(0, 7) : "";
}

function prevMonth(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toISODateOrEmpty(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  return iso || "";
}

function ProgressRow({ category, spent, budget }: { category: string; spent: number; budget: number }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const barPct = clamp(pct, 0, 100);

  const over = budget > 0 && spent > budget;
  const near = budget > 0 && spent / budget >= 0.85 && spent <= budget;

  const barClass = over ? "bg-destructive" : near ? "bg-primary/80" : "bg-primary";

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate" title={category}>
            {category}
          </div>
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
          <span className="text-destructive">Over by {formatINR(spent - budget)}</span>
        ) : (
          <span>Remaining {formatINR(budget - spent)}</span>
        )}
      </div>
    </div>
  );
}

export default function MonthlyDashboardPage() {
  const qc = useQueryClient();

  const dailyQ = useQuery({ queryKey: ["daily"], queryFn: listDaily });
  const records = dailyQ.data?.records ?? [];

  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: listCategories });
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

  // ---------------- Insights filters ----------------
  const [categoryType, setCategoryType] = useState<CategoryTypeFilter>("All");

  const categoriesByTypeOptions = useMemo(() => {
    const set = new Set(records.map((r) => r.category).filter(Boolean) as string[]);
    const list = Array.from(set).sort();
    if (categoryType === "All") return ["All", ...list];
    return ["All", ...list.filter((c) => getType(c) === categoryType)];
  }, [records, categoryType, categoryTypeByName]);

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

  useEffect(() => {
    setCategory("All");
  }, [categoryType]);

  const filtered = useMemo(() => {
    const s = new Date(start);
    const e = new Date(end);

    return records.filter((r) => {
      if (categoryType !== "All" && useTypeSystem) {
        if (getType(r.category || "NA") !== categoryType) return false;
      }
      if (category !== "All" && r.category !== category) return false;
      if (tranType !== "All" && r.tranType !== tranType) return false;

      const iso = mmddyyyyToISO(r.date);
      if (!iso) return false;
      const d = new Date(iso);
      return d >= s && d <= e;
    });
  }, [records, categoryType, category, tranType, start, end, useTypeSystem, categoryTypeByName]);

  // KPI totals (based on filtered)
  const totals = useMemo(() => {
    let credit = 0,
      debit = 0;
    for (const r of filtered) {
      if (safeLower(r.tranType) === "credit") credit += r.amount || 0;
      else if (safeLower(r.tranType) === "debit") debit += r.amount || 0;
    }
    return { credit, debit, net: credit - debit };
  }, [filtered]);

  // --- Daily flow series (respects start/end because it uses filtered)
  const dailyFlow = useMemo(() => {
    const map = new Map<string, { iso: string; credit: number; debit: number }>();

    for (const r of filtered) {
      const iso = toISODateOrEmpty(r.date);
      if (!iso) continue;

      const cur = map.get(iso) || { iso, credit: 0, debit: 0 };
      if (safeLower(r.tranType) === "credit") cur.credit += r.amount || 0;
      if (safeLower(r.tranType) === "debit") cur.debit += r.amount || 0;
      map.set(iso, cur);
    }

    const arr = Array.from(map.values()).sort((a, b) => a.iso.localeCompare(b.iso));

    // Add net (debit as negative for chart) + label
    return arr.map((x) => ({
      date: x.iso, // YYYY-MM-DD
      credit: x.credit,
      debit: x.debit,
      debitNeg: -x.debit,
      net: x.credit - x.debit,
    }));
  }, [filtered]);

  const dailyFlowWithCumulative = useMemo(() => {
    let running = 0;
    return dailyFlow.map((d) => {
      running += d.net;
      return { ...d, cumulativeNet: running };
    });
  }, [dailyFlow]);

  const avgDailyDebit = useMemo(() => {
    if (!dailyFlow.length) return 0;
    const sumDebit = dailyFlow.reduce((a, d) => a + d.debit, 0);
    return sumDebit / dailyFlow.length;
  }, [dailyFlow]);

  // --- Top categories by amount (abs, based on filtered)
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      map.set(r.category || "NA", (map.get(r.category || "NA") || 0) + (r.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topCategories = useMemo(() => {
    // for vertical chart, reverse so the biggest appears at top
    return byCategory.slice(0, 10).reverse();
  }, [byCategory]);

  // --- Top places/merchants
  const topPlaces = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const place = String(r.place || "").trim();
      if (!place || place.toLowerCase() === "na") continue;
      map.set(place, (map.get(place) || 0) + (r.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .reverse();
  }, [filtered]);

  // --- Credit vs Debit (amount) + counts for tooltip info
  const creditDebitPie = useMemo(() => {
    const creditAmount = totals.credit;
    const debitAmount = totals.debit;
    const creditCount = filtered.filter((r) => safeLower(r.tranType) === "credit").length;
    const debitCount = filtered.filter((r) => safeLower(r.tranType) === "debit").length;

    return [
      { name: "Credit", value: creditAmount, count: creditCount },
      { name: "Debit", value: debitAmount, count: debitCount },
    ];
  }, [totals.credit, totals.debit, filtered]);

  // -------------------- Comparisons (Month vs previous month) --------------------
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [compareMonth, setCompareMonth] = useState(currentMonth);
  const comparePrev = useMemo(() => prevMonth(compareMonth), [compareMonth]);

  function monthTotals(ym: string) {
    let expense = 0;
    let income = 0;

    for (const r of records) {
      if (yearMonthFromDailyDate(r.date) !== ym) continue;
      const amt = r.amount || 0;

      if (useTypeSystem) {
        const t = getType(r.category || "NA");
        if (t === "Expense" && safeLower(r.tranType) === "debit") expense += amt;
        if (t === "Income" && safeLower(r.tranType) === "credit") income += amt;
      } else {
        if (safeLower(r.tranType) === "debit") expense += amt;
        if (safeLower(r.tranType) === "credit") income += amt;
      }
    }

    return { expense, income, net: income - expense };
  }

  const thisM = useMemo(
    () => monthTotals(compareMonth),
    [records, compareMonth, useTypeSystem, categoryTypeByName]
  );
  const prevM = useMemo(
    () => monthTotals(comparePrev),
    [records, comparePrev, useTypeSystem, categoryTypeByName]
  );

  const topExpenseChanges = useMemo(() => {
    const catSet = new Set<string>();
    for (const r of records) {
      if (!r.category) continue;
      const t = useTypeSystem ? getType(r.category) : "Expense";
      if (t === "Expense") catSet.add(r.category);
    }

    const spendByCat = (ym: string) => {
      const map = new Map<string, number>();
      for (const r of records) {
        if (yearMonthFromDailyDate(r.date) !== ym) continue;
        if (safeLower(r.tranType) !== "debit") continue;
        const cat = r.category || "NA";
        const t = useTypeSystem ? getType(cat) : "Expense";
        if (t !== "Expense") continue;
        map.set(cat, (map.get(cat) || 0) + (r.amount || 0));
      }
      return map;
    };

    const a = spendByCat(compareMonth);
    const b = spendByCat(comparePrev);

    const rows = Array.from(catSet).map((cat) => {
      const cur = a.get(cat) || 0;
      const prev = b.get(cat) || 0;
      const diff = cur - prev;
      const pct = prev > 0 ? (diff / prev) * 100 : null;
      return { cat, cur, prev, diff, pct };
    });

    return rows
      .filter((r) => r.cur > 0 || r.prev > 0)
      .sort((x, y) => y.diff - x.diff)
      .slice(0, 8);
  }, [records, compareMonth, comparePrev, useTypeSystem, categoryTypeByName]);

  // -------------------- Budgets --------------------
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);

  const budgetsQ = useQuery({
    queryKey: ["budgets", budgetMonth],
    queryFn: () => listBudgets(budgetMonth),
    enabled: !!budgetMonth,
  });
  const budgets = budgetsQ.data?.records ?? [];

  const activeExpenseCategories = useMemo(() => {
    return categoryConfig
      .filter((c) => c.active && c.type === "Expense")
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.category.localeCompare(b.category))
      .map((c) => c.category);
  }, [categoryConfig]);

  const budgetCategoryOptions = useMemo(() => {
    if (activeExpenseCategories.length) return activeExpenseCategories;
    return Array.from(new Set(records.map((r) => r.category).filter(Boolean))).sort();
  }, [activeExpenseCategories, records]);

  const [budgetCategory, setBudgetCategory] = useState<string>("");
  const [budgetAmount, setBudgetAmount] = useState<number>(0);

  useEffect(() => {
    if (editingBudgetId) return;
    if (!budgetCategoryOptions.length) return;
    if (!budgetCategory || !budgetCategoryOptions.includes(budgetCategory)) {
      setBudgetCategory(budgetCategoryOptions[0]);
    }
  }, [budgetCategoryOptions, budgetCategory, editingBudgetId]);

  // ✅ spent calc uses Expense category type (not just Debit)
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (yearMonthFromDailyDate(r.date) !== budgetMonth) continue;
      if (safeLower(r.tranType) !== "debit") continue;

      const cat = r.category || "NA";
      if (useTypeSystem && getType(cat) !== "Expense") continue;

      map.set(cat, (map.get(cat) || 0) + (r.amount || 0));
    }
    return map;
  }, [records, budgetMonth, useTypeSystem, categoryTypeByName]);

  const budgetSummary = useMemo(() => {
    const totalBudget = budgets.reduce((a, b) => a + (b.budgetAmount || 0), 0);
    const totalSpent = budgets.reduce((a, b) => a + (spentByCategory.get(b.category) || 0), 0);
    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent };
  }, [budgets, spentByCategory]);

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

  if (dailyQ.isLoading) return <div>Loading…</div>;
  if (dailyQ.isError) return <div className="text-destructive">Failed to load Daily data.</div>;

  const noFilteredData = filtered.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Monthly Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Enhanced charts respect your selected date range and filters.
        </p>
      </div>

      {/* Insights filters */}
      <Card>
        <CardHeader><CardTitle>Insights Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Category Type</label>
            <Select value={categoryType} onValueChange={(v: any) => setCategoryType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoriesByTypeOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

          <div className="md:col-span-5 flex gap-2 flex-wrap">
            <Badge variant="secondary">Credit: {formatINR(totals.credit)}</Badge>
            <Badge variant="secondary">Debit: {formatINR(totals.debit)}</Badge>
            <Badge variant={totals.net >= 0 ? "default" : "destructive"}>Net: {formatINR(totals.net)}</Badge>
            <Badge variant="outline">Records: {filtered.length}</Badge>
            <Badge variant="outline">Avg Daily Debit: {formatINR(avgDailyDebit)}</Badge>
          </div>
        </CardContent>
      </Card>

      {noFilteredData ? (
        <Card>
          <CardHeader><CardTitle>No Data</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No records match the selected filters/date range.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Daily flow + cumulative */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Daily Flow (Credit / Debit / Net)</CardTitle></CardHeader>
              <CardContent style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyFlow}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip
                      formatter={(v: any, name: any) => {
                        const key = String(name);
                        if (key === "debitNeg") return null;
                        return [formatINR(Number(v)), key];
                      }}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="credit" name="Credit" fill="#7ccf00" radius={[4, 4, 0, 0]} />
                    {/* debit as negative so it shows below axis */}
                    <Bar dataKey="debitNeg" name="Debit" fill="#5ea500" radius={[0, 0, 4, 4]} />
                    <Line type="monotone" dataKey="net" name="Net" stroke="#3c6300" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Cumulative Net (Running)</CardTitle></CardHeader>
              <CardContent style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyFlowWithCumulative}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip
                      formatter={(v: any) => formatINR(Number(v))}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeNet"
                      name="Cumulative Net"
                      stroke="#7ccf00"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top categories + places + pie */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-1">
              <CardHeader><CardTitle>Credit vs Debit (Amount)</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={creditDebitPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      label
                    >
                      {creditDebitPie.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any, _name: any, item: any) => {
                        const count = item?.payload?.count ?? 0;
                        return [`${formatINR(Number(v))} (${count} txns)`, "Amount"];
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader><CardTitle>Top Categories (Amount)</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCategories} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tickFormatter={(v) => formatINR(Number(v))} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                    <Bar dataKey="value" fill="#7ccf00" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader><CardTitle>Top Places / Merchants (Amount)</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPlaces} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tickFormatter={(v) => formatINR(Number(v))} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                    <Bar dataKey="value" fill="#5ea500" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Budgets section */}
      <Card>
        <CardHeader><CardTitle>Budgets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-3">
              <label className="text-xs text-muted-foreground">Budget Month</label>
              <Input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} />
            </div>

            <div className="lg:col-span-4">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={budgetCategory} onValueChange={setBudgetCategory} disabled={!!editingBudgetId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {budgetCategoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <label className="text-xs text-muted-foreground">Budget Amount</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={budgetAmount === 0 ? "" : budgetAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  setBudgetAmount(v === "" ? 0 : Number(v));
                }}
              />
            </div>

            <div className="lg:col-span-2 flex gap-2">
              <Button
                className="w-full"
                onClick={() => upsertMut.mutate()}
                disabled={!budgetMonth || !budgetCategory || upsertMut.isPending || Number(budgetAmount) <= 0}
              >
                {upsertMut.isPending ? "Saving…" : editingBudgetId ? "Update" : "Save"}
              </Button>

              {editingBudgetId && (
                <Button className="w-full" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>

            {editingBudgetId && (
              <div className="lg:col-span-12">
                <Badge variant="outline">Editing: {budgetCategory}</Badge>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Total Budget: {formatINR(budgetSummary.totalBudget)}</Badge>
            <Badge variant="secondary">Spent: {formatINR(budgetSummary.totalSpent)}</Badge>
            <Badge variant={budgetSummary.remaining >= 0 ? "default" : "destructive"}>
              Remaining: {formatINR(budgetSummary.remaining)}
            </Badge>
            <Badge variant="outline">Budget Items: {budgets.length}</Badge>
          </div>

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
                Spent is calculated from Daily for the selected month (Debit + Expense categories only).
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Compare Month</label>
              <Input type="month" value={compareMonth} onChange={(e) => setCompareMonth(e.target.value)} />
            </div>

            <div className="md:col-span-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{compareMonth} Expense: {formatINR(thisM.expense)}</Badge>
              <Badge variant="secondary">{compareMonth} Income: {formatINR(thisM.income)}</Badge>
              <Badge variant={thisM.net >= 0 ? "default" : "destructive"}>{compareMonth} Net: {formatINR(thisM.net)}</Badge>

              <Badge variant="outline">Prev ({comparePrev}) Expense: {formatINR(prevM.expense)}</Badge>
              <Badge variant="outline">Prev ({comparePrev}) Income: {formatINR(prevM.income)}</Badge>
            </div>
          </div>

          {!useTypeSystem && (
            <div className="text-xs text-muted-foreground">
              Tip: Configure category types in Settings → Categories for accurate Expense/Income comparison. Using Credit/Debit fallback right now.
            </div>
          )}

          <div className="border rounded-md p-3">
            <div className="font-medium mb-2">Top expense category changes (vs previous month)</div>
            <div className="space-y-2">
              {topExpenseChanges.map((r) => (
                <div key={r.cat} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={r.cat}>{r.cat}</div>
                    <div className="text-xs text-muted-foreground">
                      Prev {formatINR(r.prev)} → Now {formatINR(r.cur)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={r.diff >= 0 ? "" : "text-destructive"}>
                      {r.diff >= 0 ? "+" : ""}{formatINR(r.diff)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.pct === null ? "New" : `${r.pct.toFixed(0)}%`}
                    </div>
                  </div>
                </div>
              ))}
              {topExpenseChanges.length === 0 && (
                <div className="text-sm text-muted-foreground">No data.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
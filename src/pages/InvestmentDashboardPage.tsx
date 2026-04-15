import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { listDaily } from "../api/daily";
import { listCategories } from "../api/categories";
import { FALLBACK_INVESTMENT_CATEGORIES } from "../lib/constants";
import { formatINR, safeLower, mmddyyyyToISO } from "../lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

function parseMMDDYYYY(s: string) {
  const m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODateOrEmpty(mmddyyyy: string) {
  const iso = mmddyyyyToISO(mmddyyyy);
  return iso || "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function InvestmentDashboardPage() {
  const dailyQ = useQuery({ queryKey: ["daily"], queryFn: listDaily });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const all = dailyQ.data?.records ?? [];
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

  // Category Type filter (near Category)
  const [categoryType, setCategoryType] = useState<CategoryTypeFilter>("Investment");

  // If type system is not available, keep this dashboard investment-only (fallback)
  useEffect(() => {
    if (!useTypeSystem) setCategoryType("Investment");
  }, [useTypeSystem]);

  // Build category list for selected type
  const categoriesForType = useMemo(() => {
    if (!useTypeSystem) return [...FALLBACK_INVESTMENT_CATEGORIES];

    if (categoryType === "All") {
      return Array.from(new Set(all.map((r) => r.category).filter(Boolean))).sort();
    }

    if (categoryType === "Unknown") {
      const set = new Set<string>();
      for (const r of all) {
        if (!r.category) continue;
        if (!categoryTypeByName.has(r.category)) set.add(r.category);
      }
      return Array.from(set).sort();
    }

    const set = new Set<string>();
    for (const r of all) {
      if (!r.category) continue;
      if (getType(r.category) === categoryType) set.add(r.category);
    }
    return Array.from(set).sort();
  }, [useTypeSystem, categoryType, all, categoryTypeByName]);

  const categoryOptions = useMemo(() => ["All", ...categoriesForType], [categoriesForType]);
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    setCategory("All");
  }, [categoryType]);

  // Dataset filtered by type + category
  const baseRecords = useMemo(() => {
    if (!useTypeSystem) {
      const set = new Set(FALLBACK_INVESTMENT_CATEGORIES);
      return all.filter((r) => set.has(r.category as any));
    }

    if (categoryType === "All") return all;

    if (categoryType === "Unknown") {
      return all.filter((r) => r.category && !categoryTypeByName.has(r.category));
    }

    return all.filter((r) => getType(r.category || "NA") === categoryType);
  }, [all, useTypeSystem, categoryType, categoryTypeByName]);

  const records = useMemo(() => {
    if (category === "All") return baseRecords;
    return baseRecords.filter((r) => r.category === category);
  }, [baseRecords, category]);

  // Tran type list
  const tranTypes = useMemo(() => {
    const set = new Set(records.map((r) => r.tranType).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  // Date range + tran filter
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [tranType, setTranType] = useState("All");
  const [start, setStart] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));

  const filtered = useMemo(() => {
    const s = new Date(start);
    const e = new Date(end);

    return records.filter((r) => {
      if (tranType !== "All" && r.tranType !== tranType) return false;
      const d = parseMMDDYYYY(r.date);
      if (!d) return false;
      return d >= s && d <= e;
    });
  }, [records, tranType, start, end]);

  // ---- Totals (respects filters)
  const totals = useMemo(() => {
    let credit = 0;
    let debit = 0;

    for (const r of filtered) {
      if (safeLower(r.tranType) === "credit") credit += r.amount || 0;
      else if (safeLower(r.tranType) === "debit") debit += r.amount || 0;
    }

    // For investments, a useful interpretation:
    // - Debit = Invested
    // - Credit = Redeemed / Returned
    // - Net Invested = Debit - Credit
    return { credit, debit, netInvested: debit - credit };
  }, [filtered]);

  // ---- Daily flow (Credit/Debit per day) + cumulative net invested (Debit - Credit)
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

    let running = 0;
    return arr.map((x) => {
      const netInvestedDay = x.debit - x.credit;
      running += netInvestedDay;
      return {
        date: x.iso,
        invested: x.debit,
        redeemed: x.credit,
        redeemedNeg: -x.credit, // show below axis if you want
        netInvestedDay,
        cumulativeNetInvested: running,
      };
    });
  }, [filtered]);

  const avgDailyInvested = useMemo(() => {
    if (!dailyFlow.length) return 0;
    const sum = dailyFlow.reduce((a, d) => a + d.invested, 0);
    return sum / dailyFlow.length;
  }, [dailyFlow]);

  // ---- Category split by invested amount (Debit only)
  const investedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if (safeLower(r.tranType) !== "debit") continue;
      const cat = r.category || "NA";
      map.set(cat, (map.get(cat) || 0) + (r.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topInvestedCategories = useMemo(() => investedByCategory.slice(0, 10).reverse(), [investedByCategory]);

  // ---- Top descriptions by invested amount (Debit only)
  const investedByDescription = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if (safeLower(r.tranType) !== "debit") continue;
      const desc = String(r.description || "").trim();
      if (!desc || desc.toLowerCase() === "na") continue;
      map.set(desc, (map.get(desc) || 0) + (r.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .reverse();
  }, [filtered]);

  // ---- Credit vs Debit by amount (pie)
  const creditDebitPie = useMemo(() => {
    const creditCount = filtered.filter((r) => safeLower(r.tranType) === "credit").length;
    const debitCount = filtered.filter((r) => safeLower(r.tranType) === "debit").length;

    return [
      { name: "Invested (Debit)", value: totals.debit, count: debitCount },
      { name: "Redeemed (Credit)", value: totals.credit, count: creditCount },
    ];
  }, [totals.debit, totals.credit, filtered]);

  if (dailyQ.isLoading) return <div>Loading…</div>;
  if (dailyQ.isError) return <div className="text-destructive">Failed to load Daily data.</div>;

  const noData = filtered.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Investment Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Charts respect the filters (including Start/End). Invested = <b>Debit</b>, Redeemed = <b>Credit</b>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Category Type</label>
            <Select value={categoryType} onValueChange={(v: any) => setCategoryType(v)} disabled={!useTypeSystem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!useTypeSystem && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Configure Settings → Categories to enable Category Type filtering.
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Tran Type</label>
            <Select value={tranType} onValueChange={setTranType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tranTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
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
            <Badge variant="secondary">Invested (Debit): {formatINR(totals.debit)}</Badge>
            <Badge variant="secondary">Redeemed (Credit): {formatINR(totals.credit)}</Badge>
            <Badge variant={totals.netInvested >= 0 ? "default" : "destructive"}>
              Net Invested: {formatINR(totals.netInvested)}
            </Badge>
            <Badge variant="outline">Records: {filtered.length}</Badge>
            <Badge variant="outline">Avg Daily Invested: {formatINR(avgDailyInvested)}</Badge>
          </div>
        </CardContent>
      </Card>

      {noData ? (
        <Card>
          <CardHeader><CardTitle>No Data</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No investment records match the selected filters/date range.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Daily flow + cumulative net invested */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Daily Investment Flow</CardTitle></CardHeader>
              <CardContent style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyFlow}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip
                      formatter={(v: any, name: any) => {
                        const key = String(name);
                        if (key === "redeemedNeg") return null;
                        return [formatINR(Number(v)), key];
                      }}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="invested" name="Invested (Debit)" fill="#7ccf00" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="redeemed" name="Redeemed (Credit)" fill="#5ea500" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="netInvestedDay"
                      name="Net Invested (Day)"
                      stroke="#3c6300"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Cumulative Net Invested</CardTitle></CardHeader>
              <CardContent style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyFlow}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip
                      formatter={(v: any) => formatINR(Number(v))}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeNetInvested"
                      name="Cumulative Net Invested"
                      stroke="#7ccf00"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Split + top lists */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-1">
              <CardHeader><CardTitle>Invested vs Redeemed (Amount)</CardTitle></CardHeader>
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
              <CardHeader><CardTitle>Top Categories (Invested - Debit)</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topInvestedCategories} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tickFormatter={(v) => formatINR(Number(v))} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                    <Bar dataKey="value" fill="#7ccf00" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader><CardTitle>Top Descriptions (Invested - Debit)</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={investedByDescription} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tickFormatter={(v) => formatINR(Number(v))} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                    <Bar dataKey="value" fill="#5ea500" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
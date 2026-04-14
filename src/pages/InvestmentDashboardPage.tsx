import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { listDaily } from "../api/daily";
import { listCategories } from "../api/categories";
import { FALLBACK_INVESTMENT_CATEGORIES } from "../lib/constants";
import { formatINR, safeLower } from "../lib/format";

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
    // If no config, we can only reliably show fallback investment categories
    if (!useTypeSystem) return [...FALLBACK_INVESTMENT_CATEGORIES];

    if (categoryType === "All") {
      // show all distinct categories seen in Daily (better UX than only config)
      return Array.from(new Set(all.map((r) => r.category).filter(Boolean))).sort();
    }

    if (categoryType === "Unknown") {
      // categories that appear in Daily but not in config
      const set = new Set<string>();
      for (const r of all) {
        if (!r.category) continue;
        if (!categoryTypeByName.has(r.category)) set.add(r.category);
      }
      return Array.from(set).sort();
    }

    // Expense / Income / Investment / Loan
    const set = new Set<string>();
    for (const r of all) {
      if (!r.category) continue;
      if (getType(r.category) === categoryType) set.add(r.category);
    }
    return Array.from(set).sort();
  }, [useTypeSystem, categoryType, all, categoryTypeByName]);

  const categoryOptions = useMemo(() => ["All", ...categoriesForType], [categoriesForType]);
  const [category, setCategory] = useState<string>("All");

  // reset invalid selection if type changes
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

  const totals = useMemo(() => {
    let credit = 0,
      debit = 0;
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

  const tranCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const k = r.tranType || "NA";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  if (dailyQ.isLoading) return <div>Loading…</div>;
  if (dailyQ.isError) return <div className="text-destructive">Failed to load Daily data.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Investment Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Now supports <b>Category Type</b> filtering. If Config_Categories is not set, it falls back to Investment only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Category Type</label>
            <Select
              value={categoryType}
              onValueChange={(v: any) => setCategoryType(v)}
              disabled={!useTypeSystem}
            >
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
            <Badge variant="secondary">Credit: {formatINR(totals.credit)}</Badge>
            <Badge variant="secondary">Debit: {formatINR(totals.debit)}</Badge>
            <Badge variant={totals.net >= 0 ? "default" : "destructive"}>
              Net Flow: {formatINR(totals.net)}
            </Badge>
            <Badge variant="outline">Records: {filtered.length}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Total by Category</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Bar dataKey="value" fill="#7ccf00" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tran Type Distribution (Count)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tranCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} label>
                  {tranCounts.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
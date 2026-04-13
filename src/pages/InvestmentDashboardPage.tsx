import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDaily } from "../api/daily";
import { INVESTMENT_CATEGORIES } from "../lib/constants";
import { formatINR, safeLower } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#7ccf00", "#9ae600", "#bbf451", "#5ea500", "#497d00", "#3c6300"];

function parseMMDDYYYY(s: string) {
  const m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function InvestmentDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["daily"], queryFn: listDaily });
  const all = data?.records ?? [];

  const records = useMemo(
    () => all.filter((r) => INVESTMENT_CATEGORIES.includes(r.category as any)),
    [all]
  );

  const categories = ["All", ...INVESTMENT_CATEGORIES];

  const tranTypes = useMemo(() => {
    const set = new Set(records.map(r => r.tranType).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [category, setCategory] = useState("All");
  const [tranType, setTranType] = useState("All");
  const [start, setStart] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));

  const filtered = useMemo(() => {
    const s = new Date(start);
    const e = new Date(end);
    return records.filter((r) => {
      if (category !== "All" && r.category !== category) return false;
      if (tranType !== "All" && r.tranType !== tranType) return false;
      const d = parseMMDDYYYY(r.date);
      if (!d) return false;
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
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const tranCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const k = r.tranType || "NA";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  if (isLoading) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Investment Dashboard</h1>
        <p className="text-sm text-muted-foreground">Based on Inv_SIP, Inv_Stocks, Inv_Others categories.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
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
            <Badge variant={totals.net >= 0 ? "default" : "destructive"}>Net Flow: {formatINR(totals.net)}</Badge>
            <Badge variant="outline">Records: {filtered.length}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Total by Investment Category</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tran Type Distribution (Count)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tranCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} label>
                  {tranCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
/**
 * صفحة الذكاء الاصطناعي — تحليلات محلية بدون API خارجي
 * تشمل: تنبؤ المبيعات · تنبيهات المخزون · تحليل العملاء · تحليل الأرباح · المساعد الذكي
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  BrainCircuit, TrendingUp, Package, Users, Banknote,
  MessageSquare, Send, AlertTriangle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Lightbulb, RefreshCw,
  ShieldAlert, Info,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ── ألوان الرسوم البيانية ────────────────────────────────────────────────────
const PALETTE = ["#1e2a4a", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// ── دالة تنسيق العملة ────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

// ── تحويل تاريخ ISO إلى شهر/سنة ────────────────────────────────────────────
function toMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ── خوارزمية التنبؤ البسيطة (Moving Average + Trend) ───────────────────────
function forecast(history: number[], steps = 3): number[] {
  if (history.length === 0) return Array(steps).fill(0);
  if (history.length < 3) {
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    return Array(steps).fill(Math.round(avg));
  }
  const window = Math.min(4, history.length);
  const recent = history.slice(-window);
  const ma = recent.reduce((a, b) => a + b, 0) / window;
  // حساب الاتجاه (slope) من نقطتين
  const slope = (recent[recent.length - 1] - recent[0]) / Math.max(1, recent.length - 1);
  return Array.from({ length: steps }, (_, i) =>
    Math.max(0, Math.round(ma + slope * (i + 1)))
  );
}

// ── مكوّن بطاقة KPI ─────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, trend, icon: Icon, color,
}: {
  title: string; value: string; sub?: string;
  trend?: "up" | "down" | "neutral"; icon: React.ElementType; color: string;
}) {
  return (
    <div className={cn("rounded-xl p-4 border bg-card flex items-start gap-3")}>
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="font-bold text-lg leading-tight">{value}</p>
        {sub && (
          <p className={cn(
            "text-xs flex items-center gap-0.5 mt-0.5",
            trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-muted-foreground",
          )}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : trend === "down" ? <ArrowDownRight className="w-3 h-3" /> : null}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── التوoltip المخصص للرسوم البيانية ────────────────────────────────────────
function ArabicTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs" dir="rtl">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value)} ج.م</p>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 1: تنبؤ المبيعات ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function SalesForecastTab({ currency }: { currency: string }) {
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const purchases = useLiveQuery(() => db.purchases.toArray(), []);

  const { chartData, predictions, totalForecast, avgGrowth } = useMemo(() => {
    if (!sales) return { chartData: [], predictions: [], totalForecast: 0, avgGrowth: 0 };

    // تجميع المبيعات الشهرية
    const monthly: Record<string, number> = {};
    for (const s of sales) {
      const k = toMonthKey(s.date);
      monthly[k] = (monthly[k] ?? 0) + s.netAmount;
    }
    const keys = Object.keys(monthly).sort();
    const hist = keys.map((k) => monthly[k]);

    // حساب متوسط النمو
    let growthSum = 0, growthCount = 0;
    for (let i = 1; i < hist.length; i++) {
      if (hist[i - 1] > 0) {
        growthSum += (hist[i] - hist[i - 1]) / hist[i - 1];
        growthCount++;
      }
    }
    const avgGrowth = growthCount > 0 ? (growthSum / growthCount) * 100 : 0;

    const preds = forecast(hist, 3);
    const lastDate = keys.length > 0 ? new Date(keys[keys.length - 1]) : new Date();

    const predKeys = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });

    const histData = keys.map((k) => ({
      name: monthLabel(k), actual: monthly[k], forecast: undefined as number | undefined,
    }));
    const forecastData = predKeys.map((k, i) => ({
      name: monthLabel(k), actual: undefined as number | undefined, forecast: preds[i],
    }));

    return {
      chartData: [...histData.slice(-6), ...forecastData],
      predictions: predKeys.map((k, i) => ({ month: monthLabel(k), value: preds[i] })),
      totalForecast: preds.reduce((a, b) => a + b, 0),
      avgGrowth,
    };
  }, [sales]);

  // المشتريات الشهرية
  const purchaseMonthly = useMemo(() => {
    if (!purchases) return {};
    const m: Record<string, number> = {};
    for (const p of purchases) {
      const k = toMonthKey(p.date);
      m[k] = (m[k] ?? 0) + p.totalAmount;
    }
    return m;
  }, [purchases]);

  const avgPurchases = useMemo(() => {
    const vals = Object.values(purchaseMonthly);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [purchaseMonthly]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="إجمالي التوقعات (3 أشهر)" value={`${fmt(totalForecast)} ${currency}`}
          sub={avgGrowth > 0 ? `نمو متوقع ${avgGrowth.toFixed(1)}%` : `انخفاض ${Math.abs(avgGrowth).toFixed(1)}%`}
          trend={avgGrowth >= 0 ? "up" : "down"} icon={TrendingUp} color="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" />
        {predictions.slice(0, 3).map((p, i) => (
          <KpiCard key={i} title={`توقع ${p.month}`} value={`${fmt(p.value)} ${currency}`}
            icon={TrendingUp} color="bg-primary/10 text-primary" />
        ))}
      </div>

      {/* الرسم البياني */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            المبيعات الفعلية والتوقعات المستقبلية
            <div className="mr-auto flex items-center gap-3 text-xs text-muted-foreground font-normal">
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-blue-500 rounded inline-block" /> فعلي</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-orange-400 rounded inline-block border-dashed" /> متوقع</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات مبيعات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ArabicTooltip />} />
                <Line type="monotone" dataKey="actual" name="فعلي" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name="متوقع" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: "#f59e0b" }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* نصائح تحليلية */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-900">
        <CardContent className="py-3 px-4">
          <div className="flex gap-2 items-start">
            <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-semibold">تحليل ذكي:</p>
              {avgGrowth > 5 && <p>📈 نمو قوي في المبيعات — النظام يتوقع استمرار الزيادة</p>}
              {avgGrowth < -5 && <p>📉 انخفاض في المبيعات — يُنصح بمراجعة استراتيجية التسعير</p>}
              {Math.abs(avgGrowth) <= 5 && <p>📊 مبيعات مستقرة — أداء منتظم في الفترة الأخيرة</p>}
              {avgPurchases > 0 && totalForecast > 0 && (
                <p>💡 متوسط المشتريات الشهري {fmt(avgPurchases)} {currency} — تأكد من توازن الشراء مع المبيعات المتوقعة</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 2: تنبيهات المخزون ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
type StockAlert = {
  id: string; name: string; unit: string; current: number;
  min: number; type: "product" | "material"; status: "critical" | "warning" | "ok";
};

function InventoryAlertsTab({ currency }: { currency: string }) {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray(), []);
  const [filter, setFilter] = useState<"all" | "critical" | "warning">("all");

  const alerts: StockAlert[] = useMemo(() => {
    const list: StockAlert[] = [];
    for (const p of products ?? []) {
      const min = p.minStock ?? 0;
      const status: StockAlert["status"] =
        p.currentStock === 0 ? "critical" :
        p.currentStock < min ? "warning" : "ok";
      if (status !== "ok" || min > 0) {
        list.push({ id: p.id, name: p.name, unit: p.unit, current: p.currentStock, min, type: "product", status });
      }
    }
    for (const m of rawMaterials ?? []) {
      const min = m.minStock ?? 0;
      const status: StockAlert["status"] =
        m.currentStock === 0 ? "critical" :
        m.currentStock < min ? "warning" : "ok";
      if (status !== "ok" || min > 0) {
        list.push({ id: m.id, name: m.name, unit: m.unit, current: m.currentStock, min, type: "material", status });
      }
    }
    return list.sort((a, b) => {
      const order = { critical: 0, warning: 1, ok: 2 };
      return order[a.status] - order[b.status];
    });
  }, [products, rawMaterials]);

  const critical = alerts.filter((a) => a.status === "critical");
  const warning = alerts.filter((a) => a.status === "warning");
  const ok = alerts.filter((a) => a.status === "ok");

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.status === filter);

  // بيانات المخطط الدائري
  const pieData = [
    { name: "حرج", value: critical.length, color: "#ef4444" },
    { name: "تحذير", value: warning.length, color: "#f59e0b" },
    { name: "جيد", value: ok.length, color: "#10b981" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border p-3 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-center">
          <p className="text-2xl font-bold text-red-600">{critical.length}</p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1">نفد المخزون</p>
        </div>
        <div className="rounded-xl border p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-center">
          <p className="text-2xl font-bold text-amber-600">{warning.length}</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">أقل من الحد الأدنى</p>
        </div>
        <div className="rounded-xl border p-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-center">
          <p className="text-2xl font-bold text-green-600">{ok.length}</p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-1">المخزون كافٍ</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* الرسم البياني الدائري */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">توزيع حالة المخزون</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${typeof v === "number" ? v : 0} صنف`} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* نصائح ذكية */}
        <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-600" />
              توصيات ذكية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-amber-800 dark:text-amber-300">
            {critical.length > 0 && (
              <div className="flex gap-2 items-start p-2 bg-red-100 dark:bg-red-950/30 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p><strong>{critical.length} صنف نفد مخزونه</strong> — يجب إعادة طلب الشراء فوراً</p>
              </div>
            )}
            {warning.length > 0 && (
              <div className="flex gap-2 items-start p-2 bg-amber-100 dark:bg-amber-950/30 rounded-lg">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p><strong>{warning.length} صنف</strong> وصل للحد الأدنى — يُنصح بالطلب قريباً</p>
              </div>
            )}
            {critical.length === 0 && warning.length === 0 && (
              <div className="flex gap-2 items-start p-2 bg-green-100 dark:bg-green-950/30 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                <p>المخزون في وضع جيد — لا يوجد أي تنبيهات حالياً</p>
              </div>
            )}
            <p className="text-muted-foreground pt-1">
              💡 تحقق من الحد الأدنى لكل صنف في صفحة المنتجات أو المواد الخام لتفعيل التنبيهات
            </p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة التنبيهات */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            قائمة الأصناف
            <div className="mr-auto flex gap-1">
              {(["all", "critical", "warning"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"}
                  className="h-6 px-2 text-[10px] cursor-pointer"
                  onClick={() => setFilter(f)}>
                  {f === "all" ? "الكل" : f === "critical" ? "🔴 حرج" : "🟡 تحذير"}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد تنبيهات في هذه الفئة</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((a) => (
                <div key={a.id} className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-xs border",
                  a.status === "critical"
                    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                    : a.status === "warning"
                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
                    : "bg-muted/30 border-transparent",
                )}>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      a.status === "critical" ? "bg-red-500" :
                      a.status === "warning" ? "bg-amber-500" : "bg-green-500",
                    )} />
                    <span className="font-medium">{a.name}</span>
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                      {a.type === "product" ? "منتج" : "خامة"}
                    </Badge>
                  </div>
                  <div className="text-left">
                    <span className={cn(
                      "font-bold",
                      a.status === "critical" ? "text-red-600" :
                      a.status === "warning" ? "text-amber-600" : "text-green-600",
                    )}>
                      {a.current} {a.unit}
                    </span>
                    {a.min > 0 && <span className="text-muted-foreground"> / حد: {a.min}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 3: تحليل العملاء ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function CustomerAnalysisTab({ currency }: { currency: string }) {
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const collections = useLiveQuery(() => db.collections.toArray(), []);

  const { topCustomers, segmented, totalDebt, collectionRate } = useMemo(() => {
    if (!customers || !sales || !collections) {
      return { topCustomers: [], segmented: [], totalDebt: 0, collectionRate: 0 };
    }

    // مجموع المبيعات لكل عميل
    const salesByCustomer: Record<string, number> = {};
    const countByCustomer: Record<string, number> = {};
    for (const s of sales) {
      const id = s.customerId ?? s.customerName;
      salesByCustomer[id] = (salesByCustomer[id] ?? 0) + s.netAmount;
      countByCustomer[id] = (countByCustomer[id] ?? 0) + 1;
    }

    // مجموع التحصيلات
    const collectionsByCustomer: Record<string, number> = {};
    for (const c of collections) {
      collectionsByCustomer[c.customerId] = (collectionsByCustomer[c.customerId] ?? 0) + c.amount;
    }

    const totalDebt = customers.reduce((s, c) => s + Math.max(0, c.balance), 0);
    const totalSales = sales.reduce((s, v) => s + v.netAmount, 0);
    const totalCollected = collections.reduce((s, v) => s + v.amount, 0);
    const collectionRate = totalSales > 0 ? (totalCollected / totalSales) * 100 : 0;

    const enriched = customers.map((c) => {
      const rev = salesByCustomer[c.id] ?? salesByCustomer[c.name] ?? 0;
      const orders = countByCustomer[c.id] ?? countByCustomer[c.name] ?? 0;
      return { ...c, revenue: rev, orders, collected: collectionsByCustomer[c.id] ?? 0 };
    });

    const top = [...enriched].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // تصنيف العملاء (RFM مبسط)
    const maxRev = Math.max(...enriched.map((c) => c.revenue), 1);
    const segmented = enriched.map((c) => {
      const score = (c.revenue / maxRev) * 0.6 + (c.orders / Math.max(...enriched.map((x) => x.orders), 1)) * 0.4;
      const seg = score > 0.6 ? "VIP" : score > 0.3 ? "نشط" : score > 0.1 ? "عادي" : "غير نشط";
      return { ...c, segment: seg };
    });

    return { topCustomers: top, segmented, totalDebt, collectionRate };
  }, [customers, sales, collections]);

  const segCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of segmented) m[c.segment] = (m[c.segment] ?? 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [segmented]);

  const SEG_COLORS: Record<string, string> = {
    "VIP": "#1e2a4a", "نشط": "#3b82f6", "عادي": "#10b981", "غير نشط": "#94a3b8",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="إجمالي العملاء" value={`${customers?.length ?? 0}`}
          icon={Users} color="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" />
        <KpiCard title="إجمالي الديون" value={`${fmt(totalDebt)} ${currency}`}
          sub={totalDebt > 0 ? "مستحق التحصيل" : "لا ديون"} trend={totalDebt > 0 ? "down" : "neutral"}
          icon={Banknote} color="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" />
        <KpiCard title="نسبة التحصيل" value={`${collectionRate.toFixed(1)}%`}
          sub={collectionRate >= 80 ? "ممتاز" : collectionRate >= 60 ? "جيد" : "يحتاج تحسين"}
          trend={collectionRate >= 80 ? "up" : "down"}
          icon={CheckCircle2} color="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" />
        <KpiCard title="عملاء VIP" value={`${segmented.filter((c) => c.segment === "VIP").length}`}
          icon={Users} color="bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* أعلى العملاء مبيعاً */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">أعلى العملاء مبيعاً</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">لا توجد مبيعات بعد</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topCustomers} layout="vertical" margin={{ right: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v, name) => [`${typeof v === "number" ? fmt(v) : v} ${currency}`, String(name)]} />
                  <Bar dataKey="revenue" name="المبيعات" fill="#1e2a4a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* تصنيف العملاء */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تصنيف العملاء (RFM)</CardTitle>
          </CardHeader>
          <CardContent>
            {segCounts.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">لا توجد بيانات كافية</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={segCounts} cx="50%" cy="50%" outerRadius={70}
                    dataKey="value" nameKey="name" paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}>
                    {segCounts.map((d, i) => (
                      <Cell key={i} fill={SEG_COLORS[d.name] ?? PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${typeof v === "number" ? v : 0} عميل`} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="mt-3 space-y-1 text-xs">
              <p className="text-muted-foreground font-medium mb-2">ماذا يعني التصنيف؟</p>
              {[
                { seg: "VIP", desc: "عملاء مميزون بمشتريات عالية" },
                { seg: "نشط", desc: "عملاء بتعامل منتظم وجيد" },
                { seg: "عادي", desc: "عملاء بتعامل متقطع" },
                { seg: "غير نشط", desc: "يحتاجون إعادة تنشيط" },
              ].map(({ seg, desc }) => (
                <div key={seg} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEG_COLORS[seg] }} />
                  <span className="font-medium">{seg}:</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 4: تحليل الأرباح ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function ProfitAnalysisTab({ currency }: { currency: string }) {
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);

  const { monthlyData, totalRevenue, totalCOGS, totalExpenses, netProfit, profitMargin, topCategories, cogsNote } = useMemo(() => {
    if (!sales || !products || !expenses) {
      return { monthlyData: [], totalRevenue: 0, totalCOGS: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0, topCategories: [], cogsNote: "" };
    }

    // خريطة تكلفة كل منتج (costPrice) من قاعدة البيانات
    const productCost: Record<string, number> = {};
    for (const p of products) {
      productCost[p.id] = p.costPrice ?? 0;
    }

    // احتساب تكلفة البضاعة المباعة (COGS) من سطور الفواتير
    // COGS = Σ ( تكلفة الوحدة × الكمية المباعة ) لكل سطر في كل فاتورة
    let totalCOGS = 0;
    let itemsWithCost = 0;
    let itemsWithoutCost = 0;

    const revByMonth: Record<string, number> = {};
    const cogsByMonth: Record<string, number> = {};

    for (const s of sales) {
      const k = toMonthKey(s.date);
      revByMonth[k] = (revByMonth[k] ?? 0) + s.netAmount;

      for (const item of s.items) {
        const cost = productCost[item.productId] ?? 0;
        const lineCOGS = cost * item.quantity;
        totalCOGS += lineCOGS;
        cogsByMonth[k] = (cogsByMonth[k] ?? 0) + lineCOGS;
        if (cost > 0) itemsWithCost++;
        else itemsWithoutCost++;
      }
    }

    const expByMonth: Record<string, number> = {};
    for (const e of expenses) {
      const k = toMonthKey(e.date);
      expByMonth[k] = (expByMonth[k] ?? 0) + e.amount;
    }

    const allKeys = new Set([...Object.keys(revByMonth), ...Object.keys(cogsByMonth), ...Object.keys(expByMonth)]);
    const sortedKeys = [...allKeys].sort().slice(-8);

    const monthlyData = sortedKeys.map((k) => {
      const rev = revByMonth[k] ?? 0;
      const cogs = cogsByMonth[k] ?? 0;
      const exp = expByMonth[k] ?? 0;
      return { name: monthLabel(k), revenue: rev, cogs, expenses: exp, profit: rev - cogs - exp };
    });

    const totalRevenue = sales.reduce((s, v) => s + v.netAmount, 0);
    const totalExpenses = expenses.reduce((s, v) => s + v.amount, 0);
    const netProfit = totalRevenue - totalCOGS - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // تحليل المصروفات حسب الفئة
    const expByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expByCategory[e.category] = (expByCategory[e.category] ?? 0) + e.amount;
    }
    const topCategories = Object.entries(expByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // ملاحظة إذا كان بعض المنتجات بدون تكلفة مسجّلة
    const cogsNote = itemsWithoutCost > 0
      ? `⚠️ ${itemsWithoutCost} سطر مبيعات بمنتجات لم يُسجَّل لها سعر تكلفة — أضف سعر التكلفة لكل منتج للحصول على أرباح دقيقة.`
      : itemsWithCost > 0 ? "" : "لا توجد مبيعات مسجّلة بعد";

    return { monthlyData, totalRevenue, totalCOGS, totalExpenses, netProfit, profitMargin, topCategories, cogsNote };
  }, [sales, products, expenses]);

  return (
    <div className="space-y-4">

      {/* تنبيه تكلفة غير مسجّلة */}
      {cogsNote && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/10 dark:border-amber-900 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{cogsNote}</span>
        </div>
      )}

      {/* شرح المنهجية */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-900 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          <strong>منهجية الحساب (مصنع):</strong> صافي الربح = إيرادات المبيعات − تكلفة البضاعة المباعة (COGS) − المصروفات الإضافية.
          تكلفة البضاعة المباعة = <strong>سعر التكلفة/وحدة × الكميات المباعة</strong> من كل فاتورة.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="إجمالي الإيرادات" value={`${fmt(totalRevenue)} ${currency}`}
          icon={TrendingUp} color="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" />
        <KpiCard title="تكلفة البضاعة المباعة" value={`${fmt(totalCOGS)} ${currency}`}
          sub="COGS"
          icon={Banknote} color="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" />
        <KpiCard title="مصروفات تشغيلية" value={`${fmt(totalExpenses)} ${currency}`}
          icon={Banknote} color="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" />
        <KpiCard title="صافي الربح" value={`${fmt(netProfit)} ${currency}`}
          sub={netProfit >= 0 ? `هامش ${profitMargin.toFixed(1)}%` : "خسارة"} trend={netProfit >= 0 ? "up" : "down"}
          icon={TrendingUp} color={netProfit >= 0 ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-red-100 text-red-700"} />
      </div>

      {/* مخطط الأرباح الشهرية */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الإيرادات وتكلفة الإنتاج والأرباح الشهرية</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات كافية</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ArabicTooltip />} />
                <Bar dataKey="revenue" name="إيرادات" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cogs" name="تكلفة إنتاج" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="مصروفات" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="ربح" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* توزيع المصروفات */}
        {topCategories.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">أكبر فئات المصروفات التشغيلية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topCategories.map((c, i) => {
                  const total = topCategories.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? (c.value / total) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{c.name}</span>
                        <span className="font-medium">{fmt(c.value)} {currency}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* تحليل ذكي */}
        <Card className="border-green-200 bg-green-50/40 dark:bg-green-950/10 dark:border-green-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-green-600" />
              التوصيات الذكية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-green-800 dark:text-green-300">
            {profitMargin > 20 && <p className="p-2 bg-green-100 dark:bg-green-950/30 rounded-lg">🎉 هامش ربح ممتاز — استمر في الاستراتيجية الحالية</p>}
            {profitMargin > 0 && profitMargin <= 20 && <p className="p-2 bg-amber-100 dark:bg-amber-950/30 rounded-lg">💡 حاول رفع أسعار البيع أو تقليل تكاليف الإنتاج لتحسين هامش الربح</p>}
            {profitMargin <= 0 && <p className="p-2 bg-red-100 dark:bg-red-950/30 rounded-lg">⚠️ تكلفة الإنتاج تتجاوز الإيرادات — راجع أسعار البيع وتكاليف المنتجات فوراً</p>}
            {totalCOGS > 0 && totalRevenue > 0 && (
              <p className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
                🏭 تكلفة الإنتاج المباع {fmt(totalCOGS)} {currency} = {((totalCOGS / totalRevenue) * 100).toFixed(1)}% من الإيرادات
              </p>
            )}
            {topCategories.length > 0 && (
              <p className="p-2 bg-purple-100 dark:bg-purple-950/30 rounded-lg">
                📊 أكبر مصروفاتك في "{topCategories[0].name}" ({fmt(topCategories[0].value)} {currency})
              </p>
            )}
            {netProfit > 0 && (
              <p className="p-2 bg-emerald-100 dark:bg-emerald-950/30 rounded-lg">
                💰 الربح الصافي {fmt(netProfit)} {currency} — يمكن توزيع {fmt(netProfit * 0.95)} {currency} بعد احتجاز 5% احتياطي
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 5: المساعد الذكي ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
type ChatMessage = { role: "user" | "assistant"; text: string; ts: number; action?: "order_created" };

// ── نوع الطلبية الأسبوعية (نفس ما في WeeklyOrdersTab) ──────────────────────
type WOItem = { productId: string; productName: string; quantity: number; unit: string; notes: string };
type WOStatus = "pending" | "confirmed" | "delivered" | "cancelled";
type WeeklyOrder = {
  id: string; weekLabel: string; weekStart: string;
  customerId: string; customerName: string;
  items: WOItem[]; status: WOStatus; notes: string; createdAt: string;
};

// ── دوال localStorage ────────────────────────────────────────────────────────
function loadWeeklyOrders(): WeeklyOrder[] {
  try { return JSON.parse(localStorage.getItem("weekly_orders") ?? "[]") as WeeklyOrder[]; }
  catch { return []; }
}
function saveWeeklyOrders(orders: WeeklyOrder[]) {
  localStorage.setItem("weekly_orders", JSON.stringify(orders));
}

// ── حساب بداية الأسبوع (السبت) ───────────────────────────────────────────────
function getWeekStartFromDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 6 ? 0 : day + 1));
  return d.toISOString().slice(0, 10);
}

function getWeekLabelFromStart(ws: string): string {
  const d = new Date(ws);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const wn = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()} — الأسبوع ${wn}`;
}

// ── استخراج التاريخ من النص ────────────────────────────────────────────────
function parseDateFromText(text: string): { weekStart: string; dateLabel: string } {
  const today = new Date();
  const lower = text;

  if (/غداً|غدا/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    const ws = getWeekStartFromDate(d);
    return { weekStart: ws, dateLabel: `غداً (${d.toLocaleDateString("ar-EG")})` };
  }
  if (/بعد غد/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    const ws = getWeekStartFromDate(d);
    return { weekStart: ws, dateLabel: `بعد غد (${d.toLocaleDateString("ar-EG")})` };
  }

  const dayMap: Record<string, number> = {
    "الأحد": 0, "أحد": 0, "الاثنين": 1, "اثنين": 1, "الثلاثاء": 2, "ثلاثاء": 2,
    "الأربعاء": 3, "أربعاء": 3, "الخميس": 4, "خميس": 4, "الجمعة": 5, "جمعة": 5,
    "السبت": 6, "سبت": 6,
  };
  for (const [name, target] of Object.entries(dayMap)) {
    if (lower.includes(name)) {
      const d = new Date(today);
      let diff = target - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      const ws = getWeekStartFromDate(d);
      return { weekStart: ws, dateLabel: `${name} (${d.toLocaleDateString("ar-EG")})` };
    }
  }

  // بحث عن تاريخ رقمي مثل 15/6 أو 2025-06-15
  const dateNumMatch = lower.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/);
  if (dateNumMatch) {
    const day = parseInt(dateNumMatch[1]);
    const month = parseInt(dateNumMatch[2]) - 1;
    const year = dateNumMatch[3] ? parseInt(dateNumMatch[3]) : today.getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const ws = getWeekStartFromDate(d);
      return { weekStart: ws, dateLabel: d.toLocaleDateString("ar-EG") };
    }
  }

  const ws = getWeekStartFromDate(today);
  return { weekStart: ws, dateLabel: "هذا الأسبوع" };
}

// ── مطابقة أسماء من قائمة (fuzzy) ─────────────────────────────────────────
function findBestMatch<T extends { name: string }>(text: string, list: T[]): T | null {
  if (!list.length) return null;
  // بحث مباشر أولاً
  for (const item of list) {
    if (text.includes(item.name)) return item;
  }
  // بحث جزئي
  for (const item of list) {
    const parts = item.name.split(/\s+/);
    if (parts.some((p) => p.length > 2 && text.includes(p))) return item;
  }
  return null;
}

// ── استخراج الكمية من النص ─────────────────────────────────────────────────
function extractQuantity(text: string): number {
  const wordNumbers: Record<string, number> = {
    "واحد": 1, "اثنين": 2, "اتنين": 2, "ثلاثة": 3, "تلاتة": 3, "أربعة": 4, "اربعة": 4,
    "خمسة": 5, "ستة": 6, "سبعة": 7, "ثمانية": 8, "تسعة": 9, "عشرة": 10,
    "عشرين": 20, "ثلاثين": 30, "أربعين": 40, "خمسين": 50,
  };
  for (const [word, val] of Object.entries(wordNumbers)) {
    if (text.includes(word)) return val;
  }
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1]) : 1;
}

// ── هل النص أمر تسجيل طلبية؟ ─────────────────────────────────────────────
function isOrderCommand(text: string): boolean {
  return /سجل|أضف|ضيف|اطلب|طلبية|اضف|سجّل/.test(text);
}

// ── هل النص استفسار عن طلبيات؟ ──────────────────────────────────────────
function isOrderQuery(text: string): boolean {
  return /طلبيات|طلبية|موعد|متى|جدول|اوردر|أوردر/.test(text);
}

// تحليل السؤال وإنشاء إجابة بناءً على البيانات المحلية
async function generateAnswer(q: string, ctx: {
  totalSales: number; totalPurchases: number; totalExpenses: number;
  netProfit: number; profitMargin: number; totalDebt: number;
  customerCount: number; productCount: number; rawCount: number;
  topCustomer: string; criticalStock: number; warningStock: number;
  currency: string; lastMonthSales: number;
  products: Array<{ id: string; name: string; unit: string }>;
  customers: Array<{ id: string; name: string }>;
}): Promise<{ text: string; action?: "order_created" }> {
  const {
    totalSales, totalPurchases, totalExpenses, netProfit, profitMargin,
    totalDebt, customerCount, productCount, rawCount, topCustomer,
    criticalStock, warningStock, currency, lastMonthSales,
    products, customers,
  } = ctx;

  const lower = q.toLowerCase().replace(/[؟?]/g, "");

  // ── أمر تسجيل طلبية ──────────────────────────────────────────────────────
  if (isOrderCommand(lower)) {
    const customer = findBestMatch(lower, customers);
    const product = findBestMatch(lower, products);
    const quantity = extractQuantity(lower);
    const { weekStart, dateLabel } = parseDateFromText(lower);

    if (!customer) {
      return { text: `🔍 لم أتعرف على اسم العميل في الجملة.\n\nالعملاء المتاحون:\n${customers.slice(0, 8).map((c) => `• ${c.name}`).join("\n")}\n\nجرّب: "سجل طلبية كلور لعميل [اسم العميل] يوم الخميس"` };
    }
    if (!product) {
      return { text: `🔍 لم أتعرف على اسم المنتج.\n\nالمنتجات المتاحة:\n${products.slice(0, 8).map((p) => `• ${p.name}`).join("\n")}\n\nجرّب: "سجل 5 جمدانة [اسم المنتج] لـ${customer.name}"` };
    }

    // تسجيل الطلبية فعلياً
    const newOrder: WeeklyOrder = {
      id: crypto.randomUUID(),
      weekLabel: getWeekLabelFromStart(weekStart),
      weekStart,
      customerId: customer.id,
      customerName: customer.name,
      items: [{
        productId: product.id,
        productName: product.name,
        quantity,
        unit: (products.find((p) => p.id === product.id) as { unit?: string })?.unit ?? "",
        notes: "",
      }],
      status: "pending",
      notes: `مسجّلة بواسطة المساعد الذكي`,
      createdAt: new Date().toISOString(),
    };
    const orders = loadWeeklyOrders();
    orders.push(newOrder);
    saveWeeklyOrders(orders);

    return {
      text: `✅ **تم تسجيل الطلبية بنجاح!**\n\n👤 العميل: ${customer.name}\n📦 المنتج: ${product.name}\n🔢 الكمية: ${quantity} ${newOrder.items[0].unit}\n📅 التاريخ: ${dateLabel}\n📋 الأسبوع: ${newOrder.weekLabel}\n\nيمكنك مراجعتها في **فواتير المبيعات → طلبيات الأسبوع**`,
      action: "order_created",
    };
  }

  // ── استفسار عن طلبيات ─────────────────────────────────────────────────────
  if (isOrderQuery(lower)) {
    const allOrders = loadWeeklyOrders();
    if (allOrders.length === 0) {
      return { text: "📋 لا توجد طلبيات مسجّلة حتى الآن.\n\nيمكنك تسجيل طلبية بقول:\n\"سجل 5 كلور لأحمد يوم الخميس\"" };
    }

    // استفسار عن عميل محدد
    const customer = findBestMatch(lower, customers);
    if (customer) {
      const customerOrders = allOrders.filter((o) => o.customerId === customer.id || o.customerName === customer.name);
      if (customerOrders.length === 0) {
        return { text: `📋 لا توجد طلبيات مسجّلة للعميل **${customer.name}**` };
      }
      const lines = customerOrders.slice(-5).map((o) =>
        `• ${o.weekLabel}: ${o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join("، ")} — ${o.status === "pending" ? "⏳ قيد الانتظار" : o.status === "confirmed" ? "✅ مؤكدة" : o.status === "delivered" ? "🚚 تم التسليم" : "❌ ملغاة"}`
      ).join("\n");
      return { text: `📋 **طلبيات ${customer.name}** (آخر ${Math.min(5, customerOrders.length)}):\n\n${lines}` };
    }

    // ملخص عام للأسبوع الحالي
    const today = new Date();
    const currentWeek = getWeekStartFromDate(today);
    const thisWeek = allOrders.filter((o) => o.weekStart === currentWeek);
    const pendingCount = allOrders.filter((o) => o.status === "pending").length;
    const total = allOrders.length;
    let text = `📋 **ملخص الطلبيات:**\n\n`;
    text += `📦 إجمالي الطلبيات: ${total}\n`;
    text += `⏳ طلبيات هذا الأسبوع: ${thisWeek.length}\n`;
    text += `🟡 قيد الانتظار: ${pendingCount}\n`;
    if (thisWeek.length > 0) {
      text += `\n**طلبيات الأسبوع الحالي:**\n`;
      for (const o of thisWeek.slice(0, 6)) {
        text += `• ${o.customerName}: ${o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join("، ")}\n`;
      }
    }
    text += `\nللتفاصيل: **فواتير المبيعات → طلبيات الأسبوع**`;
    return { text };
  }

  // ── ربح / خسارة ──────────────────────────────────────────────────────────
  if (/ربح|أرباح|profit|هامش/.test(lower)) {
    return {
      text: netProfit >= 0
        ? `📈 **صافي الربح الإجمالي:** ${fmt(netProfit)} ${currency}\n` +
          `📊 **هامش الربح:** ${profitMargin.toFixed(1)}%\n` +
          (profitMargin > 20 ? "✅ هامش ممتاز — أداء قوي جداً!" :
           profitMargin > 10 ? "💡 هامش جيد، ويمكن تحسينه بتقليل المصروفات." :
           "⚠️ هامش منخفض — يُنصح برفع الأسعار أو تقليل التكاليف.")
        : `⚠️ **خسارة صافية:** ${fmt(Math.abs(netProfit))} ${currency}\n` +
          `التكاليف (${fmt(totalPurchases + totalExpenses)} ${currency}) تتجاوز الإيرادات (${fmt(totalSales)} ${currency}).\n` +
          "راجع المصروفات وأسعار البيع لتعديل الوضع.",
    };
  }

  // ── مبيعات ────────────────────────────────────────────────────────────────
  if (/مبيعات|بيع|إيراد|revenue|sales/.test(lower)) {
    return {
      text: `💰 **إجمالي المبيعات:** ${fmt(totalSales)} ${currency}\n` +
        (lastMonthSales > 0 ? `📅 **آخر شهر:** ${fmt(lastMonthSales)} ${currency}\n` : "") +
        `👑 **أفضل عميل:** ${topCustomer || "لا يوجد بعد"}\n` +
        `📊 **عدد العملاء:** ${customerCount}`,
    };
  }

  // ── مشتريات ───────────────────────────────────────────────────────────────
  if (/مشتريات|شراء|supplier|purchases/.test(lower)) {
    return {
      text: `🛒 **إجمالي المشتريات:** ${fmt(totalPurchases)} ${currency}\n` +
        `📦 **عدد المنتجات:** ${productCount} | **المواد الخام:** ${rawCount}\n` +
        (criticalStock > 0
          ? `🔴 **تنبيه:** ${criticalStock} صنف نفد مخزونه — يحتاج طلب فوري!`
          : "✅ المخزون في وضع طبيعي"),
    };
  }

  // ── ديون / تحصيل ─────────────────────────────────────────────────────────
  if (/دين|ديون|تحصيل|debt|balance/.test(lower)) {
    return {
      text: totalDebt > 0
        ? `💳 **إجمالي الديون المستحقة:** ${fmt(totalDebt)} ${currency}\n` +
          `👥 **عدد العملاء:** ${customerCount}\n` +
          "💡 استخدم صفحة واتساب لإرسال تذكيرات الدفع للعملاء المتأخرين."
        : `✅ لا توجد ديون مستحقة — جميع العملاء سدّدوا حساباتهم. أداء ممتاز!`,
    };
  }

  // ── مخزون ─────────────────────────────────────────────────────────────────
  if (/مخزون|stock|inventory|خامة|منتج/.test(lower)) {
    return {
      text: `📦 **المنتجات:** ${productCount} صنف | **المواد الخام:** ${rawCount} صنف\n` +
        (criticalStock > 0
          ? `🔴 **${criticalStock} صنف نفد مخزونه** — أعد الطلب فوراً\n`
          : "✅ لا أصناف منتهية\n") +
        (warningStock > 0
          ? `🟡 **${warningStock} صنف** وصل للحد الأدنى — اطلب قريباً`
          : "✅ جميع الأصناف فوق الحد الأدنى"),
    };
  }

  // ── مصروفات ───────────────────────────────────────────────────────────────
  if (/مصروف|تكلفة|expense/.test(lower)) {
    return {
      text: `💸 **إجمالي المصروفات:** ${fmt(totalExpenses)} ${currency}\n` +
        `🛒 **إجمالي المشتريات:** ${fmt(totalPurchases)} ${currency}\n` +
        `📊 **نسبة التكاليف من الإيرادات:** ${totalSales > 0 ? (((totalPurchases + totalExpenses) / totalSales) * 100).toFixed(1) : 0}%`,
    };
  }

  // ── ملخص عام ─────────────────────────────────────────────────────────────
  if (/ملخص|تقرير|summary|report|كيف|وضع|حال/.test(lower)) {
    return {
      text: `📊 **ملخص الأداء المالي:**\n\n` +
        `💰 الإيرادات: ${fmt(totalSales)} ${currency}\n` +
        `🛒 التكاليف الكلية: ${fmt(totalPurchases + totalExpenses)} ${currency}\n` +
        `${netProfit >= 0 ? "📈" : "📉"} صافي الربح: ${fmt(netProfit)} ${currency} (${profitMargin.toFixed(1)}%)\n` +
        `💳 الديون المستحقة: ${fmt(totalDebt)} ${currency}\n` +
        `📦 تنبيهات المخزون: ${criticalStock + warningStock > 0 ? `${criticalStock} حرج + ${warningStock} تحذير` : "لا تنبيهات"}`,
    };
  }

  // ── سؤال غير معروف ───────────────────────────────────────────────────────
  return {
    text: `أنا مساعدك الذكي 🤖\n\n` +
      `**يمكنني تنفيذ أوامر:**\n` +
      `🎤 "سجل 5 كلور لأحمد يوم الخميس"\n` +
      `🎤 "أضف طلبية جمدانة لعميل محمد يوم السبت"\n\n` +
      `**ويمكنني الإجابة عن:**\n` +
      `• طلبيات عميل معين\n` +
      `• الأرباح والهامش المالي\n` +
      `• المبيعات والإيرادات\n` +
      `• الديون والمخزون\n` +
      `• ملخص عام للأداء\n\n` +
      `جرّب: "ما طلبيات أحمد؟" أو "ملخص الأداء"`,
  };
}

function AIChatTab({ currency }: { currency: string }) {
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const purchases = useLiveQuery(() => db.purchases.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray(), []);

  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant",
    text: "أهلاً! أنا مساعدك الذكي 🤖\n\n**يمكنني تسجيل الطلبيات بأمر صوتي أو نصي:**\n🎤 \"سجل 5 كلور لأحمد يوم الخميس\"\n🎤 \"أضف طلبية جمدانة لمحمد السبت\"\n\n**ويمكنني الإجابة عن:**\n• \"ما طلبيات أحمد؟\" — لعرض جدول طلبياته\n• \"ملخص الطلبيات\" — لعرض طلبيات الأسبوع\n• \"ما الربح؟\" • \"كيف المخزون؟\" • \"ملخص الأداء\"",
    ts: Date.now(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buildContext = () => {
    const totalSales = (sales ?? []).reduce((s, v) => s + v.netAmount, 0);
    const productCostMap: Record<string, number> = {};
    for (const p of products ?? []) productCostMap[p.id] = p.costPrice ?? 0;
    const totalCOGS = (sales ?? []).reduce((sum, s) =>
      sum + s.items.reduce((ls, item) => ls + (productCostMap[item.productId] ?? 0) * item.quantity, 0), 0);
    const totalExpenses = (expenses ?? []).reduce((s, v) => s + v.amount, 0);
    const totalPurchases = (purchases ?? []).reduce((s, v) => s + v.totalAmount, 0);
    const netProfit = totalSales - totalCOGS - totalExpenses;
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
    const totalDebt = (customers ?? []).reduce((s, c) => s + Math.max(0, c.balance), 0);
    const salesByCustomer: Record<string, number> = {};
    for (const s of sales ?? []) {
      salesByCustomer[s.customerId ?? s.customerName] = (salesByCustomer[s.customerId ?? s.customerName] ?? 0) + s.netAmount;
    }
    const topCustomerId = Object.entries(salesByCustomer).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCustomer = (customers ?? []).find((c) => c.id === topCustomerId)?.name ?? topCustomerId ?? "";
    const criticalStock = [...(products ?? []), ...(rawMaterials ?? [])].filter((p) => p.currentStock === 0 && (p.minStock ?? 0) > 0).length;
    const warningStock = [...(products ?? []), ...(rawMaterials ?? [])].filter((p) => p.currentStock > 0 && p.currentStock < (p.minStock ?? 0)).length;
    const now = new Date();
    const lastMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthSales = (sales ?? []).filter((s) => toMonthKey(s.date) === lastMonthKey).reduce((s, v) => s + v.netAmount, 0);
    return {
      totalSales, totalPurchases, totalExpenses: totalCOGS + totalExpenses, netProfit, profitMargin,
      totalDebt, customerCount: (customers ?? []).length,
      productCount: (products ?? []).length, rawCount: (rawMaterials ?? []).length,
      topCustomer, criticalStock, warningStock, currency, lastMonthSales,
      products: (products ?? []).map((p) => ({ id: p.id, name: p.name, unit: p.unit })),
      customers: (customers ?? []).map((c) => ({ id: c.id, name: c.name })),
    };
  };

  const processText = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const ctx = buildContext();
      const result = await generateAnswer(text, ctx);
      setMessages((prev) => [...prev, { role: "assistant", text: result.text, ts: Date.now(), action: result.action }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    setInput("");
    await processText(text);
  };

  // ── تسجيل الصوت ────────────────────────────────────────────────────────────
  const startRecording = () => {
    type SR = {
      lang: string; continuous: boolean; interimResults: boolean;
      onstart: (() => void) | null; onend: (() => void) | null;
      onerror: (() => void) | null;
      onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
      start: () => void; stop: () => void;
    };
    const SpeechRecognitionAPI = (
      (window as unknown as Record<string, { new(): SR }>)["webkitSpeechRecognition"] ??
      (window as unknown as Record<string, { new(): SR }>)["SpeechRecognition"]
    );
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    recognition.onerror = () => { setIsRecording(false); recognitionRef.current = null; };
    recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      void processText(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const QUICK = [
    "سجل 5 كلور لأحمد يوم الخميس",
    "ما طلبيات هذا الأسبوع؟",
    "ما الربح؟",
    "كيف المخزون؟",
    "ملخص الأداء",
  ];

  return (
    <div className="flex flex-col h-[560px]">
      {/* إشعار الإجراء المنفذ */}

      {/* منطقة الرسائل */}
      <ScrollArea className="flex-1 rounded-xl border bg-muted/20 p-3 mb-3" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <BrainCircuit className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
              <div className={cn(
                "max-w-[82%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : m.action === "order_created"
                  ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-tl-sm"
                  : "bg-card border rounded-tl-sm",
              )}>
                {m.action === "order_created" && (
                  <div className="text-emerald-700 dark:text-emerald-300 font-bold text-[11px] mb-1 flex items-center gap-1">
                    ✅ تم التسجيل في طلبيات الأسبوع
                  </div>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <BrainCircuit className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <div className="bg-card border rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                جارٍ المعالجة...
              </div>
            </div>
          )}
          {/* مؤشر التسجيل */}
          {isRecording && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                <span className="text-white text-[10px]">🎤</span>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                جارٍ الاستماع... تحدث الآن
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* أسئلة سريعة */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        {QUICK.map((q, i) => (
          <button key={i} onClick={() => { setInput(q); }}
            className="text-[10px] px-2.5 py-1 rounded-full border bg-card hover:bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer">
            {q}
          </button>
        ))}
      </div>

      {/* حقل الإدخال + زر الصوت */}
      <div className="flex gap-2">
        {voiceSupported && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer border",
              isRecording
                ? "bg-red-500 text-white border-red-500 animate-pulse"
                : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/40",
            )}
          >
            {isRecording ? "⏹" : "🎤"}
          </button>
        )}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSend(); }}
          placeholder='اكتب أو تحدث: "سجل 5 كلور لأحمد يوم الخميس"'
          className="text-sm flex-1"
          disabled={loading || isRecording}
          dir="rtl"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim() || isRecording} className="gap-1.5 cursor-pointer flex-shrink-0">
          <Send className="w-4 h-4" />
          إرسال
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
        <Info className="w-2.5 h-2.5" />
        يعمل محلياً بدون إنترنت · الصوت لا يُرسل لأي خادم
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── الصفحة الرئيسية ───────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
export default function AIPage() {
  const settings = useLiveQuery(() => db.settings.get("company"), []);
  const currency = settings?.currency ?? "ج.م";

  return (
    <div className="space-y-5 p-1 max-w-5xl" dir="rtl">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-md">
          <BrainCircuit className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            الذكاء الاصطناعي لتحليل البيانات
            <Badge className="text-[10px] px-1.5 py-0 h-5 bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
              AI
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">تحليل محلي ذكي لبياناتك — بدون إنترنت، بدون إرسال بيانات</p>
        </div>
      </div>

      {/* ── التبويبات ── */}
      <Tabs defaultValue="forecast" dir="rtl">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="forecast" className="text-xs gap-1">
            <TrendingUp className="w-3 h-3" />
            <span className="hidden sm:inline">التنبؤ</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs gap-1">
            <Package className="w-3 h-3" />
            <span className="hidden sm:inline">المخزون</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="text-xs gap-1">
            <Users className="w-3 h-3" />
            <span className="hidden sm:inline">العملاء</span>
          </TabsTrigger>
          <TabsTrigger value="profit" className="text-xs gap-1">
            <Banknote className="w-3 h-3" />
            <span className="hidden sm:inline">الأرباح</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs gap-1">
            <MessageSquare className="w-3 h-3" />
            <span className="hidden sm:inline">المساعد</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4">
          <SalesForecastTab currency={currency} />
        </TabsContent>
        <TabsContent value="inventory" className="mt-4">
          <InventoryAlertsTab currency={currency} />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <CustomerAnalysisTab currency={currency} />
        </TabsContent>
        <TabsContent value="profit" className="mt-4">
          <ProfitAnalysisTab currency={currency} />
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <AIChatTab currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

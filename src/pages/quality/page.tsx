/**
 * صفحة تتبع الجودة والتشغيل
 * تبويب 1: فحوصات الجودة  |  تبويب 2: إحصاءات الجودة  |  تبويب 3: سجل الإنتاج
 */
import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type QualityCheck, type QualityStatus } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Plus, Trash2, ShieldCheck, ClipboardCheck, BarChart3,
  Factory, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  X, TrendingUp,
} from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import { cn } from "@/lib/utils.ts";

// ── ثوابت ────────────────────────────────────────────────────────────────────
const DEFECT_OPTIONS = [
  "عيب في الشكل", "لون غير مطابق", "تسرب", "نقص في الوزن", "تلوث",
  "كسر أو تشقق", "ختم ناقص", "عبوة تالفة", "رائحة غير مقبولة", "أخرى",
];

const STATUS_LABEL: Record<QualityStatus, string> = {
  passed: "اجتاز الفحص", failed: "رُفض", partial: "قبول جزئي",
};
const STATUS_COLOR: Record<QualityStatus, string> = {
  passed: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};
const STATUS_ICON: Record<QualityStatus, React.ElementType> = {
  passed: CheckCircle2, failed: XCircle, partial: AlertTriangle,
};

function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 1 }); }

function toMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${months[parseInt(m) - 1]} ${y?.slice(2)}`;
}

// ── نموذج فارغ ───────────────────────────────────────────────────────────────
const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  productId: "",
  productName: "",
  batchNumber: "",
  quantityProduced: 0,
  quantityPassed: 0,
  quantityFailed: 0,
  defectTypes: [] as string[],
  inspector: "",
  notes: "",
  productionOrderId: "",
});

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 1: قائمة الفحوصات ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function QualityListTab({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [filterStatus, setFilterStatus] = useState<QualityStatus | "all">("all");
  const [filterProduct, setFilterProduct] = useState("all");

  const checks = useLiveQuery(() => db.qualityChecks.orderBy("date").reverse().toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);
  const productionOrders = useLiveQuery(() => db.productionOrders.orderBy("date").reverse().toArray(), []);

  const filtered = useMemo(() => {
    if (!checks) return [];
    return checks.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterProduct !== "all" && c.productId !== filterProduct) return false;
      return true;
    });
  }, [checks, filterStatus, filterProduct]);

  // ── حساب الحالة تلقائياً
  const computedStatus = useMemo((): QualityStatus => {
    const { quantityPassed, quantityFailed, quantityProduced } = form;
    if (quantityPassed === 0 && quantityFailed > 0) return "failed";
    if (quantityFailed === 0 && quantityPassed > 0) return "passed";
    if (quantityPassed > 0 && quantityFailed > 0) return "partial";
    if (quantityPassed === quantityProduced && quantityProduced > 0) return "passed";
    return "passed";
  }, [form]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (c: QualityCheck) => {
    setEditId(c.id);
    setForm({
      date: c.date.slice(0, 10),
      productId: c.productId,
      productName: c.productName,
      batchNumber: c.batchNumber ?? "",
      quantityProduced: c.quantityProduced,
      quantityPassed: c.quantityPassed,
      quantityFailed: c.quantityFailed,
      defectTypes: c.defectTypes,
      inspector: c.inspector ?? "",
      notes: c.notes ?? "",
      productionOrderId: c.productionOrderId ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.productId) { toast.error("اختر المنتج أولاً"); return; }
    if (form.quantityProduced <= 0) { toast.error("أدخل الكمية المنتجة"); return; }
    if (form.quantityPassed + form.quantityFailed > form.quantityProduced) {
      toast.error("مجموع الناجح والمرفوض لا يمكن أن يتجاوز الكمية المنتجة"); return;
    }

    const check: QualityCheck = {
      id: editId ?? crypto.randomUUID(),
      date: new Date(form.date).toISOString(),
      productId: form.productId,
      productName: form.productName,
      batchNumber: form.batchNumber || undefined,
      quantityProduced: form.quantityProduced,
      quantityPassed: form.quantityPassed,
      quantityFailed: form.quantityFailed,
      defectTypes: form.defectTypes,
      inspector: form.inspector || undefined,
      notes: form.notes || undefined,
      productionOrderId: form.productionOrderId || undefined,
      status: computedStatus,
    };

    try {
      if (editId) {
        await db.qualityChecks.put(check);
        toast.success("تم تحديث الفحص");
      } else {
        await db.qualityChecks.add(check);
        toast.success("تم إضافة فحص الجودة");
      }
      setOpen(false);
    } catch { toast.error("حدث خطأ أثناء الحفظ"); }
  };

  const handleDelete = async (id: string) => {
    await db.qualityChecks.delete(id);
    toast.success("تم الحذف");
  };

  const toggleDefect = (d: string) => {
    setForm((prev) => ({
      ...prev,
      defectTypes: prev.defectTypes.includes(d)
        ? prev.defectTypes.filter((x) => x !== d)
        : [...prev.defectTypes, d],
    }));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as QualityStatus | "all")}>
            <SelectTrigger dir="rtl" className="h-8 w-36 text-xs">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="passed">اجتاز الفحص</SelectItem>
              <SelectItem value="partial">قبول جزئي</SelectItem>
              <SelectItem value="failed">مرفوض</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger dir="rtl" className="h-8 w-36 text-xs">
              <SelectValue placeholder="كل المنتجات" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل المنتجات</SelectItem>
              {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew} className="gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> فحص جودة جديد
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
            <EmptyTitle>لا توجد فحوصات جودة</EmptyTitle>
            <EmptyDescription>ابدأ بإضافة فحص جودة لمتابعة مستوى الإنتاج</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openNew}>إضافة فحص جودة</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const passRate = c.quantityProduced > 0 ? (c.quantityPassed / c.quantityProduced) * 100 : 0;
            const Icon = STATUS_ICON[c.status];
            return (
              <div
                key={c.id}
                className="border rounded-xl p-4 bg-card hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", STATUS_COLOR[c.status])}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{c.productName}</p>
                        {c.batchNumber && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">دفعة {c.batchNumber}</Badge>
                        )}
                        <Badge className={cn("text-[10px] px-1.5 py-0 border-0", STATUS_COLOR[c.status])}>
                          {STATUS_LABEL[c.status]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{new Date(c.date).toLocaleDateString("ar-EG")}</span>
                        <span>الإنتاج: <strong className="text-foreground">{c.quantityProduced}</strong></span>
                        <span className="text-green-600">✓ ناجح: {c.quantityPassed}</span>
                        {c.quantityFailed > 0 && <span className="text-red-500">✗ مرفوض: {c.quantityFailed}</span>}
                        {c.inspector && <span>المفتش: {c.inspector}</span>}
                      </div>
                      {c.defectTypes.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {c.defectTypes.map((d) => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-full border border-red-200 dark:border-red-900">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* شريط نسبة النجاح */}
                    <div className="hidden sm:flex flex-col items-center gap-0.5">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", passRate >= 90 ? "bg-green-500" : passRate >= 70 ? "bg-amber-500" : "bg-red-500")}
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{passRate.toFixed(0)}% ناجح</span>
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog الإضافة/التعديل ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {editId ? "تعديل فحص الجودة" : "فحص جودة جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">

            {/* المنتج + التاريخ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المنتج *</Label>
                <Select value={form.productId} onValueChange={(val) => {
                  const p = products?.find((p) => p.id === val);
                  setForm((prev) => ({ ...prev, productId: val, productName: p?.name ?? "" }));
                }}>
                  <SelectTrigger dir="rtl" className="h-9 text-sm">
                    <SelectValue placeholder="اختر المنتج" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ الفحص</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} dir="rtl" className="h-9 text-sm" />
              </div>
            </div>

            {/* رقم الدفعة + أمر الإنتاج */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">رقم الدفعة (اختياري)</Label>
                <Input value={form.batchNumber} onChange={(e) => setForm((p) => ({ ...p, batchNumber: e.target.value }))} dir="rtl" className="h-9 text-sm" placeholder="مثال: B-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المفتش</Label>
                <Input value={form.inspector} onChange={(e) => setForm((p) => ({ ...p, inspector: e.target.value }))} dir="rtl" className="h-9 text-sm" placeholder="اسم المفتش" />
              </div>
            </div>

            {/* الكميات */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الكمية المنتجة *</Label>
                <Input type="number" min={0} value={form.quantityProduced || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm((p) => ({ ...p, quantityProduced: v, quantityPassed: Math.min(p.quantityPassed, v) }));
                  }}
                  onFocus={(e) => e.target.select()} dir="rtl" className="h-9 text-sm font-semibold" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-green-600">الكمية الناجحة</Label>
                <Input type="number" min={0} max={form.quantityProduced} value={form.quantityPassed || ""}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value), form.quantityProduced);
                    setForm((p) => ({ ...p, quantityPassed: v, quantityFailed: Math.max(0, p.quantityProduced - v) }));
                  }}
                  onFocus={(e) => e.target.select()} dir="rtl" className="h-9 text-sm font-semibold border-green-300 focus:border-green-500" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-red-500">الكمية المرفوضة</Label>
                <Input type="number" min={0} max={form.quantityProduced} value={form.quantityFailed || ""}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value), form.quantityProduced);
                    setForm((p) => ({ ...p, quantityFailed: v, quantityPassed: Math.max(0, p.quantityProduced - v) }));
                  }}
                  onFocus={(e) => e.target.select()} dir="rtl" className="h-9 text-sm font-semibold border-red-300 focus:border-red-500" />
              </div>
            </div>

            {/* معاينة الحالة المحسوبة */}
            {form.quantityProduced > 0 && (
              <div className={cn("flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium", STATUS_COLOR[computedStatus])}>
                {(() => { const Icon = STATUS_ICON[computedStatus]; return <Icon className="w-4 h-4" />; })()}
                الحالة المقترحة: <strong>{STATUS_LABEL[computedStatus]}</strong>
                <span className="mr-auto">
                  {form.quantityProduced > 0 ? `${((form.quantityPassed / form.quantityProduced) * 100).toFixed(0)}% ناجح` : ""}
                </span>
              </div>
            )}

            {/* أنواع العيوب */}
            <div className="space-y-2">
              <Label className="text-xs">أنواع العيوب المكتشفة</Label>
              <div className="flex flex-wrap gap-1.5">
                {DEFECT_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDefect(d)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-full border transition-colors cursor-pointer",
                      form.defectTypes.includes(d)
                        ? "bg-red-100 border-red-400 text-red-700 dark:bg-red-950/40 dark:text-red-400 dark:border-red-700"
                        : "bg-muted/40 border-muted-foreground/20 hover:border-primary/40",
                    )}
                  >
                    {form.defectTypes.includes(d) && "✓ "}{d}
                  </button>
                ))}
              </div>
              {form.defectTypes.length > 0 && (
                <button onClick={() => setForm((p) => ({ ...p, defectTypes: [] }))} className="text-[10px] text-muted-foreground hover:text-destructive cursor-pointer flex items-center gap-1">
                  <X className="w-3 h-3" /> مسح الاختيارات
                </button>
              )}
            </div>

            {/* ملاحظات */}
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} dir="rtl" className="text-sm resize-none" rows={2} placeholder="أي ملاحظات إضافية..." />
            </div>

            <Separator />
            <div className="flex gap-3">
              <Button onClick={handleSave} className="flex-1 cursor-pointer">
                <ShieldCheck className="w-4 h-4 ml-2" />
                {editId ? "حفظ التعديلات" : "إضافة فحص الجودة"}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1 cursor-pointer">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 2: إحصاءات الجودة ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function QualityStatsTab({ currency }: { currency: string }) {
  const checks = useLiveQuery(() => db.qualityChecks.orderBy("date").toArray(), []);

  const { kpis, monthlyData, byProduct, defectFrequency } = useMemo(() => {
    if (!checks || checks.length === 0) {
      return { kpis: null, monthlyData: [], byProduct: [], defectFrequency: [] };
    }

    const totalProduced = checks.reduce((s, c) => s + c.quantityProduced, 0);
    const totalPassed = checks.reduce((s, c) => s + c.quantityPassed, 0);
    const totalFailed = checks.reduce((s, c) => s + c.quantityFailed, 0);
    const overallRate = totalProduced > 0 ? (totalPassed / totalProduced) * 100 : 0;
    const failedChecks = checks.filter((c) => c.status === "failed").length;
    const partialChecks = checks.filter((c) => c.status === "partial").length;

    // بيانات شهرية
    const monthly: Record<string, { produced: number; passed: number; failed: number }> = {};
    for (const c of checks) {
      const k = toMonthKey(c.date);
      if (!monthly[k]) monthly[k] = { produced: 0, passed: 0, failed: 0 };
      monthly[k].produced += c.quantityProduced;
      monthly[k].passed += c.quantityPassed;
      monthly[k].failed += c.quantityFailed;
    }
    const monthlyData = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, v]) => ({
        name: monthLabel(k),
        "ناجح": v.passed,
        "مرفوض": v.failed,
        "نسبة النجاح": v.produced > 0 ? parseFloat(((v.passed / v.produced) * 100).toFixed(1)) : 0,
      }));

    // بيانات حسب المنتج
    const byProd: Record<string, { name: string; passed: number; failed: number; produced: number }> = {};
    for (const c of checks) {
      if (!byProd[c.productId]) byProd[c.productId] = { name: c.productName, passed: 0, failed: 0, produced: 0 };
      byProd[c.productId].passed += c.quantityPassed;
      byProd[c.productId].failed += c.quantityFailed;
      byProd[c.productId].produced += c.quantityProduced;
    }
    const byProduct = Object.values(byProd)
      .map((p) => ({ ...p, rate: p.produced > 0 ? parseFloat(((p.passed / p.produced) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.rate - a.rate);

    // تردد العيوب
    const defCount: Record<string, number> = {};
    for (const c of checks) {
      for (const d of c.defectTypes) defCount[d] = (defCount[d] ?? 0) + 1;
    }
    const defectFrequency = Object.entries(defCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);

    return {
      kpis: { totalProduced, totalPassed, totalFailed, overallRate, failedChecks, partialChecks, totalChecks: checks.length },
      monthlyData, byProduct, defectFrequency,
    };
  }, [checks]);

  if (!kpis) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><BarChart3 /></EmptyMedia>
          <EmptyTitle>لا توجد بيانات كافية</EmptyTitle>
          <EmptyDescription>أضف فحوصات جودة أولاً لعرض الإحصاءات</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-3 bg-card text-center">
          <p className="text-2xl font-bold text-primary">{kpis.totalChecks}</p>
          <p className="text-xs text-muted-foreground mt-0.5">إجمالي الفحوصات</p>
        </div>
        <div className={cn("rounded-xl border p-3 text-center", kpis.overallRate >= 90 ? "bg-green-50 dark:bg-green-950/20 border-green-200" : kpis.overallRate >= 70 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200" : "bg-red-50 dark:bg-red-950/20 border-red-200")}>
          <p className={cn("text-2xl font-bold", kpis.overallRate >= 90 ? "text-green-600" : kpis.overallRate >= 70 ? "text-amber-600" : "text-red-600")}>
            {kpis.overallRate.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">نسبة النجاح الكلية</p>
        </div>
        <div className="rounded-xl border p-3 bg-green-50 dark:bg-green-950/20 border-green-200 text-center">
          <p className="text-2xl font-bold text-green-600">{kpis.totalPassed.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">وحدة ناجحة</p>
        </div>
        <div className="rounded-xl border p-3 bg-red-50 dark:bg-red-950/20 border-red-200 text-center">
          <p className="text-2xl font-bold text-red-600">{kpis.totalFailed.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">وحدة مرفوضة</p>
        </div>
      </div>

      {/* مخطط الجودة الشهرية */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              نسبة النجاح الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="نسبة النجاح" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* جودة حسب المنتج */}
        {byProduct.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">جودة حسب المنتج</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {byProduct.map((p, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium">{p.name}</span>
                      <span className={cn("font-bold", p.rate >= 90 ? "text-green-600" : p.rate >= 70 ? "text-amber-600" : "text-red-600")}>
                        {p.rate}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", p.rate >= 90 ? "bg-green-500" : p.rate >= 70 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${p.rate}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      ✓ {p.passed.toLocaleString("ar-EG")} ناجح  ✗ {p.failed.toLocaleString("ar-EG")} مرفوض
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* أكثر العيوب تكراراً */}
        {defectFrequency.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">أكثر العيوب تكراراً</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={defectFrequency} layout="vertical" margin={{ right: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => [`${v} مرة`, "التكرار"]} />
                  <Bar dataKey="value" name="التكرار" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* مخطط شريطي للناجح والمرفوض */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">الوحدات الناجحة مقابل المرفوضة شهرياً</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                <Bar dataKey="ناجح" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="مرفوض" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── تبويب 3: سجل الإنتاج ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function ProductionLogTab({ currency }: { currency: string }) {
  const orders = useLiveQuery(() => db.productionOrders.orderBy("date").reverse().toArray(), []);

  const statusLabel: Record<string, string> = { pending: "معلق", completed: "مكتمل", cancelled: "ملغي" };
  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  };

  // إحصاءات سريعة
  const stats = useMemo(() => {
    if (!orders) return null;
    const totalOrders = orders.length;
    const completed = orders.filter((o) => o.status === "completed").length;
    const totalCost = orders.reduce((s, o) => s + o.materialsUsed.reduce((ms, m) => ms + m.total, 0) + (o.laborCost ?? 0), 0);
    const totalUnits = orders.filter((o) => o.status === "completed").reduce((s, o) => s + o.quantity, 0);
    return { totalOrders, completed, totalCost, totalUnits };
  }, [orders]);

  if (!orders || orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Factory /></EmptyMedia>
          <EmptyTitle>لا توجد أوامر إنتاج</EmptyTitle>
          <EmptyDescription>أوامر الإنتاج ستظهر هنا من صفحة الإنتاج</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* إحصاءات الإنتاج */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3 bg-card text-center">
            <p className="text-xl font-bold text-primary">{stats.totalOrders}</p>
            <p className="text-xs text-muted-foreground mt-0.5">إجمالي الأوامر</p>
          </div>
          <div className="rounded-xl border p-3 bg-green-50 dark:bg-green-950/20 border-green-200 text-center">
            <p className="text-xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-muted-foreground mt-0.5">أوامر مكتملة</p>
          </div>
          <div className="rounded-xl border p-3 bg-card text-center">
            <p className="text-xl font-bold">{stats.totalUnits.toLocaleString("ar-EG")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">وحدة منتجة</p>
          </div>
          <div className="rounded-xl border p-3 bg-card text-center">
            <p className="text-xl font-bold text-blue-600">{fmt(stats.totalCost)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">تكلفة إنتاج ({currency})</p>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-right p-3 font-semibold text-xs">التاريخ</th>
              <th className="text-right p-3 font-semibold text-xs">المنتج</th>
              <th className="text-right p-3 font-semibold text-xs">الكمية</th>
              <th className="text-right p-3 font-semibold text-xs">تكلفة المواد</th>
              <th className="text-right p-3 font-semibold text-xs">أجور العمالة</th>
              <th className="text-right p-3 font-semibold text-xs">التكلفة الكلية</th>
              <th className="text-right p-3 font-semibold text-xs">تكلفة/وحدة</th>
              <th className="text-right p-3 font-semibold text-xs">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const matCost = o.materialsUsed.reduce((s, m) => s + m.total, 0);
              const totalCost = matCost + (o.laborCost ?? 0);
              const unitCost = o.quantity > 0 ? totalCost / o.quantity : 0;
              return (
                <tr key={o.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(o.date).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3 font-medium text-sm">{o.productName}</td>
                  <td className="p-3 text-sm">{o.quantity} {o.unit}</td>
                  <td className="p-3 text-sm">{matCost.toLocaleString("ar-EG")}</td>
                  <td className="p-3 text-sm text-muted-foreground">{(o.laborCost ?? 0).toLocaleString("ar-EG")}</td>
                  <td className="p-3 font-bold text-sm">{totalCost.toLocaleString("ar-EG")} {currency}</td>
                  <td className="p-3 text-blue-600 font-semibold text-sm">{unitCost.toFixed(2)}</td>
                  <td className="p-3">
                    <Badge className={cn("text-[10px] px-1.5 py-0 border-0", statusColor[o.status])}>
                      {statusLabel[o.status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── الصفحة الرئيسية ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
export default function QualityPage() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const checks = useLiveQuery(() => db.qualityChecks.count(), []);
  const failCount = useLiveQuery(() => db.qualityChecks.where("status").equals("failed").count(), []);

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-5xl" dir="rtl">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
          <ShieldCheck className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            تتبع الجودة والتشغيل
            {(failCount ?? 0) > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-0 text-xs gap-1">
                <AlertTriangle className="w-3 h-3" />
                {failCount} مرفوض
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            فحوصات الجودة · إحصاءات الإنتاج · تتبع العيوب
          </p>
        </div>
      </div>

      {/* ── التبويبات ── */}
      <Tabs defaultValue="checks" dir="rtl">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="checks" className="text-xs gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            فحوصات الجودة
            {(checks ?? 0) > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 mr-1">{checks}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            إحصاءات الجودة
          </TabsTrigger>
          <TabsTrigger value="production" className="text-xs gap-1.5">
            <Factory className="w-3.5 h-3.5" />
            سجل الإنتاج
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checks" className="mt-4">
          <QualityListTab currency={currency} />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <QualityStatsTab currency={currency} />
        </TabsContent>
        <TabsContent value="production" className="mt-4">
          <ProductionLogTab currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

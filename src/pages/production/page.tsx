import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type ProductionOrder,
  type ProductionMaterial,
  type ProductionCost,
  type ProductionCostCategory,
  PRODUCTION_COST_LABELS,
} from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import {
  Plus, Trash2, Factory, CheckCircle, ChevronDown, ChevronUp,
  Layers, Wrench, Zap, Box, Truck, Settings2, CircleDollarSign, Pencil,
} from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import { cn } from "@/lib/utils.ts";

// ── أيقونات وألوان فئات التكلفة ──────────────────────────────────────────────
const COST_ICONS: Record<ProductionCostCategory, React.FC<{ className?: string }>> = {
  labor: Wrench, energy: Zap, packaging: Box,
  maintenance: Settings2, transport: Truck,
  overhead: Layers, other: CircleDollarSign,
};
const COST_COLORS: Record<ProductionCostCategory, string> = {
  labor: "bg-blue-100 text-blue-700 border-blue-200",
  energy: "bg-yellow-100 text-yellow-700 border-yellow-200",
  packaging: "bg-purple-100 text-purple-700 border-purple-200",
  maintenance: "bg-orange-100 text-orange-700 border-orange-200",
  transport: "bg-teal-100 text-teal-700 border-teal-200",
  overhead: "bg-slate-100 text-slate-700 border-slate-200",
  other: "bg-rose-100 text-rose-700 border-rose-200",
};

type FormMat = ProductionMaterial;
const emptyMat = (): FormMat => ({ materialId: "", materialName: "", quantity: 1, unitCost: 0, total: 0 });
const emptyCost = (): ProductionCost => ({ category: "labor", description: "أجور عمالة", amount: 0 });

const statusLabel: Record<ProductionOrder["status"], string> = {
  pending: "معلق", completed: "مكتمل", cancelled: "ملغي",
};
const statusColor: Record<ProductionOrder["status"], string> = {
  pending: "text-orange-600", completed: "text-green-600", cancelled: "text-red-600",
};

function calcExtraCost(order: ProductionOrder): number {
  const newCosts = (order.additionalCosts ?? []).reduce((s, c) => s + c.amount, 0);
  const legacy = (!order.additionalCosts && order.laborCost) ? order.laborCost : 0;
  return newCosts + legacy;
}

type FormState = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  date: string;
  materialsUsed: FormMat[];
  additionalCosts: ProductionCost[];
  notes: string;
};

const defaultForm = (): FormState => ({
  productId: "", productName: "", quantity: 1, unit: "",
  date: new Date().toISOString().slice(0, 10),
  materialsUsed: [emptyMat()],
  additionalCosts: [emptyCost()],
  notes: "",
});

export default function Production() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [form, setForm] = useState<FormState>(defaultForm());

  const orders = useLiveQuery(() => db.productionOrders.orderBy("date").reverse().toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);
  const materials = useLiveQuery(() => db.rawMaterials.orderBy("name").toArray(), []);

  const totalMatCost = form.materialsUsed.reduce((sum, m) => sum + m.total, 0);
  const totalAddCost = form.additionalCosts.reduce((sum, c) => sum + c.amount, 0);
  const totalCost = totalMatCost + totalAddCost;
  const unitCost = form.quantity > 0 ? totalCost / form.quantity : 0;

  // ── فتح للتعديل ──────────────────────────────────────────────────────────────
  function openEdit(order: ProductionOrder) {
    setEditingId(order.id);
    setForm({
      productId: order.productId,
      productName: order.productName,
      quantity: order.quantity,
      unit: order.unit,
      date: order.date.slice(0, 10),
      materialsUsed: order.materialsUsed.map((m) => ({ ...m })),
      additionalCosts: order.additionalCosts && order.additionalCosts.length > 0
        ? order.additionalCosts.map((c) => ({ ...c }))
        : order.laborCost
          ? [{ category: "labor" as ProductionCostCategory, description: "أجور عمالة", amount: order.laborCost }]
          : [emptyCost()],
      notes: order.notes ?? "",
    });
    setOpen(true);
  }

  // ── تحديث مادة خام ───────────────────────────────────────────────────────────
  const updateMat = (idx: number, field: keyof FormMat, value: string | number) => {
    const mats = [...form.materialsUsed];
    const mat = { ...mats[idx], [field]: value };
    if (field === "materialId") {
      const m = materials?.find((m) => m.id === String(value));
      mat.materialName = m?.name ?? "";
      mat.unitCost = m?.price ?? 0;
    }
    if (field === "quantity" || field === "unitCost") {
      mat.total = (field === "quantity" ? Number(value) : mat.quantity) *
                  (field === "unitCost" ? Number(value) : mat.unitCost);
    }
    mats[idx] = mat;
    setForm({ ...form, materialsUsed: mats });
  };

  // ── تحديث تكلفة إضافية ───────────────────────────────────────────────────────
  const updateCost = (idx: number, field: keyof ProductionCost, value: string | number) => {
    const costs = form.additionalCosts.map((c, i) => {
      if (i !== idx) return c;
      if (field === "category") {
        return { ...c, category: value as ProductionCostCategory, description: PRODUCTION_COST_LABELS[value as ProductionCostCategory] };
      }
      return { ...c, [field]: value };
    });
    setForm({ ...form, additionalCosts: costs });
  };

  // ── حفظ (إضافة أو تعديل) ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.productId || form.quantity <= 0) { toast.error("حدد المنتج والكمية"); return; }
    if (form.materialsUsed.some((m) => !m.materialId || m.quantity <= 0)) {
      toast.error("حدد المواد المستخدمة بشكل صحيح"); return;
    }
    try {
      const isEdit = !!editingId;

      // إذا تعديل: أعد المواد القديمة للمخزون أولاً
      if (isEdit) {
        const old = await db.productionOrders.get(editingId!);
        if (old) {
          for (const mat of old.materialsUsed) {
            if (mat.materialId) {
              const m = await db.rawMaterials.get(mat.materialId);
              if (m) await db.rawMaterials.update(mat.materialId, { currentStock: m.currentStock + mat.quantity });
            }
          }
          // اطرح الكمية المنتجة القديمة من المخزون
          const prod = await db.products.get(old.productId);
          if (prod) await db.products.update(old.productId, { currentStock: Math.max(0, prod.currentStock - old.quantity) });
        }
      }

      const order: ProductionOrder = {
        id: editingId ?? crypto.randomUUID(),
        date: new Date(form.date).toISOString(),
        productId: form.productId,
        productName: form.productName,
        quantity: form.quantity,
        unit: form.unit,
        materialsUsed: form.materialsUsed,
        additionalCosts: form.additionalCosts.filter((c) => c.amount > 0),
        laborCost: undefined,
        notes: form.notes || undefined,
        status: "completed",
        completedAt: isEdit ? undefined : new Date().toISOString(),
      };

      if (isEdit) await db.productionOrders.put(order);
      else await db.productionOrders.add(order);

      // خصم المواد الخام الجديدة
      for (const mat of form.materialsUsed) {
        if (mat.materialId) {
          const m = await db.rawMaterials.get(mat.materialId);
          if (m) await db.rawMaterials.update(mat.materialId, { currentStock: Math.max(0, m.currentStock - mat.quantity) });
        }
      }

      // تحديث مخزون المنتج وسعر التكلفة
      const prod = await db.products.get(form.productId);
      if (prod) {
        await db.products.update(form.productId, {
          currentStock: prod.currentStock + form.quantity,
          costPrice: unitCost > 0 ? unitCost : prod.costPrice,
        });
      }

      toast.success(isEdit ? "تم تحديث أمر الإنتاج" : "تم تنفيذ أمر الإنتاج");
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm());
    } catch { toast.error("حدث خطأ"); }
  };

  // ── حذف ──────────────────────────────────────────────────────────────────────
  const handleDelete = async (order: ProductionOrder) => {
    if (!confirm(`هل تريد حذف أمر الإنتاج: ${order.productName}؟`)) return;
    // إعادة المواد للمخزون
    for (const mat of order.materialsUsed) {
      if (mat.materialId) {
        const m = await db.rawMaterials.get(mat.materialId);
        if (m) await db.rawMaterials.update(mat.materialId, { currentStock: m.currentStock + mat.quantity });
      }
    }
    const prod = await db.products.get(order.productId);
    if (prod) await db.products.update(order.productId, { currentStock: Math.max(0, prod.currentStock - order.quantity) });
    await db.productionOrders.delete(order.id);
    toast.success("تم حذف أمر الإنتاج");
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">الإنتاج</h1>
        <Button onClick={() => { setEditingId(null); setForm(defaultForm()); setOpen(true); }}
          className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white text-sm">
          <Plus className="w-4 h-4 ml-1" /> أمر إنتاج جديد
        </Button>
      </div>

      {!orders || orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Factory /></EmptyMedia>
            <EmptyTitle>لا توجد أوامر إنتاج</EmptyTitle>
            <EmptyDescription>أضف أول أمر إنتاج</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setOpen(true)}>إضافة أمر إنتاج</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const matCost = o.materialsUsed.reduce((s, m) => s + m.total, 0);
            const extraCost = calcExtraCost(o);
            const totCost = matCost + extraCost;
            const unitC = o.quantity > 0 ? totCost / o.quantity : 0;
            const isExpanded = expandedId === o.id;

            return (
              <div key={o.id} className="border rounded-xl overflow-hidden bg-white dark:bg-card">
                {/* ── سطر ملخص ── */}
                <div
                  className="flex flex-wrap items-start gap-2 px-3 py-3 sm:px-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                >
                  {/* معلومات أساسية */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-sm sm:text-base">{o.productName}</span>
                      <Badge variant="outline" className={cn("text-xs", statusColor[o.status])}>
                        {o.status === "completed" && <CheckCircle className="w-3 h-3 ml-1" />}
                        {statusLabel[o.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(o.date).toLocaleDateString("ar-EG")} · {o.quantity} {o.unit}
                    </p>
                    {/* الأرقام للموبايل */}
                    <div className="flex flex-wrap gap-3 mt-1.5 sm:hidden text-xs">
                      <span className="text-muted-foreground">إجمالي: <strong className="text-foreground">{totCost.toLocaleString("ar-EG")} {currency}</strong></span>
                      <span className="text-blue-600 font-semibold">وحدة: {unitC.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* الأرقام للشاشات الكبيرة */}
                  <div className="hidden sm:flex items-center gap-4 text-sm shrink-0">
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">مواد</p>
                      <p className="font-medium">{matCost.toLocaleString("ar-EG")} {currency}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">تكاليف أخرى</p>
                      <p className="font-medium">{extraCost.toLocaleString("ar-EG")} {currency}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">الإجمالي</p>
                      <p className="font-bold text-[#1e2a4a]">{totCost.toLocaleString("ar-EG")} {currency}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">تكلفة/وحدة</p>
                      <p className="font-bold text-blue-600">{unitC.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* أزرار الإجراءات */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600"
                      title="تعديل" onClick={() => openEdit(o)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
                      title="حذف" onClick={() => handleDelete(o)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-muted-foreground ml-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </div>

                {/* ── تفاصيل موسعة ── */}
                {isExpanded && (
                  <div className="border-t px-3 sm:px-4 py-3 bg-muted/10 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">المواد الخام المستخدمة</p>
                      <div className="flex flex-wrap gap-1.5">
                        {o.materialsUsed.map((m, i) => (
                          <span key={i} className="text-xs bg-white dark:bg-slate-800 border rounded px-2 py-1">
                            {m.materialName} × {m.quantity} = {m.total.toLocaleString("ar-EG")} {currency}
                          </span>
                        ))}
                      </div>
                    </div>
                    {(o.additionalCosts && o.additionalCosts.length > 0) ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">التكاليف الإضافية</p>
                        <div className="flex flex-wrap gap-1.5">
                          {o.additionalCosts.map((c, i) => {
                            const Icon = COST_ICONS[c.category];
                            return (
                              <span key={i} className={cn("text-xs border rounded px-2 py-1 flex items-center gap-1", COST_COLORS[c.category])}>
                                <Icon className="w-3 h-3" />
                                {c.description}: {c.amount.toLocaleString("ar-EG")} {currency}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : o.laborCost ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">التكاليف الإضافية</p>
                        <span className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 rounded px-2 py-1 inline-flex items-center gap-1 text-blue-700">
                          <Wrench className="w-3 h-3" /> أجور عمالة: {o.laborCost.toLocaleString("ar-EG")} {currency}
                        </span>
                      </div>
                    ) : null}
                    {o.notes && <p className="text-xs text-muted-foreground italic">{o.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog (إضافة / تعديل) ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(defaultForm()); } }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold" style={{ color: "#1e2a4a" }}>
              {editingId ? "تعديل أمر الإنتاج" : "أمر إنتاج جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* المنتج + الكمية + التاريخ */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>المنتج *</Label>
                <Select value={form.productId} onValueChange={(val) => {
                  const p = products?.find((p) => p.id === val);
                  setForm({ ...form, productId: val, productName: p?.name ?? "", unit: p?.unit ?? "" });
                }}>
                  <SelectTrigger dir="rtl"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>الكمية المنتجة *</Label>
                  <Input type="number" min={1}
                    value={form.quantity === 0 ? "" : form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                    onFocus={(e) => e.target.select()} dir="rtl" placeholder="0"
                    className="h-10 text-sm font-semibold border-2" />
                </div>
                <div className="space-y-1">
                  <Label>التاريخ</Label>
                  <Input type="date" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })} dir="rtl"
                    className="h-10 border-2" />
                </div>
              </div>
            </div>

            {/* ── المواد الخام ───────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">المواد الخام المستخدمة</Label>
                <Button size="sm" variant="secondary"
                  onClick={() => setForm({ ...form, materialsUsed: [...form.materialsUsed, emptyMat()] })}>
                  <Plus className="w-3 h-3 ml-1" /> مادة
                </Button>
              </div>
              <div className="space-y-2">
                {form.materialsUsed.map((mat, idx) => (
                  <div key={idx} className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-2 space-y-2">
                    <Select value={mat.materialId} onValueChange={(val) => updateMat(idx, "materialId", val)}>
                      <SelectTrigger dir="rtl" className="h-9 text-sm border-2 w-full">
                        <SelectValue placeholder="اختر المادة" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {materials?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({m.unit}) - متاح: {m.currentStock}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 space-y-0.5">
                        <Input type="number" placeholder="الكمية"
                          value={mat.quantity === 0 ? "" : mat.quantity}
                          onChange={(e) => updateMat(idx, "quantity", e.target.value === "" ? 0 : Number(e.target.value))}
                          onFocus={(e) => e.target.select()} dir="rtl"
                          className="h-9 text-sm font-semibold text-center border-2" />
                        <span className="text-[10px] text-muted-foreground block text-center">الكمية</span>
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <Input type="number" placeholder="سعر الوحدة"
                          value={mat.unitCost === 0 ? "" : mat.unitCost}
                          onChange={(e) => updateMat(idx, "unitCost", e.target.value === "" ? 0 : Number(e.target.value))}
                          onFocus={(e) => e.target.select()} dir="rtl"
                          className="h-9 text-sm font-semibold text-center border-2" />
                        <span className="text-[10px] text-muted-foreground block text-center">السعر</span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2 h-9 min-w-[56px]">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{mat.total.toLocaleString("ar-EG")}</span>
                        <span className="text-[9px] text-muted-foreground">{currency}</span>
                      </div>
                      <Button size="sm" variant="ghost"
                        className="text-destructive h-9 w-8 p-0 hover:bg-red-50 shrink-0"
                        onClick={() => { if (form.materialsUsed.length > 1) setForm({ ...form, materialsUsed: form.materialsUsed.filter((_, i) => i !== idx) }); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── التكاليف الإضافية ─────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">التكاليف الإضافية</Label>
                <Button size="sm" variant="secondary"
                  onClick={() => setForm({ ...form, additionalCosts: [...form.additionalCosts, emptyCost()] })}>
                  <Plus className="w-3 h-3 ml-1" /> تكلفة
                </Button>
              </div>
              <div className="space-y-2">
                {form.additionalCosts.map((cost, idx) => {
                  const Icon = COST_ICONS[cost.category];
                  return (
                    <div key={idx} className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-2">
                      {/* سطر 1: الفئة */}
                      <Select value={cost.category}
                        onValueChange={(val) => updateCost(idx, "category", val)}>
                        <SelectTrigger dir="rtl" className="h-9 text-xs border-2 w-full mb-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {(Object.keys(PRODUCTION_COST_LABELS) as ProductionCostCategory[]).map((k) => (
                            <SelectItem key={k} value={k}>{PRODUCTION_COST_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* سطر 2: الوصف + المبلغ */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="الوصف (اختياري)"
                          value={cost.description}
                          onChange={(e) => updateCost(idx, "description", e.target.value)}
                          dir="rtl" className="h-9 text-sm border-2 flex-1" />
                        <div className="relative w-28 shrink-0">
                          <Input type="number" min={0} placeholder="المبلغ"
                            value={cost.amount === 0 ? "" : cost.amount}
                            onChange={(e) => updateCost(idx, "amount", e.target.value === "" ? 0 : Number(e.target.value))}
                            onFocus={(e) => e.target.select()} dir="rtl"
                            className="h-9 text-sm font-semibold text-center border-2 pr-7" />
                          <Icon className="w-3.5 h-3.5 absolute right-2 top-2.5 text-muted-foreground" />
                        </div>
                        <Button size="sm" variant="ghost"
                          className="text-destructive h-9 w-8 p-0 hover:bg-red-50 shrink-0"
                          onClick={() => setForm({ ...form, additionalCosts: form.additionalCosts.filter((_, i) => i !== idx) })}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── ملخص التكاليف ──────────────────────────────────────────────────── */}
            <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">تكلفة المواد الخام:</span>
                <span className="font-medium">{totalMatCost.toLocaleString("ar-EG")} {currency}</span>
              </div>
              {form.additionalCosts.filter((c) => c.amount > 0).map((c, i) => {
                const Icon = COST_ICONS[c.category];
                return (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Icon className="w-3 h-3" />{c.description}:
                    </span>
                    <span className="font-medium">{c.amount.toLocaleString("ar-EG")} {currency}</span>
                  </div>
                );
              })}
              <div className="border-t pt-1.5 flex justify-between font-bold text-sm">
                <span>التكلفة الإجمالية:</span>
                <span style={{ color: "#1e2a4a" }}>{totalCost.toLocaleString("ar-EG")} {currency}</span>
              </div>
              <div className="flex justify-between text-blue-600 font-semibold text-sm">
                <span>سعر التكلفة / وحدة:</span>
                <span>{unitCost.toFixed(2)} {currency}</span>
              </div>
            </div>

            {/* ملاحظات */}
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="rtl" />
            </div>

            <div className="flex gap-3 pt-1">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                {editingId ? "حفظ التعديلات" : "تنفيذ أمر الإنتاج"}
              </Button>
              <Button variant="secondary" onClick={() => { setOpen(false); setEditingId(null); setForm(defaultForm()); }}
                className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

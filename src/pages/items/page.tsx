/**
 * صفحة الأصناف الموحدة
 * تجمع خامات الشراء (rawMaterials) ومنتجات الإنتاج (products) في تبويبين
 */
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type RawMaterial, type Product } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, AlertTriangle, FlaskConical, Package,
  TrendingDown,
} from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

type ItemTab = "materials" | "products";

// ── نماذج فارغة ──────────────────────────────────────────────────────────────
const emptyMatForm = (): Omit<RawMaterial, "id"> => ({
  name: "", unit: "", currentStock: 0, minStock: undefined, price: undefined, notes: undefined,
});

const emptyProdForm = (): Omit<Product, "id"> => ({
  name: "", unit: "", currentStock: 0, minStock: undefined, price: undefined, costPrice: undefined, notes: undefined, weight: undefined,
});

export default function ItemsPage() {
  const [tab, setTab] = useState<ItemTab>("materials");
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  // ── مواد خام ──────────────────────────────────────────────────────────────
  const [matOpen, setMatOpen] = useState(false);
  const [editingMat, setEditingMat] = useState<RawMaterial | null>(null);
  const [matForm, setMatForm] = useState(emptyMatForm());
  const [matSearch, setMatSearch] = useState("");

  const materials = useLiveQuery(() => db.rawMaterials.orderBy("name").toArray(), []);
  const filteredMats = materials?.filter(
    (m) => !matSearch || m.name.includes(matSearch) || m.unit.includes(matSearch),
  );

  const openAddMat = () => { setEditingMat(null); setMatForm(emptyMatForm()); setMatOpen(true); };
  const openEditMat = (m: RawMaterial) => { setEditingMat(m); setMatForm({ name: m.name, unit: m.unit, currentStock: m.currentStock, minStock: m.minStock, price: m.price, notes: m.notes }); setMatOpen(true); };

  const handleSaveMat = async () => {
    if (!matForm.name.trim()) { toast.error("اسم المادة مطلوب"); return; }
    if (!matForm.unit.trim()) { toast.error("الوحدة مطلوبة"); return; }
    try {
      if (editingMat) {
        await db.rawMaterials.update(editingMat.id, matForm);
        toast.success("تم التحديث");
      } else {
        await db.rawMaterials.add({ id: crypto.randomUUID(), ...matForm });
        toast.success("تمت الإضافة");
      }
      setMatOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDeleteMat = async (id: string) => {
    if (!confirm("هل تريد حذف هذه المادة؟")) return;
    await db.rawMaterials.delete(id);
    toast.success("تم الحذف");
  };

  // ── منتجات ────────────────────────────────────────────────────────────────
  const [prodOpen, setProdOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [prodForm, setProdForm] = useState(emptyProdForm());
  const [prodSearch, setProdSearch] = useState("");

  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);
  const filteredProds = products?.filter(
    (p) => !prodSearch || p.name.includes(prodSearch) || p.unit.includes(prodSearch),
  );

  const openAddProd = () => { setEditingProd(null); setProdForm(emptyProdForm()); setProdOpen(true); };
  const openEditProd = (p: Product) => {
    setEditingProd(p);
    setProdForm({ name: p.name, unit: p.unit, currentStock: p.currentStock, minStock: p.minStock, price: p.price, costPrice: p.costPrice, notes: p.notes, weight: p.weight });
    setProdOpen(true);
  };

  const handleSaveProd = async () => {
    if (!prodForm.name.trim()) { toast.error("اسم المنتج مطلوب"); return; }
    if (!prodForm.unit.trim()) { toast.error("الوحدة مطلوبة"); return; }
    try {
      if (editingProd) {
        await db.products.update(editingProd.id, prodForm);
        toast.success("تم التحديث");
      } else {
        await db.products.add({ id: crypto.randomUUID(), ...prodForm });
        toast.success("تمت الإضافة");
      }
      setProdOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDeleteProd = async (id: string) => {
    if (!confirm("هل تريد حذف هذا المنتج؟")) return;
    await db.products.delete(id);
    toast.success("تم الحذف");
  };

  // ── إحصائيات سريعة ─────────────────────────────────────────────────────────
  const lowMats = (materials ?? []).filter((m) => m.minStock !== undefined && m.currentStock <= m.minStock);
  const zeroMats = (materials ?? []).filter((m) => m.currentStock <= 0);
  const lowProds = (products ?? []).filter((p) => p.minStock !== undefined && p.currentStock <= p.minStock);
  const zeroProds = (products ?? []).filter((p) => p.currentStock <= 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">الأصناف</h1>
        <Button
          onClick={tab === "materials" ? openAddMat : openAddProd}
          className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"
        >
          <Plus className="w-4 h-4 ml-2" />
          {tab === "materials" ? "إضافة مادة خام" : "إضافة منتج"}
        </Button>
      </div>

      {/* ملخص التحذيرات */}
      {(tab === "materials" ? (lowMats.length > 0 || zeroMats.length > 0) : (lowProds.length > 0 || zeroProds.length > 0)) && (
        <div className="flex flex-wrap gap-2">
          {tab === "materials" && zeroMats.length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 text-xs text-red-700 dark:text-red-400 font-semibold">
              <TrendingDown className="w-3.5 h-3.5" /> {zeroMats.length} مادة بمخزون صفر
            </div>
          )}
          {tab === "materials" && lowMats.filter(m => m.currentStock > 0).length > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> {lowMats.filter(m => m.currentStock > 0).length} مادة تحت الحد الأدنى
            </div>
          )}
          {tab === "products" && zeroProds.length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 text-xs text-red-700 dark:text-red-400 font-semibold">
              <TrendingDown className="w-3.5 h-3.5" /> {zeroProds.length} منتج بمخزون صفر
            </div>
          )}
          {tab === "products" && lowProds.filter(p => p.currentStock > 0).length > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> {lowProds.filter(p => p.currentStock > 0).length} منتج تحت الحد الأدنى
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["materials", "products"] as ItemTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === t
                ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "materials" ? (
              <span className="flex items-center gap-1.5"><FlaskConical className="w-4 h-4" /> خامات الشراء {materials && <Badge variant="secondary" className="text-xs">{materials.length}</Badge>}</span>
            ) : (
              <span className="flex items-center gap-1.5"><Package className="w-4 h-4" /> منتجات الإنتاج {products && <Badge variant="secondary" className="text-xs">{products.length}</Badge>}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ تبويب المواد الخام ══════════════ */}
      {tab === "materials" && (
        <>
          <Input
            placeholder="بحث باسم المادة أو الوحدة..."
            value={matSearch}
            onChange={(e) => setMatSearch(e.target.value)}
            className="max-w-sm"
            dir="rtl"
          />
          {!filteredMats || filteredMats.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FlaskConical /></EmptyMedia>
                <EmptyTitle>لا توجد مواد خام</EmptyTitle>
                <EmptyDescription>أضف المواد الخام المستخدمة في الإنتاج</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={openAddMat}>إضافة مادة خام</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right p-3 font-semibold">اسم المادة</th>
                    <th className="text-right p-3 font-semibold">الوحدة</th>
                    <th className="text-right p-3 font-semibold">المخزون الحالي</th>
                    <th className="text-right p-3 font-semibold">الحد الأدنى</th>
                    <th className="text-right p-3 font-semibold">سعر الوحدة</th>
                    <th className="text-right p-3 font-semibold">الحالة</th>
                    <th className="text-right p-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMats.map((m) => {
                    const isZero = m.currentStock <= 0;
                    const isLow = !isZero && m.minStock !== undefined && m.currentStock <= m.minStock;
                    return (
                      <tr key={m.id} className={`border-b transition-colors ${isZero ? "bg-red-50/50 dark:bg-red-900/10" : isLow ? "bg-orange-50/50 dark:bg-orange-900/10" : "hover:bg-muted/20"}`}>
                        <td className="p-3 font-medium">{m.name}</td>
                        <td className="p-3 text-muted-foreground">{m.unit}</td>
                        <td className={`p-3 font-bold ${isZero ? "text-red-600" : isLow ? "text-orange-600" : "text-foreground"}`}>
                          {m.currentStock.toLocaleString("ar-EG")}
                        </td>
                        <td className="p-3 text-muted-foreground">{m.minStock?.toLocaleString("ar-EG") ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{m.price ? `${m.price.toLocaleString("ar-EG")} ${currency}` : "—"}</td>
                        <td className="p-3">
                          {isZero ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-semibold"><TrendingDown className="w-3 h-3" /> نفد المخزون</span>
                          ) : isLow ? (
                            <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> نقص</span>
                          ) : (
                            <span className="text-green-600 text-xs font-semibold">✓ طبيعي</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEditMat(m)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteMat(m.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════════════ تبويب المنتجات ══════════════ */}
      {tab === "products" && (
        <>
          <Input
            placeholder="بحث باسم المنتج أو الوحدة..."
            value={prodSearch}
            onChange={(e) => setProdSearch(e.target.value)}
            className="max-w-sm"
            dir="rtl"
          />
          {!filteredProds || filteredProds.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Package /></EmptyMedia>
                <EmptyTitle>لا توجد منتجات</EmptyTitle>
                <EmptyDescription>المنتجات تُضاف تلقائياً عند تنفيذ أوامر الإنتاج</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={openAddProd}>إضافة منتج يدوياً</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right p-3 font-semibold">اسم المنتج</th>
                    <th className="text-right p-3 font-semibold">الوحدة</th>
                    <th className="text-right p-3 font-semibold">المخزون الحالي</th>
                    <th className="text-right p-3 font-semibold">الحد الأدنى</th>
                    <th className="text-right p-3 font-semibold">سعر البيع</th>
                    <th className="text-right p-3 font-semibold">تكلفة الإنتاج</th>
                    <th className="text-right p-3 font-semibold">الحالة</th>
                    <th className="text-right p-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProds.map((p) => {
                    const isZero = p.currentStock <= 0;
                    const isLow = !isZero && p.minStock !== undefined && p.currentStock <= p.minStock;
                    return (
                      <tr key={p.id} className={`border-b transition-colors ${isZero ? "bg-red-50/50 dark:bg-red-900/10" : isLow ? "bg-orange-50/50 dark:bg-orange-900/10" : "hover:bg-muted/20"}`}>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-muted-foreground">{p.unit}</td>
                        <td className={`p-3 font-bold ${isZero ? "text-red-600" : isLow ? "text-orange-600" : "text-foreground"}`}>
                          {p.currentStock.toLocaleString("ar-EG")}
                        </td>
                        <td className="p-3 text-muted-foreground">{p.minStock?.toLocaleString("ar-EG") ?? "—"}</td>
                        <td className="p-3">{p.price ? `${p.price.toLocaleString("ar-EG")} ${currency}` : "—"}</td>
                        <td className="p-3 text-muted-foreground">{p.costPrice ? `${p.costPrice.toFixed(2)} ${currency}` : "—"}</td>
                        <td className="p-3">
                          {isZero ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-semibold"><TrendingDown className="w-3 h-3" /> نفد المخزون</span>
                          ) : isLow ? (
                            <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> نقص</span>
                          ) : (
                            <span className="text-green-600 text-xs font-semibold">✓ متوفر</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEditProd(p)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteProd(p.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════════════ Dialog مادة خام ══════════════ */}
      <Dialog open={matOpen} onOpenChange={setMatOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMat ? "تعديل المادة الخام" : "إضافة مادة خام جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم المادة *</Label>
                <Input value={matForm.name} onChange={(e) => setMatForm({ ...matForm, name: e.target.value })} dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الوحدة *</Label>
                <Input value={matForm.unit} onChange={(e) => setMatForm({ ...matForm, unit: e.target.value })} placeholder="كيلو، لتر، طن..." dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المخزون الحالي</Label>
                <Input type="number" value={matForm.currentStock === 0 ? "" : matForm.currentStock} onChange={(e) => setMatForm({ ...matForm, currentStock: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الحد الأدنى للتنبيه</Label>
                <Input type="number" value={matForm.minStock ?? ""} onChange={(e) => setMatForm({ ...matForm, minStock: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="اختياري" dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>سعر الوحدة ({currency})</Label>
              <Input type="number" value={matForm.price ?? ""} onChange={(e) => setMatForm({ ...matForm, price: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={matForm.notes ?? ""} onChange={(e) => setMatForm({ ...matForm, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveMat} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editingMat ? "حفظ التعديلات" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setMatOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════ Dialog منتج ══════════════ */}
      <Dialog open={prodOpen} onOpenChange={setProdOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProd ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم المنتج *</Label>
                <Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الوحدة *</Label>
                <Input value={prodForm.unit} onChange={(e) => setProdForm({ ...prodForm, unit: e.target.value })} placeholder="كيلو، لتر..." dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المخزون الحالي</Label>
                <Input type="number" value={prodForm.currentStock === 0 ? "" : prodForm.currentStock} onChange={(e) => setProdForm({ ...prodForm, currentStock: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الحد الأدنى للتنبيه</Label>
                <Input type="number" value={prodForm.minStock ?? ""} onChange={(e) => setProdForm({ ...prodForm, minStock: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="اختياري" dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>سعر البيع ({currency})</Label>
                <Input type="number" value={prodForm.price ?? ""} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الوزن (كجم)</Label>
                <Input type="number" value={prodForm.weight ?? ""} onChange={(e) => setProdForm({ ...prodForm, weight: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="اختياري" dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={prodForm.notes ?? ""} onChange={(e) => setProdForm({ ...prodForm, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveProd} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editingProd ? "حفظ التعديلات" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setProdOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

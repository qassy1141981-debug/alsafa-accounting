import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Product } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle, Package, FileText, Printer } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

const emptyForm = (): Omit<Product, "id"> => ({
  name: "", unit: "", currentStock: 0, minStock: undefined,
  price: undefined, costPrice: undefined, notes: undefined, weight: undefined,
});

export default function Products() {
  const [open, setOpen] = useState(false);
  const [statOpen, setStatOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [statFrom, setStatFrom] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [statTo, setStatTo] = useState(new Date().toISOString().slice(0, 10));
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);
  const filtered = products?.filter((p) => !search || p.name.includes(search));

  // جلب كل مبيعات الصنف المحدد
  const allSales = useLiveQuery(async () => {
    if (!selectedProduct) return [];
    const sales = await db.sales.orderBy("date").toArray();
    return sales.filter((s) => s.items.some((i) => i.productId === selectedProduct.id));
  }, [selectedProduct?.id]);

  // تصفية حسب الفترة
  const from = new Date(statFrom).toISOString();
  const to = new Date(statTo + "T23:59:59").toISOString();
  const periodSales = allSales?.filter((s) => s.date >= from && s.date <= to) ?? [];

  // بناء سجل الحركات: صف لكل فاتورة مع الكمية والسعر
  type SaleLine = {
    date: string;
    invoiceNumber: string;
    customerName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    saleId: string;
  };

  const lines: SaleLine[] = periodSales.flatMap((s) =>
    s.items
      .filter((i) => i.productId === selectedProduct?.id)
      .map((i) => ({
        date: s.date,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        saleId: s.id,
      })),
  );

  // مجاميع
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalRevenue = lines.reduce((s, l) => s + l.total, 0);
  const costPrice = selectedProduct?.costPrice ?? 0;
  const totalCost = totalQty * costPrice;
  const totalProfit = totalRevenue - totalCost;

  // ملخص لكل عميل
  const perCustomer = new Map<string, { qty: number; total: number; count: number }>();
  for (const l of lines) {
    const prev = perCustomer.get(l.customerName) ?? { qty: 0, total: 0, count: 0 };
    perCustomer.set(l.customerName, {
      qty: prev.qty + l.quantity,
      total: prev.total + l.total,
      count: prev.count + 1,
    });
  }
  const customerSummary = Array.from(perCustomer.entries())
    .sort(([, a], [, b]) => b.qty - a.qty);

  // ── عمليات ──
  const openAdd = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, unit: p.unit, currentStock: p.currentStock, minStock: p.minStock, price: p.price, costPrice: p.costPrice, notes: p.notes, weight: p.weight });
    setOpen(true);
  };
  const openStat = (p: Product) => { setSelectedProduct(p); setStatOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("اسم المنتج مطلوب"); return; }
    if (!form.unit.trim()) { toast.error("الوحدة مطلوبة"); return; }
    try {
      if (editing) {
        await db.products.update(editing.id, form);
        toast.success("تم التحديث");
      } else {
        await db.products.add({ id: crypto.randomUUID(), ...form });
        toast.success("تمت الإضافة");
      }
      setOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذا المنتج؟")) return;
    await db.products.delete(id);
    toast.success("تم الحذف");
  };

  // طباعة كشف الصنف
  const printStat = () => {
    if (!selectedProduct) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head>
  <meta charset="UTF-8"><title>كشف حساب صنف — ${selectedProduct.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Cairo',sans-serif;background:#f0f4f8;color:#1a1a2e;font-size:13px}
    .page{background:#fff;max-width:820px;margin:20px auto;padding:36px;box-shadow:0 4px 20px rgba(0,0,0,.1);border-radius:12px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1e2a4a;margin-bottom:20px}
    .company-name{font-size:18px;font-weight:800;color:#1e2a4a}
    .company-detail{font-size:11px;color:#64748b;line-height:1.8;margin-top:3px}
    .product-card{background:#f0f4ff;border:1px solid #c7d2fe;border-right:5px solid #1e2a4a;border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
    .product-name{font-size:18px;font-weight:800;color:#1e2a4a}
    .product-meta{font-size:12px;color:#64748b;margin-top:3px}
    .summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
    .sum-card{flex:1;min-width:130px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center}
    .sum-label{font-size:11px;color:#94a3b8;margin-bottom:4px}
    .sum-val{font-size:17px;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead tr{background:#1e2a4a;color:#fff}
    thead th{padding:9px 12px;text-align:right;font-size:12px;font-weight:600}
    thead th:first-child{border-radius:0 6px 6px 0}
    thead th:last-child{border-radius:6px 0 0 6px}
    tbody tr{border-bottom:1px solid #f1f5f9}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody td{padding:9px 12px;font-size:12px}
    tfoot tr{background:#eff6ff;font-weight:700;border-top:2px solid #bfdbfe}
    tfoot td{padding:9px 12px;font-size:13px}
    .section-title{font-size:14px;font-weight:800;color:#1e2a4a;margin:20px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
    .footer{border-top:2px solid #1e2a4a;padding-top:12px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:20px}
    @media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0;padding:20px}}
  </style>
</head><body>
<div class="page">

  <div class="header">
    <div style="display:flex;gap:12px;align-items:center">
      ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="width:60px;height:60px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0">` : ""}
      <div>
        <div class="company-name">${settings?.companyName ?? "الشركة"}</div>
        <div class="company-detail">
          ${settings?.companyAddress ? `📍 ${settings.companyAddress}<br>` : ""}
          ${settings?.companyPhone ? `📞 ${settings.companyPhone}` : ""}
        </div>
      </div>
    </div>
    <div style="text-align:left">
      <div style="font-size:22px;font-weight:800;color:#1e2a4a">كشف مسحوبات صنف</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">من ${statFrom} إلى ${statTo}</div>
    </div>
  </div>

  <div class="product-card">
    <div>
      <div class="product-name">📦 ${selectedProduct.name}</div>
      <div class="product-meta">الوحدة: ${selectedProduct.unit} • المخزون الحالي: ${selectedProduct.currentStock.toLocaleString("ar-EG")} ${selectedProduct.unit}</div>
    </div>
    <div style="text-align:left">
      <div style="font-size:12px;color:#64748b">الفترة</div>
      <div style="font-size:14px;font-weight:700;color:#1e2a4a">${statFrom} — ${statTo}</div>
    </div>
  </div>

  <div class="summary">
    <div class="sum-card">
      <div class="sum-label">إجمالي الكمية المباعة</div>
      <div class="sum-val" style="color:#1e2a4a">${totalQty.toLocaleString("ar-EG")} ${selectedProduct.unit}</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">عدد الفواتير</div>
      <div class="sum-val" style="color:#3b82f6">${lines.length} فاتورة</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">إجمالي الإيراد</div>
      <div class="sum-val" style="color:#16a34a">${totalRevenue.toLocaleString("ar-EG")} ${currency}</div>
    </div>
    ${costPrice > 0 ? `<div class="sum-card">
      <div class="sum-label">صافي الربح</div>
      <div class="sum-val" style="color:${totalProfit >= 0 ? "#2563eb" : "#dc2626"}">${totalProfit.toLocaleString("ar-EG")} ${currency}</div>
    </div>` : ""}
  </div>

  <!-- تفاصيل الحركات -->
  <div class="section-title">تفاصيل المسحوبات بالتواريخ</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>التاريخ</th>
        <th>رقم الفاتورة</th>
        <th>العميل</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((l, i) => `
        <tr>
          <td style="color:#94a3b8">${i + 1}</td>
          <td>${new Date(l.date).toLocaleDateString("ar-EG")}</td>
          <td style="color:#3b82f6;font-weight:600">${l.invoiceNumber}</td>
          <td style="font-weight:600">${l.customerName}</td>
          <td style="font-weight:700;color:#1e2a4a">${l.quantity.toLocaleString("ar-EG")} ${selectedProduct.unit}</td>
          <td style="color:#64748b">${l.unitPrice.toLocaleString("ar-EG")} ${currency}</td>
          <td style="font-weight:700;color:#16a34a">${l.total.toLocaleString("ar-EG")} ${currency}</td>
        </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="font-weight:700">الإجمالي</td>
        <td style="color:#1e2a4a;font-weight:800">${totalQty.toLocaleString("ar-EG")} ${selectedProduct.unit}</td>
        <td>—</td>
        <td style="color:#16a34a;font-weight:800">${totalRevenue.toLocaleString("ar-EG")} ${currency}</td>
      </tr>
    </tfoot>
  </table>

  <!-- ملخص لكل عميل -->
  <div class="section-title">ملخص المسحوبات لكل عميل</div>
  <table>
    <thead>
      <tr>
        <th>العميل</th>
        <th>عدد الفواتير</th>
        <th>إجمالي الكمية</th>
        <th>إجمالي المبلغ</th>
        <th>نسبة من الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${customerSummary.map(([name, v]) => `
        <tr>
          <td style="font-weight:700">${name}</td>
          <td>${v.count} فاتورة</td>
          <td style="font-weight:700;color:#1e2a4a">${v.qty.toLocaleString("ar-EG")} ${selectedProduct.unit}</td>
          <td style="color:#16a34a;font-weight:600">${v.total.toLocaleString("ar-EG")} ${currency}</td>
          <td>${totalQty > 0 ? (v.qty / totalQty * 100).toFixed(1) + "%" : "—"}</td>
        </tr>`).join("")}
    </tbody>
  </table>

  <div class="footer">
    <span>طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")}</span>
    <span>${settings?.companyName ?? "النظام المحاسبي"} • كشف مسحوبات صنف</span>
  </div>
</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ── الواجهة ──
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <Button onClick={openAdd} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
          <Plus className="w-4 h-4 ml-2" /> إضافة منتج
        </Button>
      </div>

      <Input placeholder="بحث باسم المنتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" dir="rtl" />

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Package /></EmptyMedia>
            <EmptyTitle>لا توجد منتجات</EmptyTitle>
            <EmptyDescription>أضف أول منتج للبدء</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openAdd}>إضافة منتج</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">المنتج</th>
                <th className="text-right p-3 font-semibold">الوحدة</th>
                <th className="text-right p-3 font-semibold">المخزون</th>
                <th className="text-right p-3 font-semibold">سعر التكلفة</th>
                <th className="text-right p-3 font-semibold">سعر البيع</th>
                <th className="text-right p-3 font-semibold">هامش الربح</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-center p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = p.minStock !== undefined && p.currentStock <= p.minStock;
                const margin = p.price && p.costPrice ? ((p.price - p.costPrice) / p.price * 100).toFixed(1) : null;
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.unit}</td>
                    <td className="p-3">{p.currentStock.toLocaleString("ar-EG")}</td>
                    <td className="p-3 text-muted-foreground">{p.costPrice?.toLocaleString("ar-EG") ?? "—"} {p.costPrice ? currency : ""}</td>
                    <td className="p-3 font-medium text-green-700 dark:text-green-400">{p.price?.toLocaleString("ar-EG") ?? "—"} {p.price ? currency : ""}</td>
                    <td className="p-3">{margin ? <span className="text-blue-600 font-semibold">{margin}%</span> : "—"}</td>
                    <td className="p-3">
                      {low ? (
                        <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> نقص</span>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">✓ طبيعي</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="ghost" title="كشف مسحوبات الصنف" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openStat(p)}>
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="تعديل" onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="حذف" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Dialog إضافة / تعديل */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editing ? "تعديل المنتج" : "إضافة منتج"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم المنتج *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>الوحدة *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="جمدانة، كرتون..." dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المخزون الحالي</Label>
                <Input type="number" value={form.currentStock === 0 ? "" : form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>الحد الأدنى للتنبيه</Label>
                <Input type="number" value={form.minStock ?? ""} onChange={(e) => setForm({ ...form, minStock: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>سعر التكلفة</Label>
                <Input type="number" value={form.costPrice ?? ""} onChange={(e) => setForm({ ...form, costPrice: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>سعر البيع</Label>
                <Input type="number" value={form.price ?? ""} onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editing ? "حفظ التعديلات" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog كشف مسحوبات الصنف */}
      <Dialog open={statOpen} onOpenChange={(v) => { if (!v) setStatOpen(false); }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1e2a4a]" />
              كشف مسحوبات — {selectedProduct?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* فلتر الفترة */}
            <div className="flex items-center gap-3 flex-wrap bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">من:</Label>
                <Input type="date" value={statFrom} onChange={(e) => setStatFrom(e.target.value)} className="w-38 h-8" dir="rtl" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">إلى:</Label>
                <Input type="date" value={statTo} onChange={(e) => setStatTo(e.target.value)} className="w-38 h-8" dir="rtl" />
              </div>
              <Button onClick={printStat} size="sm" className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white mr-auto">
                <Printer className="w-3.5 h-3.5 ml-2" /> طباعة
              </Button>
            </div>

            {/* بطاقات الملخص */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-0 bg-[#1e2a4a]/5 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">إجمالي الكمية</p>
                  <p className="font-bold text-[#1e2a4a] dark:text-blue-300 text-lg">
                    {totalQty.toLocaleString("ar-EG")} <span className="text-sm font-normal">{selectedProduct?.unit}</span>
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-blue-50 dark:bg-blue-900/20 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">عدد الفواتير</p>
                  <p className="font-bold text-blue-700 dark:text-blue-400 text-lg">{lines.length}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-green-50 dark:bg-green-900/20 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">إجمالي الإيراد</p>
                  <p className="font-bold text-green-700 dark:text-green-400 text-lg">{totalRevenue.toLocaleString("ar-EG")} {currency}</p>
                </CardContent>
              </Card>
              {costPrice > 0 && (
                <Card className={`border-0 shadow-sm ${totalProfit >= 0 ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">صافي الربح</p>
                    <p className={`font-bold text-lg ${totalProfit >= 0 ? "text-indigo-700 dark:text-indigo-400" : "text-red-700 dark:text-red-400"}`}>
                      {totalProfit.toLocaleString("ar-EG")} {currency}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* جدول الحركات التفصيلية */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">تفاصيل المسحوبات بالتواريخ</h3>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1e2a4a] text-white">
                      <th className="text-right p-3">#</th>
                      <th className="text-right p-3">التاريخ</th>
                      <th className="text-right p-3">رقم الفاتورة</th>
                      <th className="text-right p-3">العميل</th>
                      <th className="text-right p-3">الكمية</th>
                      <th className="text-right p-3">سعر الوحدة</th>
                      <th className="text-right p-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد مسحوبات في هذه الفترة</td></tr>
                    ) : (
                      lines.map((l, i) => (
                        <tr key={`${l.saleId}-${i}`} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="p-3 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="p-3 text-muted-foreground text-xs">{new Date(l.date).toLocaleDateString("ar-EG")}</td>
                          <td className="p-3 font-semibold text-blue-600">{l.invoiceNumber}</td>
                          <td className="p-3 font-medium">{l.customerName}</td>
                          <td className="p-3 font-bold text-[#1e2a4a] dark:text-blue-300">
                            {l.quantity.toLocaleString("ar-EG")} <span className="text-xs font-normal text-muted-foreground">{selectedProduct?.unit}</span>
                          </td>
                          <td className="p-3 text-muted-foreground">{l.unitPrice.toLocaleString("ar-EG")} {currency}</td>
                          <td className="p-3 font-bold text-green-600">{l.total.toLocaleString("ar-EG")} {currency}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {lines.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/40 border-t-2 font-bold">
                        <td colSpan={4} className="p-3">الإجمالي</td>
                        <td className="p-3 text-[#1e2a4a] dark:text-blue-300">
                          {totalQty.toLocaleString("ar-EG")} {selectedProduct?.unit}
                        </td>
                        <td className="p-3">—</td>
                        <td className="p-3 text-green-600">{totalRevenue.toLocaleString("ar-EG")} {currency}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ملخص لكل عميل */}
            {customerSummary.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">ملخص المسحوبات لكل عميل</h3>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-right p-3 font-semibold">العميل</th>
                        <th className="text-right p-3 font-semibold">عدد الفواتير</th>
                        <th className="text-right p-3 font-semibold">إجمالي الكمية</th>
                        <th className="text-right p-3 font-semibold">إجمالي المبلغ</th>
                        <th className="text-right p-3 font-semibold">نسبة من الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerSummary.map(([name, v]) => (
                        <tr key={name} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-semibold">{name}</td>
                          <td className="p-3 text-muted-foreground">{v.count} فاتورة</td>
                          <td className="p-3 font-bold text-[#1e2a4a] dark:text-blue-300">
                            {v.qty.toLocaleString("ar-EG")} {selectedProduct?.unit}
                          </td>
                          <td className="p-3 font-semibold text-green-600">{v.total.toLocaleString("ar-EG")} {currency}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-[#1e2a4a]" style={{ width: `${totalQty > 0 ? (v.qty / totalQty * 100) : 0}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-[#1e2a4a] dark:text-blue-300">
                                {totalQty > 0 ? (v.qty / totalQty * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

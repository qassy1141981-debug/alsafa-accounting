import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Purchase, type PurchaseItem, addTreasuryEntry } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart, Printer, Pencil } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

type FormItem = { materialId: string; materialName: string; quantity: number; unitPrice: number; total: number };

const emptyItem = (): FormItem => ({ materialId: "", materialName: "", quantity: 1, unitPrice: 0, total: 0 });

const statusLabel: Record<Purchase["paymentStatus"], string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
const statusColor: Record<Purchase["paymentStatus"], string> = { paid: "text-green-600", partial: "text-orange-600", unpaid: "text-red-600" };

const emptyForm = () => ({
  supplierId: "",
  supplierName: "",
  invoiceNumber: "",
  date: new Date().toISOString().slice(0, 10),
  items: [emptyItem()] as FormItem[],
  paidAmount: 0,
  notes: "",
});

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newSuppOpen, setNewSuppOpen] = useState(false);
  const [newSuppForm, setNewSuppForm] = useState({ name: "", phone: "" });
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [form, setForm] = useState(emptyForm());

  const purchases = useLiveQuery(() => db.purchases.orderBy("date").reverse().toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.orderBy("name").toArray(), []);
  const materials = useLiveQuery(() => db.rawMaterials.orderBy("name").toArray(), []);

  const filtered = purchases?.filter((p) =>
    !search || p.supplierName?.includes(search) || p.invoiceNumber?.includes(search),
  );

  const totalAmount = form.items.reduce((sum, i) => sum + i.total, 0);
  const remainingAmount = Math.max(0, totalAmount - form.paidAmount);
  const paymentStatus: Purchase["paymentStatus"] =
    form.paidAmount >= totalAmount && totalAmount > 0 ? "paid" : form.paidAmount > 0 ? "partial" : "unpaid";

  const updateItem = (idx: number, field: keyof FormItem, value: string | number) => {
    const items = [...form.items];
    const item = { ...items[idx], [field]: value };
    if (field === "materialId") {
      const mat = materials?.find((m) => m.id === String(value));
      item.materialName = mat?.name ?? "";
      item.unitPrice = mat?.price ?? 0;
    }
    if (field === "quantity" || field === "unitPrice") {
      item.total = item.quantity * item.unitPrice;
    }
    items[idx] = item;
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, emptyItem()] });
  const removeItem = (idx: number) => {
    if (form.items.length === 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const handleAddNewSupplier = async () => {
    if (!newSuppForm.name.trim()) { toast.error("اسم المورد مطلوب"); return; }
    const id = crypto.randomUUID();
    await db.suppliers.add({ id, name: newSuppForm.name.trim(), phone: newSuppForm.phone || undefined });
    setForm({ ...form, supplierId: id, supplierName: newSuppForm.name.trim() });
    setNewSuppForm({ name: "", phone: "" });
    setNewSuppOpen(false);
    toast.success("تمت إضافة المورد");
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (p: Purchase) => {
    setEditingId(p.id);
    setForm({
      supplierId: p.supplierId ?? "",
      supplierName: p.supplierName ?? "",
      invoiceNumber: p.invoiceNumber ?? "",
      date: p.date.slice(0, 10),
      items: p.items as FormItem[],
      paidAmount: p.paidAmount,
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (form.items.some((i) => !i.materialId || i.quantity <= 0)) {
      toast.error("يرجى تحديد المواد والكميات"); return;
    }
    try {
      if (editingId) {
        // ── تعديل فاتورة موجودة ──
        const oldPurchase = await db.purchases.get(editingId);
        if (!oldPurchase) { toast.error("لم يتم العثور على الفاتورة"); return; }

        // 1. عكس المخزون القديم
        for (const oldItem of oldPurchase.items) {
          if (oldItem.materialId) {
            const mat = await db.rawMaterials.get(oldItem.materialId);
            if (mat) {
              await db.rawMaterials.update(oldItem.materialId, {
                currentStock: Math.max(0, mat.currentStock - oldItem.quantity),
              });
            }
          }
        }

        // 2. عكس حركة الخزينة القديمة (إن وُجدت)
        if (oldPurchase.paidAmount > 0) {
          const oldEntries = await db.treasury
            .where("reference")
            .equals(editingId)
            .toArray();
          for (const entry of oldEntries) {
            await db.treasury.delete(entry.id);
          }
        }

        // 3. حفظ الفاتورة المحدَّثة
        const updated: Purchase = {
          id: editingId,
          date: new Date(form.date).toISOString(),
          supplierId: form.supplierId || undefined,
          supplierName: form.supplierName || "غير محدد",
          invoiceNumber: form.invoiceNumber || undefined,
          items: form.items,
          totalAmount,
          paidAmount: form.paidAmount,
          remainingAmount,
          paymentStatus,
          notes: form.notes || undefined,
        };
        await db.purchases.put(updated);

        // 4. تطبيق المخزون الجديد
        for (const item of form.items) {
          if (item.materialId) {
            const mat = await db.rawMaterials.get(item.materialId);
            if (mat) {
              await db.rawMaterials.update(item.materialId, {
                currentStock: mat.currentStock + item.quantity,
              });
            }
          }
        }

        // 5. إضافة حركة خزينة جديدة إن وُجد مبلغ مدفوع
        if (form.paidAmount > 0) {
          await addTreasuryEntry({
            date: new Date(form.date).toISOString(),
            type: "out",
            category: "مشتريات",
            amount: form.paidAmount,
            description: `مشتريات من ${updated.supplierName}`,
            reference: editingId,
          });
        }

        toast.success("تم تعديل فاتورة الشراء");
      } else {
        // ── إضافة فاتورة جديدة ──
        const purchase: Purchase = {
          id: crypto.randomUUID(),
          date: new Date(form.date).toISOString(),
          supplierId: form.supplierId || undefined,
          supplierName: form.supplierName || "غير محدد",
          invoiceNumber: form.invoiceNumber || undefined,
          items: form.items,
          totalAmount,
          paidAmount: form.paidAmount,
          remainingAmount,
          paymentStatus,
          notes: form.notes || undefined,
        };
        await db.purchases.add(purchase);

        for (const item of form.items) {
          if (item.materialId) {
            const mat = await db.rawMaterials.get(item.materialId);
            if (mat) {
              await db.rawMaterials.update(item.materialId, { currentStock: mat.currentStock + item.quantity });
            }
          }
        }

        if (form.paidAmount > 0) {
          await addTreasuryEntry({
            date: new Date(form.date).toISOString(),
            type: "out",
            category: "مشتريات",
            amount: form.paidAmount,
            description: `مشتريات من ${purchase.supplierName}`,
            reference: purchase.id,
          });
        }

        toast.success("تمت إضافة فاتورة الشراء");
      }

      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch { toast.error("حدث خطأ أثناء الحفظ"); }
  };

  const printPurchase = (p: Purchase) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8">
        <title>فاتورة شراء</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 20px; font-size: 14px; }
          h2 { text-align: center; color: #1e2a4a; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e2a4a; padding-bottom: 10px; }
          .logo { max-height: 80px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #1e2a4a; color: white; }
          .total { font-weight: bold; font-size: 16px; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head><body>
        <div class="header">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" class="logo"><br>` : ""}
          <h2>${settings?.companyName ?? "الشركة"}</h2>
          <p>${settings?.companyAddress ?? ""} | ${settings?.companyPhone ?? ""}</p>
          ${settings?.taxNumber ? `<p>الرقم الضريبي: ${settings.taxNumber}</p>` : ""}
        </div>
        <h3 style="text-align:center">فاتورة شراء</h3>
        <p>المورد: ${p.supplierName} | التاريخ: ${new Date(p.date).toLocaleDateString("ar-EG")} ${p.invoiceNumber ? `| رقم الفاتورة: ${p.invoiceNumber}` : ""}</p>
        <table>
          <tr><th>المادة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>
          ${p.items.map((i) => `<tr><td>${i.materialName}</td><td>${i.quantity}</td><td>${i.unitPrice} ${currency}</td><td>${i.total} ${currency}</td></tr>`).join("")}
        </table>
        <p class="total" style="margin-top:15px">الإجمالي: ${p.totalAmount} ${currency} | المدفوع: ${p.paidAmount} ${currency} | المتبقي: ${p.remainingAmount} ${currency}</p>
        <div class="footer">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">المشتريات</h1>
        <Button onClick={openAdd} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
          <Plus className="w-4 h-4 ml-2" /> فاتورة شراء جديدة
        </Button>
      </div>

      <Input placeholder="بحث بالمورد أو رقم الفاتورة..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" dir="rtl" />

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
            <EmptyTitle>لا توجد فواتير مشتريات</EmptyTitle>
            <EmptyDescription>أضف أول فاتورة شراء</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openAdd}>إضافة فاتورة</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">التاريخ</th>
                <th className="text-right p-3 font-semibold">المورد</th>
                <th className="text-right p-3 font-semibold">رقم الفاتورة</th>
                <th className="text-right p-3 font-semibold">الإجمالي</th>
                <th className="text-right p-3 font-semibold">المدفوع</th>
                <th className="text-right p-3 font-semibold">المتبقي</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-right p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b hover:bg-muted/20">
                  <td className="p-3 text-muted-foreground">{new Date(p.date).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3 font-medium">{p.supplierName}</td>
                  <td className="p-3 text-muted-foreground">{p.invoiceNumber ?? "-"}</td>
                  <td className="p-3 font-bold">{p.totalAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className="p-3 text-green-600">{p.paidAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className="p-3 text-red-600">{p.remainingAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className={`p-3 font-semibold ${statusColor[p.paymentStatus]}`}>{statusLabel[p.paymentStatus]}</td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="تعديل">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => printPurchase(p)} title="طباعة">
                      <Printer className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Purchase Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل فاتورة الشراء" : "فاتورة شراء جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>المورد</Label>
                  <button type="button" onClick={() => setNewSuppOpen(true)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer">+ مورد جديد</button>
                </div>
                <Select value={form.supplierId} onValueChange={(val) => {
                  const s = suppliers?.find((s) => s.id === val);
                  setForm({ ...form, supplierId: val, supplierName: s?.name ?? "" });
                }}>
                  <SelectTrigger dir="rtl"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>اسم المورد (يدوي)</Label>
                <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value, supplierId: "" })} placeholder="أو اكتب اسم المورد" dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>رقم الفاتورة</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} dir="rtl" />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">الأصناف</Label>
                <Button size="sm" onClick={addItem} variant="secondary"><Plus className="w-3 h-3 ml-1" /> إضافة صنف</Button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-2 p-2 rounded-lg border bg-white dark:bg-card">
                  <Select value={item.materialId} onValueChange={(val) => updateItem(idx, "materialId", val)}>
                    <SelectTrigger dir="rtl" className="h-10 text-sm font-medium border-2 w-full">
                      <SelectValue placeholder="اختر المادة" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {materials?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Input
                        type="number"
                        placeholder="الكمية"
                        value={item.quantity === 0 ? "" : item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value === "" ? 0 : Number(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        dir="rtl"
                        className="h-10 text-sm font-semibold text-center border-2"
                      />
                      <span className="text-[10px] text-muted-foreground block text-center mt-0.5">الكمية</span>
                    </div>
                    <div className="flex-1">
                      <Input
                        type="number"
                        placeholder="سعر الوحدة"
                        value={item.unitPrice === 0 ? "" : item.unitPrice}
                        onChange={(e) => updateItem(idx, "unitPrice", e.target.value === "" ? 0 : Number(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        dir="rtl"
                        className="h-10 text-sm font-semibold text-center border-2"
                      />
                      <span className="text-[10px] text-muted-foreground block text-center mt-0.5">السعر</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 h-10 min-w-[64px]">
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300 leading-tight">{item.total.toLocaleString("ar-EG")}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{currency}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0 hover:bg-red-50 shrink-0" onClick={() => removeItem(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
              <span className="font-semibold">الإجمالي:</span>
              <span className="font-bold text-lg">{totalAmount.toLocaleString("ar-EG")} {currency}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">المبلغ المدفوع</Label>
                <Input
                  type="number"
                  value={form.paidAmount === 0 ? "" : form.paidAmount}
                  onChange={(e) => setForm({ ...form, paidAmount: e.target.value === "" ? 0 : Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  dir="rtl"
                  placeholder="0"
                  className="h-10 text-sm font-semibold border-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-semibold">المتبقي</Label>
                <div className="h-10 flex items-center px-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-md font-bold text-red-600">
                  {remainingAmount.toLocaleString("ar-EG")} {currency}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="rtl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                {editingId ? "حفظ التعديلات" : "حفظ الفاتورة"}
              </Button>
              <Button variant="secondary" onClick={() => { setOpen(false); setEditingId(null); setForm(emptyForm()); }} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Supplier Dialog */}
      <Dialog open={newSuppOpen} onOpenChange={setNewSuppOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>إضافة مورد جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>اسم المورد *</Label>
              <Input value={newSuppForm.name} onChange={(e) => setNewSuppForm({ ...newSuppForm, name: e.target.value })} dir="rtl" placeholder="اسم المورد" />
            </div>
            <div className="space-y-1">
              <Label>رقم الهاتف</Label>
              <Input value={newSuppForm.phone} onChange={(e) => setNewSuppForm({ ...newSuppForm, phone: e.target.value })} dir="rtl" placeholder="اختياري" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleAddNewSupplier} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">إضافة</Button>
              <Button variant="secondary" onClick={() => setNewSuppOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

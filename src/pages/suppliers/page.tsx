import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Supplier } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

const emptyForm = (): Omit<Supplier, "id"> => ({ name: "", phone: undefined, address: undefined, notes: undefined });

export default function Suppliers() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");

  const suppliers = useLiveQuery(() => db.suppliers.orderBy("name").toArray(), []);

  // Total purchases per supplier
  const purchases = useLiveQuery(() => db.purchases.toArray(), []);
  const supplierTotals = new Map<string, number>();
  purchases?.forEach((p) => {
    if (p.supplierId) {
      supplierTotals.set(p.supplierId, (supplierTotals.get(p.supplierId) ?? 0) + p.totalAmount);
    }
  });

  const filtered = suppliers?.filter((s) => s.name.includes(search) || s.phone?.includes(search));

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, phone: s.phone, address: s.address, notes: s.notes }); setOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("اسم المورد مطلوب"); return; }
    try {
      if (editing) {
        await db.suppliers.update(editing.id, form);
        toast.success("تم التحديث");
      } else {
        await db.suppliers.add({ id: crypto.randomUUID(), ...form });
        toast.success("تمت الإضافة");
      }
      setOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDelete = async (id: string) => {
    await db.suppliers.delete(id);
    toast.success("تم الحذف");
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">الموردين</h1>
        <Button onClick={openAdd} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
          <Plus className="w-4 h-4 ml-2" /> إضافة مورد
        </Button>
      </div>

      <Input placeholder="بحث باسم أو هاتف المورد..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" dir="rtl" />

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Truck /></EmptyMedia>
            <EmptyTitle>لا يوجد موردون</EmptyTitle>
            <EmptyDescription>أضف أول مورد للبدء</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openAdd}>إضافة مورد</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">اسم المورد</th>
                <th className="text-right p-3 font-semibold">الهاتف</th>
                <th className="text-right p-3 font-semibold">العنوان</th>
                <th className="text-right p-3 font-semibold">إجمالي المشتريات</th>
                <th className="text-right p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b hover:bg-muted/20">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.phone ?? "-"}</td>
                  <td className="p-3 text-muted-foreground">{s.address ?? "-"}</td>
                  <td className="p-3 font-semibold text-orange-600">
                    {(supplierTotals.get(s.id) ?? 0).toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editing ? "تعديل المورد" : "إضافة مورد"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>اسم المورد *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الهاتف</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>العنوان</Label>
                <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value || undefined })} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editing ? "حفظ" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

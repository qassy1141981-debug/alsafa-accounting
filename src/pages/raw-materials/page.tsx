import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type RawMaterial } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle, FlaskConical } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

const emptyForm = (): Omit<RawMaterial, "id"> => ({
  name: "",
  unit: "",
  currentStock: 0,
  minStock: undefined,
  price: undefined,
  notes: undefined,
});

export default function RawMaterials() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");

  const materials = useLiveQuery(() => db.rawMaterials.orderBy("name").toArray(), []);

  const filtered = materials?.filter((m) =>
    m.name.includes(search) || m.unit.includes(search),
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({ name: m.name, unit: m.unit, currentStock: m.currentStock, minStock: m.minStock, price: m.price, notes: m.notes });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("اسم المادة مطلوب"); return; }
    if (!form.unit.trim()) { toast.error("الوحدة مطلوبة"); return; }
    try {
      if (editing) {
        await db.rawMaterials.update(editing.id, form);
        toast.success("تم التحديث");
      } else {
        await db.rawMaterials.add({ id: crypto.randomUUID(), ...form });
        toast.success("تمت الإضافة");
      }
      setOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDelete = async (id: string) => {
    await db.rawMaterials.delete(id);
    toast.success("تم الحذف");
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المواد الخام</h1>
        <Button onClick={openAdd} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
          <Plus className="w-4 h-4 ml-2" /> إضافة مادة
        </Button>
      </div>

      <Input
        placeholder="بحث باسم المادة..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        dir="rtl"
      />

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FlaskConical /></EmptyMedia>
            <EmptyTitle>لا توجد مواد خام</EmptyTitle>
            <EmptyDescription>أضف أول مادة خام للبدء</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openAdd}>إضافة مادة خام</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">اسم المادة</th>
                <th className="text-right p-3 font-semibold">الوحدة</th>
                <th className="text-right p-3 font-semibold">المخزون الحالي</th>
                <th className="text-right p-3 font-semibold">الحد الأدنى</th>
                <th className="text-right p-3 font-semibold">السعر</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-right p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const low = m.minStock !== undefined && m.currentStock <= m.minStock;
                return (
                  <tr key={m.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3 text-muted-foreground">{m.unit}</td>
                    <td className="p-3">{m.currentStock.toLocaleString("ar-EG")}</td>
                    <td className="p-3 text-muted-foreground">{m.minStock ?? "-"}</td>
                    <td className="p-3 text-muted-foreground">{m.price?.toLocaleString("ar-EG") ?? "-"}</td>
                    <td className="p-3">
                      {low ? (
                        <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" /> نقص في المخزون
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">✓ طبيعي</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(m.id)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المادة" : "إضافة مادة خام"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم المادة *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>الوحدة *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="كيلو، لتر..." dir="rtl" />
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
            <div className="space-y-1">
              <Label>سعر الوحدة (ج.م)</Label>
              <Input type="number" value={form.price ?? ""} onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                {editing ? "حفظ التعديلات" : "إضافة"}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

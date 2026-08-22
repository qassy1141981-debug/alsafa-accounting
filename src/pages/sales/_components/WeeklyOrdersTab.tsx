import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Printer, ClipboardList } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

// ── أنواع طلبية الأسبوع ────────────────────────────────────────────────────

type WeeklyOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  notes: string;
};

type WeeklyOrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

type WeeklyOrder = {
  id: string;
  weekLabel: string;     // مثل "2025 - الأسبوع 28"
  weekStart: string;     // ISO date (السبت)
  customerId: string;
  customerName: string;
  items: WeeklyOrderItem[];
  status: WeeklyOrderStatus;
  notes: string;
  createdAt: string;
};

const STATUS_LABEL: Record<WeeklyOrderStatus, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكدة",
  delivered: "تم التسليم",
  cancelled: "ملغاة",
};

const STATUS_COLOR: Record<WeeklyOrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// الحصول على تاريخ السبت لهذا الأسبوع
function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=أحد, 6=سبت
  const diff = day === 6 ? 0 : day + 1; // المسافة للسبت السابق
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  // حساب رقم الأسبوع في العام
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()} — الأسبوع ${weekNum}`;
}

const emptyItem = (): WeeklyOrderItem => ({ productId: "", productName: "", quantity: 1, unit: "", notes: "" });

const DB_TABLE = "weeklyOrders" as const;

// نستخدم جدول deliveryOrders أو نخزن في rawMaterials؟
// في الواقع سنستخدم localStorage مؤقتاً لأن الجدول غير موجود في الـ schema
// بدلاً من ذلك، سنضيف جدول جديد من خلال dexie بشكل آمن

// ── الكومبوننت الرئيسي ────────────────────────────────────────────────────

export default function WeeklyOrdersTab() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterWeek, setFilterWeek] = useState(getWeekStart());

  const [form, setForm] = useState({
    weekStart: getWeekStart(),
    customerId: "",
    customerName: "",
    items: [emptyItem()] as WeeklyOrderItem[],
    status: "pending" as WeeklyOrderStatus,
    notes: "",
  });

  // نستخدم localStorage لتخزين طلبيات الأسبوع لأنها لا تحتاج backend
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate((n) => n + 1);

  const loadOrders = (): WeeklyOrder[] => {
    try {
      const raw = localStorage.getItem("weekly_orders");
      return raw ? (JSON.parse(raw) as WeeklyOrder[]) : [];
    } catch { return []; }
  };

  const saveOrders = (orders: WeeklyOrder[]) => {
    localStorage.setItem("weekly_orders", JSON.stringify(orders));
    refresh();
  };

  const allOrders = loadOrders();
  const customers = useLiveQuery(() => db.customers.orderBy("name").toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);

  const filteredOrders = allOrders
    .filter((o) => o.weekStart === filterWeek)
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "ar"));

  const updateItem = (idx: number, field: keyof WeeklyOrderItem, value: string | number) => {
    const items = [...form.items];
    const item = { ...items[idx], [field]: value };
    if (field === "productId") {
      const prod = products?.find((p) => p.id === String(value));
      item.productName = prod?.name ?? "";
      item.unit = prod?.unit ?? "";
    }
    items[idx] = item;
    setForm({ ...form, items });
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ weekStart: filterWeek, customerId: "", customerName: "", items: [emptyItem()], status: "pending", notes: "" });
    setOpen(true);
  };

  const openEdit = (order: WeeklyOrder) => {
    setEditingId(order.id);
    setForm({
      weekStart: order.weekStart,
      customerId: order.customerId,
      customerName: order.customerName,
      items: order.items.map((i) => ({ ...i })),
      status: order.status,
      notes: order.notes,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.customerName.trim()) { toast.error("اسم العميل مطلوب"); return; }
    if (form.items.some((i) => !i.productId || i.quantity <= 0)) { toast.error("يرجى تحديد المنتجات والكميات"); return; }

    const orders = loadOrders();
    if (editingId) {
      const idx = orders.findIndex((o) => o.id === editingId);
      if (idx !== -1) {
        orders[idx] = { ...orders[idx], ...form, weekLabel: getWeekLabel(form.weekStart) };
      }
      toast.success("تم تعديل الطلبية");
    } else {
      const newOrder: WeeklyOrder = {
        id: crypto.randomUUID(),
        weekLabel: getWeekLabel(form.weekStart),
        ...form,
        createdAt: new Date().toISOString(),
      };
      orders.push(newOrder);
      toast.success("تمت إضافة الطلبية");
    }
    saveOrders(orders);
    setOpen(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm("هل تريد حذف هذه الطلبية؟")) return;
    saveOrders(loadOrders().filter((o) => o.id !== id));
    toast.success("تم حذف الطلبية");
  };

  const updateStatus = (id: string, status: WeeklyOrderStatus) => {
    const orders = loadOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx !== -1) { orders[idx].status = status; saveOrders(orders); }
  };

  const printWeekOrders = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const weekLabel = getWeekLabel(filterWeek);
    win.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8"><title>طلبيات الأسبوع</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body{font-family:'Cairo',sans-serif;padding:20px;font-size:13px}
          table{width:100%;border-collapse:collapse;margin-top:12px}
          th,td{border:1px solid #ddd;padding:8px;text-align:right}
          th{background:#1e2a4a;color:white}
          .header{text-align:center;border-bottom:2px solid #1e2a4a;padding-bottom:10px;margin-bottom:16px}
          .order-block{margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
          .order-title{font-size:14px;font-weight:bold;color:#1e2a4a;margin-bottom:6px}
        </style>
      </head><body>
        <div class="header">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height:60px"><br>` : ""}
          <h2>${settings?.companyName ?? "الشركة"}</h2>
          <h3>طلبيات الأسبوع — ${weekLabel}</h3>
        </div>
        ${filteredOrders.map((o) => `
          <div class="order-block">
            <div class="order-title">العميل: ${o.customerName} | الحالة: ${STATUS_LABEL[o.status]}</div>
            <table>
              <tr><th>المنتج</th><th>الكمية</th><th>الوحدة</th><th>ملاحظات</th></tr>
              ${o.items.map((i) => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>${i.unit}</td><td>${i.notes}</td></tr>`).join("")}
            </table>
            ${o.notes ? `<p style="margin-top:6px;color:#666">ملاحظات: ${o.notes}</p>` : ""}
          </div>
        `).join("")}
        <div style="margin-top:30px;text-align:center;color:#666;font-size:11px">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  // الأسبوع السابق والتالي
  const prevWeek = () => {
    const d = new Date(filterWeek);
    d.setDate(d.getDate() - 7);
    setFilterWeek(d.toISOString().slice(0, 10));
  };
  const nextWeek = () => {
    const d = new Date(filterWeek);
    d.setDate(d.getDate() + 7);
    setFilterWeek(d.toISOString().slice(0, 10));
  };

  // ملخص الطلبيات للأسبوع حسب منتج
  const productSummary = new Map<string, { name: string; unit: string; total: number }>();
  for (const order of filteredOrders.filter((o) => o.status !== "cancelled")) {
    for (const item of order.items) {
      const prev = productSummary.get(item.productId) ?? { name: item.productName, unit: item.unit, total: 0 };
      productSummary.set(item.productId, { ...prev, total: prev.total + item.quantity });
    }
  }
  const summaryRows = Array.from(productSummary.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* شريط التنقل بين الأسابيع */}
      <div className="flex items-center gap-3 flex-wrap bg-muted/40 rounded-xl p-3 border">
        <Button size="sm" variant="secondary" onClick={prevWeek}>{"◀"} الأسبوع السابق</Button>
        <div className="flex-1 text-center font-bold text-sm text-foreground">
          {getWeekLabel(filterWeek)}
          <span className="text-xs text-muted-foreground block">
            من {new Date(filterWeek).toLocaleDateString("ar-EG")} إلى {new Date(new Date(filterWeek).setDate(new Date(filterWeek).getDate() + 6)).toLocaleDateString("ar-EG")}
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={nextWeek}>الأسبوع التالي {"▶"}</Button>
        <Button size="sm" className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white" onClick={openNew}>
          <Plus className="w-4 h-4 ml-1" /> طلبية جديدة
        </Button>
        <Button size="sm" variant="secondary" onClick={printWeekOrders}>
          <Printer className="w-4 h-4 ml-1" /> طباعة
        </Button>
      </div>

      {/* ملخص إجمالي الأصناف */}
      {summaryRows.length > 0 && (
        <div className="rounded-xl border bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-3">إجمالي الطلبيات للأسبوع (مستثنى الملغاة)</p>
          <div className="flex flex-wrap gap-2">
            {summaryRows.map((s) => (
              <span key={s.name} className="bg-white dark:bg-card border rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm">
                {s.name}: <strong className="text-blue-700 dark:text-blue-300">{s.total.toLocaleString("ar-EG")} {s.unit}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* قائمة الطلبيات */}
      {filteredOrders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>لا توجد طلبيات لهذا الأسبوع</EmptyTitle>
            <EmptyDescription>أضف طلبيات العملاء لهذا الأسبوع</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openNew}>إضافة طلبية</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div key={order.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{order.customerName}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {/* تغيير الحالة السريع */}
                  <Select value={order.status} onValueChange={(v) => updateStatus(order.id, v as WeeklyOrderStatus)}>
                    <SelectTrigger dir="rtl" className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="pending">قيد الانتظار</SelectItem>
                      <SelectItem value="confirmed">مؤكدة</SelectItem>
                      <SelectItem value="delivered">تم التسليم</SelectItem>
                      <SelectItem value="cancelled">ملغاة</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(order)} title="تعديل">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(order.id)} title="حذف">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-right pb-1 font-medium">المنتج</th>
                      <th className="text-center pb-1 font-medium">الكمية</th>
                      <th className="text-right pb-1 font-medium">الوحدة</th>
                      <th className="text-right pb-1 font-medium">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 font-medium">{item.productName}</td>
                        <td className="py-1.5 text-center font-bold text-blue-700 dark:text-blue-300">{item.quantity.toLocaleString("ar-EG")}</td>
                        <td className="py-1.5 text-muted-foreground text-xs">{item.unit}</td>
                        <td className="py-1.5 text-muted-foreground text-xs">{item.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {order.notes && (
                  <p className="text-xs text-muted-foreground mt-2 bg-muted/40 rounded p-2">ملاحظة: {order.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog إضافة / تعديل */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل الطلبية" : "طلبية أسبوعية جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* الأسبوع */}
            <div className="space-y-1">
              <Label>تاريخ بداية الأسبوع (السبت)</Label>
              <Input type="date" value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} dir="rtl" />
              <p className="text-xs text-muted-foreground">{getWeekLabel(form.weekStart)}</p>
            </div>

            {/* العميل */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اختر العميل</Label>
                <Select value={form.customerId} onValueChange={(val) => {
                  const c = customers?.find((c) => c.id === val);
                  setForm({ ...form, customerId: val, customerName: c?.name ?? "" });
                }}>
                  <SelectTrigger dir="rtl"><SelectValue placeholder="اختر من القائمة" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>اسم العميل (يدوي)*</Label>
                <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value, customerId: "" })} placeholder="أو اكتب اسم العميل" dir="rtl" />
              </div>
            </div>

            {/* الحالة */}
            <div className="space-y-1">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as WeeklyOrderStatus })}>
                <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="confirmed">مؤكدة</SelectItem>
                  <SelectItem value="delivered">تم التسليم</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* الأصناف */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">الأصناف المطلوبة</Label>
                <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}>
                  <Plus className="w-3 h-3 ml-1" /> إضافة صنف
                </Button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-2 p-2 rounded-lg border bg-white dark:bg-card">
                  <Select value={item.productId} onValueChange={(val) => updateItem(idx, "productId", val)}>
                    <SelectTrigger dir="rtl" className="h-10 text-sm font-medium border-2 w-full">
                      <SelectValue placeholder="اختر المنتج" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>)}
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
                      <span className="text-[10px] text-muted-foreground block text-center">الكمية</span>
                    </div>
                    <div className="flex-1">
                      <Input
                        placeholder="ملاحظة الصنف"
                        value={item.notes}
                        onChange={(e) => updateItem(idx, "notes", e.target.value)}
                        dir="rtl"
                        className="h-10 text-sm border-2"
                      />
                      <span className="text-[10px] text-muted-foreground block text-center">ملاحظة</span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => {
                      if (form.items.length === 1) return;
                      setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* ملاحظات */}
            <div className="space-y-1">
              <Label>ملاحظات الطلبية</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="rtl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                {editingId ? "حفظ التعديلات" : "حفظ الطلبية"}
              </Button>
              <Button variant="secondary" onClick={() => { setOpen(false); setEditingId(null); }} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

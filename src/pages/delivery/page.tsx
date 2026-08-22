import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import type { DeliveryOrder, DeliveryItem, DeliveryStatus } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import {
  Truck,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Package,
  User,
  MapPin,
  CalendarDays,
  PrinterIcon,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useLocalAuth } from "@/hooks/use-local-auth.ts";
import { canWrite } from "@/lib/auth.ts";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

// ── أيام الأسبوع (السبت → الجمعة) ────────────────────────────────────────────
const WEEK_DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const DAY_COLORS = [
  "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800",
  "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",
  "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800",
  "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",
  "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
];

const STATUS_MAP: Record<DeliveryStatus, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  pending:   { label: "قيد الانتظار", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  delivered: { label: "تم التسليم",   color: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle2 },
  partial:   { label: "تسليم جزئي",   color: "bg-blue-100 text-blue-700 border-blue-200",       icon: AlertCircle },
  cancelled: { label: "ملغي",          color: "bg-red-100 text-red-700 border-red-200",           icon: XCircle },
};

// ── حساب بداية الأسبوع (السبت) ───────────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 6=Sat
  const diff = day === 6 ? 0 : day + 1; // days back to Sat
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateAr(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  return `${formatDateAr(toISODate(weekStart))} – ${formatDateAr(toISODate(end))}`;
}

// ── المكوّن الرئيسي ───────────────────────────────────────────────────────────
export default function DeliveryPage() {
  const { session } = useLocalAuth();
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const canEdit = session ? canWrite(session.role) : false;

  // الأسبوع الحالي
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const weekStartStr = toISODate(currentWeekStart);

  // جلب الطلبيات لهذا الأسبوع
  const orders = useLiveQuery(
    () => db.deliveryOrders.where("weekStart").equals(weekStartStr).toArray(),
    [weekStartStr],
    []
  );

  const customers = useLiveQuery(() => db.customers.orderBy("name").toArray(), [], []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const emptyForm = () => ({
    date: toISODate(currentWeekStart),
    customerId: "",
    customerName: "",
    driverName: "",
    vehiclePlate: "",
    deliveryAddress: "",
    scheduledTime: "",
    status: "pending" as DeliveryStatus,
    notes: "",
    items: [{ productId: "", productName: "", quantity: 1, unit: "كجم" }] as DeliveryItem[],
  });

  const [form, setForm] = useState(emptyForm);

  // ── تنظيم الطلبيات حسب اليوم ────────────────────────────────────────────────
  const ordersByDay = useMemo(() => {
    const map: Record<string, DeliveryOrder[]> = {};
    for (let i = 0; i < 7; i++) {
      const d = toISODate(addDays(currentWeekStart, i));
      map[d] = [];
    }
    for (const o of orders ?? []) {
      if (map[o.date]) map[o.date].push(o);
      else map[o.date] = [o];
    }
    return map;
  }, [orders, currentWeekStart]);

  // ── إحصاءات سريعة ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = orders ?? [];
    return {
      total: all.length,
      pending: all.filter((o) => o.status === "pending").length,
      delivered: all.filter((o) => o.status === "delivered").length,
      cancelled: all.filter((o) => o.status === "cancelled").length,
      totalQty: all.reduce((s, o) => s + o.totalQuantity, 0),
    };
  }, [orders]);

  // ── فتح dialog جديد أو تعديل ────────────────────────────────────────────────
  function openNew(defaultDate?: string) {
    setEditingOrder(null);
    setForm({ ...emptyForm(), date: defaultDate ?? toISODate(currentWeekStart) });
    setDialogOpen(true);
  }

  function openEdit(order: DeliveryOrder) {
    setEditingOrder(order);
    setForm({
      date: order.date,
      customerId: order.customerId ?? "",
      customerName: order.customerName,
      driverName: order.driverName ?? "",
      vehiclePlate: order.vehiclePlate ?? "",
      deliveryAddress: order.deliveryAddress ?? "",
      scheduledTime: order.scheduledTime ?? "",
      status: order.status,
      notes: order.notes ?? "",
      items: order.items.map((it) => ({ ...it })),
    });
    setDialogOpen(true);
  }

  // ── حفظ ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.customerName.trim()) {
      toast.error("الرجاء إدخال اسم العميل");
      return;
    }
    if (form.items.length === 0 || form.items.some((it) => !it.productName.trim() || it.quantity <= 0)) {
      toast.error("الرجاء إدخال بيانات الأصناف بشكل صحيح");
      return;
    }

    const totalQty = form.items.reduce((s, it) => s + it.quantity, 0);
    const payload: DeliveryOrder = {
      id: editingOrder?.id ?? `do_${Date.now()}`,
      weekStart: weekStartStr,
      date: form.date,
      customerId: form.customerId || undefined,
      customerName: form.customerName.trim(),
      driverName: form.driverName.trim() || undefined,
      vehiclePlate: form.vehiclePlate.trim() || undefined,
      deliveryAddress: form.deliveryAddress.trim() || undefined,
      scheduledTime: form.scheduledTime || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      items: form.items,
      totalQuantity: totalQty,
    };

    if (editingOrder) {
      await db.deliveryOrders.put(payload);
      toast.success("تم تحديث الطلبية");
    } else {
      await db.deliveryOrders.add(payload);
      toast.success("تم إضافة الطلبية");
    }
    setDialogOpen(false);
  }

  // ── حذف ─────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    await db.deliveryOrders.delete(id);
    toast.success("تم حذف الطلبية");
    setDeleteId(null);
  }

  // ── تغيير حالة سريع ─────────────────────────────────────────────────────────
  async function toggleStatus(order: DeliveryOrder) {
    const next: DeliveryStatus = order.status === "pending" ? "delivered" : "pending";
    await db.deliveryOrders.update(order.id, { status: next });
  }

  // ── إدارة بنود الطلبية ───────────────────────────────────────────────────────
  function updateItem(idx: number, field: keyof DeliveryItem, value: string | number) {
    setForm((prev) => {
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        if (field === "productId") {
          const p = products?.find((pr) => pr.id === value);
          return { ...it, productId: value as string, productName: p?.name ?? it.productName, unit: p?.unit ?? it.unit };
        }
        return { ...it, [field]: value };
      });
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { productId: "", productName: "", quantity: 1, unit: "كجم" }],
    }));
  }

  function removeItem(idx: number) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  // ── طباعة جدول اليوم ────────────────────────────────────────────────────────
  function printDay(dateStr: string) {
    const dayOrders = ordersByDay[dateStr] ?? [];
    const dayIdx = Math.round((new Date(dateStr).getTime() - currentWeekStart.getTime()) / 86400000);
    const dayName = WEEK_DAYS[dayIdx] ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = dayOrders.map((o) =>
      `<tr>
        <td>${o.customerName}</td>
        <td>${o.items.map((it) => `${it.productName} (${it.quantity} ${it.unit})`).join("، ")}</td>
        <td>${o.driverName ?? "-"}</td>
        <td>${o.vehiclePlate ?? "-"}</td>
        <td>${o.scheduledTime ?? "-"}</td>
        <td>${o.deliveryAddress ?? "-"}</td>
        <td>${STATUS_MAP[o.status].label}</td>
      </tr>`
    ).join("");
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <title>جدول توزيع ${dayName} ${formatDateAr(dateStr)}</title>
      <style>
        body { font-family: Cairo, Arial, sans-serif; direction: rtl; padding: 20px; }
        h2 { color: #1e2a4a; }
        table { width:100%; border-collapse:collapse; margin-top:16px; }
        th { background:#1e2a4a; color:#fff; padding:8px; font-size:13px; }
        td { border:1px solid #ccc; padding:8px; font-size:12px; }
        tr:nth-child(even) { background:#f5f7ff; }
      </style></head><body>
      <h2>${settings?.companyName ?? "الشركة"} — جدول التوزيع: ${dayName} ${formatDateAr(dateStr)}</h2>
      <table>
        <thead><tr>
          <th>العميل</th><th>الأصناف والكميات</th><th>السائق</th>
          <th>رقم السيارة</th><th>وقت التسليم</th><th>العنوان</th><th>الحالة</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>`);
    win.print();
  }

  // ── طباعة الجدول الأسبوعي الكامل ────────────────────────────────────────────
  function printWeek() {
    const win = window.open("", "_blank");
    if (!win) return;
    let allRows = "";
    for (let i = 0; i < 7; i++) {
      const dateStr = toISODate(addDays(currentWeekStart, i));
      const dayOrders = ordersByDay[dateStr] ?? [];
      for (const o of dayOrders) {
        allRows += `<tr>
          <td>${WEEK_DAYS[i]}<br/><small>${formatDateAr(dateStr)}</small></td>
          <td>${o.customerName}</td>
          <td>${o.items.map((it) => `${it.productName} (${it.quantity} ${it.unit})`).join("، ")}</td>
          <td>${o.driverName ?? "-"}</td>
          <td>${o.vehiclePlate ?? "-"}</td>
          <td>${o.scheduledTime ?? "-"}</td>
          <td>${STATUS_MAP[o.status].label}</td>
        </tr>`;
      }
    }
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <title>جدول التوزيع الأسبوعي</title>
      <style>
        body { font-family: Cairo, Arial, sans-serif; direction: rtl; padding: 20px; }
        h2 { color: #1e2a4a; }
        table { width:100%; border-collapse:collapse; margin-top:16px; }
        th { background:#1e2a4a; color:#fff; padding:8px; font-size:13px; }
        td { border:1px solid #ccc; padding:8px; font-size:12px; vertical-align:top; }
        tr:nth-child(even) { background:#f5f7ff; }
      </style></head><body>
      <h2>${settings?.companyName ?? "الشركة"} — الجدول الأسبوعي: ${weekLabel(currentWeekStart)}</h2>
      <table>
        <thead><tr>
          <th>اليوم</th><th>العميل</th><th>الأصناف والكميات</th>
          <th>السائق</th><th>رقم السيارة</th><th>وقت التسليم</th><th>الحالة</th>
        </tr></thead>
        <tbody>${allRows || "<tr><td colspan='7' style='text-align:center'>لا توجد طلبيات</td></tr>"}</tbody>
      </table>
      </body></html>`);
    win.print();
  }

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6" style={{ color: "#1e2a4a" }} />
          <h1 className="text-xl font-bold" style={{ color: "#1e2a4a" }}>
            خطة التوزيع الأسبوعية
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button size="sm" onClick={() => openNew()} style={{ background: "#1e2a4a" }}>
              <Plus className="w-4 h-4 ml-1" />
              طلبية جديدة
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={printWeek}>
            <PrinterIcon className="w-4 h-4 ml-1" />
            طباعة الأسبوع
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart((w) => addDays(w, -7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm" style={{ color: "#1e2a4a" }}>
            <CalendarDays className="w-4 h-4 inline-block ml-1 mb-0.5" />
            {weekLabel(currentWeekStart)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            السبت → الجمعة
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart((w) => addDays(w, 7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الطلبيات", value: stats.total, color: "#1e2a4a" },
          { label: "قيد الانتظار",    value: stats.pending,   color: "#d97706" },
          { label: "تم التسليم",      value: stats.delivered, color: "#16a34a" },
          { label: "ملغية",           value: stats.cancelled, color: "#dc2626" },
        ].map((s) => (
          <Card key={s.label} className="text-center py-3">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Weekly Grid */}
      <div className="space-y-3">
        {WEEK_DAYS.map((dayName, i) => {
          const dateStr = toISODate(addDays(currentWeekStart, i));
          const dayOrders = ordersByDay[dateStr] ?? [];
          const isToday = dateStr === toISODate(new Date());

          return (
            <div
              key={dateStr}
              className={cn(
                "rounded-xl border-2 overflow-hidden",
                isToday ? "border-[#1e2a4a] shadow-md" : "border-transparent",
              )}
            >
              {/* Day header */}
              <div
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 border-b",
                  DAY_COLORS[i]
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{dayName}</span>
                  <span className="text-xs text-muted-foreground">{formatDateAr(dateStr)}</span>
                  {isToday && (
                    <Badge className="text-[10px] px-1.5 py-0" style={{ background: "#1e2a4a", color: "#fff" }}>
                      اليوم
                    </Badge>
                  )}
                  {dayOrders.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {dayOrders.length} طلبية
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {dayOrders.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => printDay(dateStr)}
                    >
                      <PrinterIcon className="w-3 h-3 ml-1" />
                      طباعة
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => openNew(dateStr)}
                    >
                      <Plus className="w-3.5 h-3.5 ml-0.5" />
                      إضافة
                    </Button>
                  )}
                </div>
              </div>

              {/* Orders list */}
              {dayOrders.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground bg-white dark:bg-slate-950/20">
                  لا توجد طلبيات
                </div>
              ) : (
                <div className="divide-y bg-white dark:bg-slate-950/20">
                  {dayOrders.map((order) => {
                    const st = STATUS_MAP[order.status];
                    const Icon = st.icon;
                    return (
                      <div
                        key={order.id}
                        className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Status badge */}
                        <div className="flex-shrink-0 pt-0.5">
                          <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 border", st.color)}>
                            <Icon className="w-3 h-3 ml-1" />
                            {st.label}
                          </Badge>
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm">{order.customerName}</span>
                            {order.scheduledTime && (
                              <span className="text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 inline-block ml-0.5" />
                                {order.scheduledTime}
                              </span>
                            )}
                          </div>
                          {/* Items */}
                          <div className="flex flex-wrap gap-1.5">
                            {order.items.map((it, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5 border"
                              >
                                <Package className="w-2.5 h-2.5 inline-block ml-0.5" />
                                {it.productName} — {it.quantity} {it.unit}
                              </span>
                            ))}
                          </div>
                          {/* Driver & vehicle */}
                          {(order.driverName || order.vehiclePlate) && (
                            <p className="text-xs text-muted-foreground">
                              <Truck className="w-3 h-3 inline-block ml-1" />
                              {order.driverName && <span>{order.driverName}</span>}
                              {order.driverName && order.vehiclePlate && <span className="mx-1">·</span>}
                              {order.vehiclePlate && <span>{order.vehiclePlate}</span>}
                            </p>
                          )}
                          {order.deliveryAddress && (
                            <p className="text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 inline-block ml-1" />
                              {order.deliveryAddress}
                            </p>
                          )}
                          {order.notes && (
                            <p className="text-xs text-slate-500 italic">{order.notes}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                title={order.status === "pending" ? "تأكيد التسليم" : "إلغاء التأكيد"}
                                onClick={() => toggleStatus(order)}
                              >
                                {order.status === "pending" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-yellow-600" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => openEdit(order)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-red-500 hover:text-red-600"
                                onClick={() => setDeleteId(order.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold" style={{ color: "#1e2a4a" }}>
              {editingOrder ? "تعديل الطلبية" : "إضافة طلبية توزيع"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Row 1: Date + Customer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ التسليم *</Label>
                <Input
                  type="date"
                  value={form.date}
                  min={weekStartStr}
                  max={toISODate(addDays(currentWeekStart, 6))}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>العميل *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => {
                    const c = customers?.find((c) => c.id === v);
                    setForm((f) => ({
                      ...f,
                      customerId: v,
                      customerName: c?.name ?? f.customerName,
                      deliveryAddress: c?.address ?? f.deliveryAddress,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر عميلاً أو اكتب اسمه" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.customerId && (
                  <Input
                    className="mt-1"
                    placeholder="اسم العميل (يدوي)"
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  />
                )}
              </div>
            </div>

            {/* Row 2: Driver + Vehicle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  <User className="w-3.5 h-3.5 inline-block ml-1" />
                  اسم السائق
                </Label>
                <Input
                  placeholder="مثال: محمد أحمد"
                  value={form.driverName}
                  onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>
                  <Truck className="w-3.5 h-3.5 inline-block ml-1" />
                  رقم السيارة / اللوحة
                </Label>
                <Input
                  placeholder="مثال: أ ب ج 1234"
                  value={form.vehiclePlate}
                  onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 3: Time + Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  <Clock className="w-3.5 h-3.5 inline-block ml-1" />
                  وقت التسليم المقرر
                </Label>
                <Input
                  type="time"
                  value={form.scheduledTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>
                  <MapPin className="w-3.5 h-3.5 inline-block ml-1" />
                  عنوان التسليم
                </Label>
                <Input
                  placeholder="المنطقة / المحافظة"
                  value={form.deliveryAddress}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <Label>الحالة</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as DeliveryStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_MAP) as DeliveryStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_MAP[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الأصناف والكميات *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-7 text-xs">
                  <Plus className="w-3 h-3 ml-1" />
                  صنف جديد
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start border rounded-lg p-2 bg-slate-50 dark:bg-slate-900">
                    <div className="flex-1 space-y-1">
                      {/* Product select */}
                      <Select
                        value={item.productId}
                        onValueChange={(v) => updateItem(idx, "productId", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="اختر منتجاً" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!item.productId && (
                        <Input
                          className="h-7 text-xs"
                          placeholder="اسم الصنف يدوياً"
                          value={item.productName}
                          onChange={(e) => updateItem(idx, "productName", e.target.value)}
                        />
                      )}
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        className="h-8 text-xs text-center"
                        placeholder="الكمية"
                        value={item.quantity}
                        min={0}
                        onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-16">
                      <Input
                        className="h-8 text-xs text-center"
                        placeholder="الوحدة"
                        value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      />
                    </div>
                    {form.items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-1.5 text-red-500"
                        onClick={() => removeItem(idx)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Textarea
                rows={2}
                placeholder="أي ملاحظات إضافية..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-start">
            <Button onClick={handleSave} style={{ background: "#1e2a4a" }}>
              {editingOrder ? "حفظ التعديلات" : "إضافة الطلبية"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-red-600">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه الطلبية؟ لا يمكن التراجع.</p>
          <DialogFooter className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>حذف</Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

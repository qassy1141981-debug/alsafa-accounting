import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import {
  openWhatsApp,
  openWhatsAppBusiness,
  buildInvoiceMessage,
  buildDebtReminderMessage,
  buildPeriodicReportMessage,
  buildInventoryAlertMessage,
} from "@/lib/whatsapp.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Users,
  Package,
  BarChart3,
  Bell,
  Receipt,
  Phone,
  Search,
  AlertTriangle,
  CheckCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ── مكوّن معاينة الرسالة ─────────────────────────────────────────────────────
function MessagePreview({
  message,
  onEdit,
}: {
  message: string;
  onEdit: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">معاينة الرسالة</Label>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs gap-1 cursor-pointer"
          onClick={() => {
            if (editing) {
              onEdit(draft);
            }
            setEditing((v) => !v);
          }}
        >
          {editing ? <CheckCircle className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {editing ? "حفظ" : "تعديل"}
        </Button>
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="text-sm font-mono text-right"
          dir="rtl"
        />
      ) : (
        <div
          className="bg-[#dcf8c6] rounded-xl p-3 text-sm text-right leading-relaxed whitespace-pre-wrap border border-[#c3e3ad] max-h-60 overflow-y-auto"
          dir="rtl"
          style={{ fontFamily: "Cairo, sans-serif" }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

// ── 1. تبويب فواتير المبيعات ──────────────────────────────────────────────────
function InvoicesTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const companyName = settings?.companyName ?? "النظام المحاسبي";

  const sales = useLiveQuery(
    () => db.sales.orderBy("date").reverse().toArray(),
    [],
  );
  const customers = useLiveQuery(() => db.customers.toArray(), []);

  const filtered = useMemo(
    () =>
      (sales ?? []).filter(
        (s) =>
          s.invoiceNumber.includes(search) ||
          s.customerName.toLowerCase().includes(search.toLowerCase()),
      ),
    [sales, search],
  );

  const selectedSale = (sales ?? []).find((s) => s.id === selected);

  const generatedMsg = useMemo(() => {
    if (!selectedSale) return "";
    return buildInvoiceMessage({
      companyName,
      customerName: selectedSale.customerName,
      invoiceNumber: selectedSale.invoiceNumber,
      date: selectedSale.date,
      items: selectedSale.items,
      totalAmount: selectedSale.totalAmount,
      discount: selectedSale.discount,
      netAmount: selectedSale.netAmount,
      paidAmount: selectedSale.paidAmount,
      remainingAmount: selectedSale.remainingAmount,
      currency,
    });
  }, [selectedSale, companyName, currency]);

  const [previewMsg, setPreviewMsg] = useState("");
  const effectiveMsg = previewMsg || generatedMsg;

  // إعادة توليد الرسالة عند تغيير الفاتورة
  const handleSelect = (id: string) => {
    setSelected(id);
    setPreviewMsg("");
  };

  const getCustomerPhone = (sale: (typeof filtered)[0]) => {
    if (!sale.customerId) return "";
    return (customers ?? []).find((c) => c.id === sale.customerId)?.phone ?? "";
  };

  const sendMessage = (phone: string) => {
    if (!phone) {
      toast.error("هذا العميل لا يملك رقم هاتف");
      return;
    }
    openWhatsApp(phone, effectiveMsg || customMessage);
  };

  const sendBusinessMessage = (phone: string) => {
    if (!phone) {
      toast.error("هذا العميل لا يملك رقم هاتف");
      return;
    }
    openWhatsAppBusiness(phone, effectiveMsg || customMessage);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* قائمة الفواتير */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              لا توجد فواتير
            </p>
          )}
          {filtered.map((sale) => {
            const phone = getCustomerPhone(sale);
            return (
              <div
                key={sale.id}
                onClick={() => handleSelect(sale.id)}
                className={cn(
                  "border rounded-lg p-3 cursor-pointer transition-all hover:border-green-400",
                  selected === sale.id
                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{sale.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.invoiceNumber} · {sale.date}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-primary">
                      {sale.netAmount.toLocaleString("ar-EG")} {currency}
                    </p>
                    {phone ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {phone}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا يوجد هاتف</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* لوحة الإرسال */}
      <div className="space-y-4">
        {selectedSale ? (
          <>
            <MessagePreview
              message={effectiveMsg}
              onEdit={(msg) => setPreviewMsg(msg)}
            />
            <div className="space-y-2">
              <Label className="text-sm font-semibold">إرسال إلى</Label>
              {(() => {
                const phone = getCustomerPhone(selectedSale);
                return (
                    <div className="flex gap-2">
                    <Input
                      value={phone}
                      readOnly
                      placeholder="لا يوجد رقم هاتف"
                      className="flex-1 text-sm"
                      dir="ltr"
                    />
                    <Button
                      onClick={() => sendMessage(phone)}
                      disabled={!phone}
                      className="gap-1.5 bg-green-600 hover:bg-green-700 text-white cursor-pointer text-xs px-3"
                      title="واتساب عادي"
                    >
                      <Send className="w-3.5 h-3.5" />
                      عادي
                    </Button>
                    <Button
                      onClick={() => sendBusinessMessage(phone)}
                      disabled={!phone}
                      className="gap-1.5 bg-green-800 hover:bg-green-900 text-white cursor-pointer text-xs px-3"
                      title="واتساب بيزنس"
                    >
                      <Send className="w-3.5 h-3.5" />
                      بيزنس
                    </Button>
                    </div>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <Receipt className="w-12 h-12 opacity-30" />
            <p className="text-sm">اختر فاتورة لمعاينة رسالتها وإرسالها</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2. تبويب تذكيرات الديون ───────────────────────────────────────────────────
function DebtRemindersTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [previewMsg, setPreviewMsg] = useState("");
  const [customNote, setCustomNote] = useState("");
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const companyName = settings?.companyName ?? "النظام المحاسبي";

  const customers = useLiveQuery(() => db.customers.toArray(), []);

  const debtors = useMemo(
    () =>
      (customers ?? [])
        .filter((c) => c.balance > 0)
        .filter(
          (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.phone ?? "").includes(search),
        )
        .sort((a, b) => b.balance - a.balance),
    [customers, search],
  );

  const selectedCustomer = (customers ?? []).find((c) => c.id === selected);

  const generatedMsg = useMemo(() => {
    if (!selectedCustomer) return "";
    return buildDebtReminderMessage({
      companyName,
      customerName: selectedCustomer.name,
      balance: selectedCustomer.balance,
      currency,
      notes: customNote || undefined,
    });
  }, [selectedCustomer, companyName, currency, customNote]);

  const effectiveMsg = previewMsg || generatedMsg;

  const handleSelect = (id: string) => {
    setSelected(id);
    setPreviewMsg("");
  };

  const send = () => {
    if (!selectedCustomer) return;
    if (!selectedCustomer.phone) {
      toast.error("هذا العميل لا يملك رقم هاتف");
      return;
    }
    openWhatsApp(selectedCustomer.phone, effectiveMsg);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* قائمة المدينين */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم العميل أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        {debtors.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
            <p className="text-sm">لا يوجد عملاء لديهم ديون</p>
          </div>
        )}
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {debtors.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={cn(
                "border rounded-lg p-3 cursor-pointer transition-all hover:border-orange-400",
                selected === c.id
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {c.phone ? (
                      <>
                        <Phone className="w-3 h-3" /> {c.phone}
                      </>
                    ) : (
                      "لا يوجد هاتف"
                    )}
                  </p>
                </div>
                <Badge variant="destructive" className="text-xs">
                  {c.balance.toLocaleString("ar-EG")} {currency}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* لوحة الإرسال */}
      <div className="space-y-4">
        {selectedCustomer ? (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">ملاحظة إضافية (اختياري)</Label>
              <Input
                placeholder="مثال: آخر موعد للسداد 30/7/2025"
                value={customNote}
                onChange={(e) => {
                  setCustomNote(e.target.value);
                  setPreviewMsg("");
                }}
              />
            </div>
            <MessagePreview message={effectiveMsg} onEdit={setPreviewMsg} />
            <Button
              onClick={send}
              disabled={!selectedCustomer.phone}
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
            >
              <Send className="w-4 h-4" />
              إرسال تذكير لـ {selectedCustomer.name}
            </Button>
            {!selectedCustomer.phone && (
              <p className="text-xs text-center text-destructive">
                هذا العميل لا يملك رقم هاتف — أضفه من صفحة العملاء
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <Users className="w-12 h-12 opacity-30" />
            <p className="text-sm">اختر عميلاً لإرسال تذكير بالدين</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3. تبويب التقرير الدوري ───────────────────────────────────────────────────
function PeriodicReportTab() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const companyName = settings?.companyName ?? "النظام المحاسبي";

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastDay = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(lastDay);
  const [phone, setPhone] = useState("");
  const [previewMsg, setPreviewMsg] = useState("");

  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const purchases = useLiveQuery(() => db.purchases.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const collections = useLiveQuery(() => db.collections.toArray(), []);

  const stats = useMemo(() => {
    const inRange = (date: string) => date >= from && date <= to;
    const totalSales = (sales ?? [])
      .filter((s) => inRange(s.date))
      .reduce((sum, s) => sum + s.netAmount, 0);
    const totalPurchases = (purchases ?? [])
      .filter((p) => inRange(p.date))
      .reduce((sum, p) => sum + p.totalAmount, 0);
    const totalExpenses = (expenses ?? [])
      .filter((e) => inRange(e.date))
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCollections = (collections ?? [])
      .filter((c) => inRange(c.date))
      .reduce((sum, c) => sum + c.amount, 0);
    const netProfit = totalSales - totalPurchases - totalExpenses;
    return { totalSales, totalPurchases, totalExpenses, netProfit, totalCollections };
  }, [sales, purchases, expenses, collections, from, to]);

  const period = `${from} إلى ${to}`;

  const generatedMsg = buildPeriodicReportMessage({
    companyName,
    period,
    ...stats,
    currency,
  });

  const effectiveMsg = previewMsg || generatedMsg;

  const send = () => {
    if (!phone.trim()) {
      toast.error("أدخل رقم الهاتف أولاً");
      return;
    }
    openWhatsApp(phone, effectiveMsg);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* إعدادات التقرير */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreviewMsg(""); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreviewMsg(""); }} />
          </div>
        </div>

        {/* ملخص الأرقام */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "المبيعات", value: stats.totalSales, color: "text-blue-600" },
            { label: "المشتريات", value: stats.totalPurchases, color: "text-orange-600" },
            { label: "المصروفات", value: stats.totalExpenses, color: "text-red-600" },
            { label: "التحصيلات", value: stats.totalCollections, color: "text-teal-600" },
          ].map((item) => (
            <div key={item.label} className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={cn("text-sm font-bold", item.color)}>
                {item.value.toLocaleString("ar-EG")} {currency}
              </p>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "rounded-lg p-3 text-center font-bold",
            stats.netProfit >= 0
              ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
          )}
        >
          صافي الربح: {stats.netProfit.toLocaleString("ar-EG")} {currency}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">رقم الهاتف للإرسال</Label>
          <Input
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
          />
        </div>
        <Button
          onClick={send}
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
        >
          <Send className="w-4 h-4" />
          إرسال التقرير
        </Button>
      </div>

      {/* معاينة الرسالة */}
      <MessagePreview message={effectiveMsg} onEdit={setPreviewMsg} />
    </div>
  );
}

// ── 4. تبويب تنبيهات المخزون ──────────────────────────────────────────────────
function InventoryAlertsTab() {
  const settings = useCompanySettings();
  const companyName = settings?.companyName ?? "النظام المحاسبي";
  const [phone, setPhone] = useState("");
  const [previewMsg, setPreviewMsg] = useState("");

  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const lowStockItems = useMemo(() => {
    const raws = (rawMaterials ?? [])
      .filter((m) => m.minStock !== undefined && m.currentStock <= (m.minStock ?? 0))
      .map((m) => ({
        name: m.name,
        currentStock: m.currentStock,
        minStock: m.minStock ?? 0,
        unit: m.unit,
      }));
    const prods = (products ?? [])
      .filter((p) => p.minStock !== undefined && p.currentStock <= (p.minStock ?? 0))
      .map((p) => ({
        name: p.name,
        currentStock: p.currentStock,
        minStock: p.minStock ?? 0,
        unit: p.unit,
      }));
    return [...raws, ...prods];
  }, [rawMaterials, products]);

  const generatedMsg = useMemo(
    () => buildInventoryAlertMessage({ companyName, items: lowStockItems }),
    [companyName, lowStockItems],
  );
  const effectiveMsg = previewMsg || generatedMsg;

  const send = () => {
    if (!phone.trim()) {
      toast.error("أدخل رقم الهاتف أولاً");
      return;
    }
    if (lowStockItems.length === 0) {
      toast.error("لا يوجد نقص في المخزون حالياً");
      return;
    }
    openWhatsApp(phone, effectiveMsg);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        {lowStockItems.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
            <p className="font-medium">المخزون بخير</p>
            <p className="text-sm mt-1">لا يوجد أي صنف تحت الحد الأدنى</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              {lowStockItems.length} صنف يحتاج تجديد
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {lowStockItems.map((item, i) => (
                <div
                  key={i}
                  className="border border-orange-200 bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{item.name}</p>
                    <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                      {item.currentStock} / {item.minStock} {item.unit}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    المتاح {item.currentStock} {item.unit} · الحد الأدنى {item.minStock} {item.unit}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs">رقم الهاتف للإرسال (مدير المخزون)</Label>
          <Input
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
          />
        </div>
        <Button
          onClick={send}
          disabled={lowStockItems.length === 0}
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
        >
          <Send className="w-4 h-4" />
          إرسال تنبيه المخزون
        </Button>
      </div>

      <MessagePreview message={effectiveMsg} onEdit={setPreviewMsg} />
    </div>
  );
}

// ── 5. تبويب إرسال مخصص ──────────────────────────────────────────────────────
function CustomMessageTab() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const send = () => {
    if (!phone.trim()) {
      toast.error("أدخل رقم الهاتف");
      return;
    }
    if (!message.trim()) {
      toast.error("أدخل نص الرسالة");
      return;
    }
    openWhatsApp(phone, message);
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label>رقم الهاتف</Label>
        <Input
          placeholder="مثال: 01012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">
          يمكن إدخال الرقم بأي صيغة — سيتم تحويله تلقائياً
        </p>
      </div>
      <div className="space-y-1">
        <Label>الرسالة</Label>
        <Textarea
          placeholder="اكتب رسالتك هنا..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          dir="rtl"
          className="text-right"
        />
        <p className="text-xs text-muted-foreground">{message.length} حرف</p>
      </div>
      {message && phone && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">معاينة</Label>
          <div
            className="bg-[#dcf8c6] rounded-xl p-3 text-sm text-right leading-relaxed whitespace-pre-wrap border border-[#c3e3ad]"
            dir="rtl"
          >
            {message}
          </div>
        </div>
      )}
      <Button
        onClick={send}
        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
      >
        <Send className="w-4 h-4" />
        فتح واتساب وإرسال
      </Button>
    </div>
  );
}

// ── الصفحة الرئيسية ───────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  return (
    <div className="space-y-6 p-1" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center shadow-md">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">مركز واتساب</h1>
          <p className="text-sm text-muted-foreground">
            إرسال الفواتير والتذكيرات والتقارير عبر واتساب مباشرة
          </p>
        </div>
        <div className="mr-auto">
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400"
          >
            يعمل بدون API
          </Badge>
        </div>
      </div>

      {/* بطاقة إرشادية */}
      <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/10 dark:border-green-900">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-green-800 dark:text-green-300">
            📱 عند الضغط على "إرسال"، سيفتح تطبيق واتساب تلقائياً مع الرسالة جاهزة للإرسال.
            تأكد من وجود واتساب مثبتاً على جهازك.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices" dir="rtl">
        <TabsList className="w-full grid grid-cols-5 h-auto p-1">
          <TabsTrigger value="invoices" className="text-xs gap-1 flex-col sm:flex-row py-2">
            <Receipt className="w-4 h-4" />
            <span>فواتير</span>
          </TabsTrigger>
          <TabsTrigger value="debts" className="text-xs gap-1 flex-col sm:flex-row py-2">
            <Users className="w-4 h-4" />
            <span>تذكير ديون</span>
          </TabsTrigger>
          <TabsTrigger value="report" className="text-xs gap-1 flex-col sm:flex-row py-2">
            <BarChart3 className="w-4 h-4" />
            <span>تقرير دوري</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs gap-1 flex-col sm:flex-row py-2">
            <Package className="w-4 h-4" />
            <span>نقص مخزون</span>
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs gap-1 flex-col sm:flex-row py-2">
            <MessageSquare className="w-4 h-4" />
            <span>مخصص</span>
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <TabsContent value="invoices" className="mt-0">
              <InvoicesTab />
            </TabsContent>
            <TabsContent value="debts" className="mt-0">
              <DebtRemindersTab />
            </TabsContent>
            <TabsContent value="report" className="mt-0">
              <PeriodicReportTab />
            </TabsContent>
            <TabsContent value="inventory" className="mt-0">
              <InventoryAlertsTab />
            </TabsContent>
            <TabsContent value="custom" className="mt-0">
              <CustomMessageTab />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

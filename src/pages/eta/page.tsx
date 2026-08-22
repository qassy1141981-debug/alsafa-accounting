import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { db } from "@/lib/db.ts";
import {
  loadETAConfig,
  saveETAConfig,
  loadAllETARecords,
  saveETARecord,
  getETARecord,
  buildETAInvoicePayload,
  ETA_URLS,
  type ETAConfig,
  type ETAInvoiceRecord,
  type ETAEnvironment,
} from "@/lib/eta.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import {
  FileText,
  Settings,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Link2,
  Building2,
  Eye,
  Ban,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

// ── مساعدات الحالة ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<ETAInvoiceRecord["status"], string> = {
  unsent: "لم تُرسل",
  submitted: "قيد المراجعة",
  valid: "مقبولة ✓",
  invalid: "مرفوضة ✗",
  cancelled: "ملغاة",
};

const STATUS_COLORS: Record<ETAInvoiceRecord["status"], string> = {
  unsent: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  valid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  invalid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

const STATUS_ICON: Record<ETAInvoiceRecord["status"], React.ComponentType<{ className?: string }>> = {
  unsent: Clock,
  submitted: RefreshCw,
  valid: CheckCircle,
  invalid: XCircle,
  cancelled: Ban,
};

// ── 1. تبويب الإعدادات ────────────────────────────────────────────────────────
function SettingsTab({
  config,
  onSave,
}: {
  config: ETAConfig | null;
  onSave: (c: ETAConfig) => void;
}) {
  const companySettings = useCompanySettings();
  const testConnectionAction = useAction(api.eta.testConnection);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [form, setForm] = useState<ETAConfig>(
    config ?? {
      environment: "preprod",
      clientId: "",
      clientSecret: "",
      taxpayerActivityCode: "",
      issuerType: "B",
      issuerRegistrationNumber: companySettings?.taxNumber ?? "",
      issuerName: companySettings?.companyName ?? "",
      issuerAddress: companySettings?.companyAddress ?? "",
      issuerBranchCode: "0",
    }
  );

  const set = (field: keyof ETAConfig, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.clientId || !form.clientSecret || !form.issuerRegistrationNumber) {
      toast.error("يرجى تعبئة جميع الحقول الإلزامية");
      return;
    }
    saveETAConfig(form);
    onSave(form);
    toast.success("تم حفظ إعدادات ETA بنجاح");
  };

  const handleTest = async () => {
    if (!form.clientId || !form.clientSecret) {
      toast.error("أدخل Client ID و Client Secret أولاً");
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testConnectionAction({
      environment: form.environment,
      clientId: form.clientId,
      clientSecret: form.clientSecret,
    });
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* بيئة التشغيل */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            بيئة التشغيل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["preprod", "prod"] as ETAEnvironment[]).map((env) => (
              <button
                key={env}
                onClick={() => set("environment", env)}
                className={cn(
                  "border-2 rounded-xl p-4 text-right transition-all cursor-pointer",
                  form.environment === env
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-border hover:border-blue-300"
                )}
              >
                <p className="font-semibold text-sm">
                  {env === "preprod" ? "بيئة الاختبار (PreProd)" : "بيئة الإنتاج (Prod)"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {env === "preprod"
                    ? "للاختبار والتطوير — لا تُعتمد رسمياً"
                    : "البيئة الفعلية — فواتير رسمية معتمدة"}
                </p>
                <p className="text-xs text-blue-600 mt-1 font-mono truncate">
                  {ETA_URLS[env].api}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* بيانات الاعتماد */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-green-500" />
            بيانات الاعتماد (من بوابة ETA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Client ID <span className="text-destructive">*</span></Label>
              <Input
                value={form.clientId}
                onChange={(e) => set("clientId", e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                dir="ltr"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Client Secret <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                value={form.clientSecret}
                onChange={(e) => set("clientSecret", e.target.value)}
                placeholder="••••••••••••••••"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                احصل على هذه البيانات من{" "}
                <a
                  href={`https://profile.${form.environment === "preprod" ? "preprod." : ""}eta.gov.eg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  بوابة الممولين
                </a>
              </p>
            </div>
          </div>

          {/* زر اختبار الاتصال */}
          <Button
            onClick={handleTest}
            disabled={testing}
            variant="secondary"
            className="w-full gap-2"
          >
            {testing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {testing ? "جارٍ الاختبار..." : "اختبار الاتصال"}
          </Button>

          {testResult && (
            <div
              className={cn(
                "rounded-lg p-3 text-sm flex items-start gap-2",
                testResult.success
                  ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
              )}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* بيانات الممول */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-orange-500" />
            بيانات الممول (المُصدِر)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">الرقم الضريبي <span className="text-destructive">*</span></Label>
              <Input
                value={form.issuerRegistrationNumber}
                onChange={(e) => set("issuerRegistrationNumber", e.target.value)}
                placeholder="123456789"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">نوع الممول</Label>
              <Select value={form.issuerType} onValueChange={(v) => set("issuerType", v as "B" | "P" | "F")}>
                <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="B">شركة (B)</SelectItem>
                  <SelectItem value="P">شخص طبيعي (P)</SelectItem>
                  <SelectItem value="F">فرع (F)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">اسم الممول <span className="text-destructive">*</span></Label>
            <Input
              value={form.issuerName}
              onChange={(e) => set("issuerName", e.target.value)}
              placeholder="اسم الشركة أو المنشأة"
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">العنوان</Label>
            <Input
              value={form.issuerAddress}
              onChange={(e) => set("issuerAddress", e.target.value)}
              placeholder="العنوان التفصيلي"
              dir="rtl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">كود النشاط الضريبي <span className="text-destructive">*</span></Label>
              <Input
                value={form.taxpayerActivityCode}
                onChange={(e) => set("taxpayerActivityCode", e.target.value)}
                placeholder="مثال: 1234"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">كود الفرع</Label>
              <Input
                value={form.issuerBranchCode ?? "0"}
                onChange={(e) => set("issuerBranchCode", e.target.value)}
                placeholder="0"
                dir="ltr"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white gap-2"
      >
        <CheckCircle className="w-4 h-4" />
        حفظ الإعدادات
      </Button>

      {/* روابط مفيدة */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
        <CardContent className="py-3 px-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">روابط مفيدة</p>
          <div className="space-y-1 text-xs text-blue-700 dark:text-blue-400">
            <p>
              🔗{" "}
              <a href="https://sdk.invoicing.eta.gov.eg" target="_blank" rel="noopener noreferrer" className="underline">
                وثائق ETA SDK الرسمية
              </a>
            </p>
            <p>
              🔗{" "}
              <a href="https://profile.preprod.eta.gov.eg" target="_blank" rel="noopener noreferrer" className="underline">
                بوابة الاختبار (PreProd)
              </a>
            </p>
            <p>
              🔗{" "}
              <a href="https://profile.eta.gov.eg" target="_blank" rel="noopener noreferrer" className="underline">
                بوابة الإنتاج (Production)
              </a>
            </p>
            <p>
              🔗{" "}
              <a href="https://preprod.invoicing.eta.gov.eg" target="_blank" rel="noopener noreferrer" className="underline">
                منظومة الفاتورة الإلكترونية (تجريبي)
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 2. تبويب الفواتير ─────────────────────────────────────────────────────────
function InvoicesTab({ config }: { config: ETAConfig | null }) {
  const submitAction = useAction(api.eta.submitInvoice);
  const cancelAction = useAction(api.eta.cancelDocument);
  const statusAction = useAction(api.eta.getDocumentStatus);

  const sales = useLiveQuery(() => db.sales.orderBy("date").reverse().toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);

  const [records, setRecords] = useState<ETAInvoiceRecord[]>(loadAllETARecords);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  // Dialog تفاصيل
  const [detailRecord, setDetailRecord] = useState<ETAInvoiceRecord | null>(null);
  // Dialog إلغاء
  const [cancelDialogSaleId, setCancelDialogSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const reloadRecords = () => setRecords(loadAllETARecords());

  const getRecord = (saleId: string): ETAInvoiceRecord | undefined =>
    records.find((r) => r.saleId === saleId);

  const filtered = useMemo(
    () =>
      (sales ?? []).filter(
        (s) =>
          !search ||
          s.invoiceNumber.includes(search) ||
          s.customerName.toLowerCase().includes(search.toLowerCase())
      ),
    [sales, search]
  );

  const handleSubmit = async (saleId: string) => {
    if (!config) {
      toast.error("يجب إعداد بيانات ETA أولاً من تبويب الإعدادات");
      return;
    }
    const sale = (sales ?? []).find((s) => s.id === saleId);
    if (!sale) return;

    const customer = (customers ?? []).find((c) => c.id === sale.customerId);

    setLoading(saleId);
    try {
      const payload = buildETAInvoicePayload({
        config,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.date,
        customerName: sale.customerName,
        customerAddress: customer?.address,
        items: sale.items,
        totalAmount: sale.totalAmount,
        discount: sale.discount,
        netAmount: sale.netAmount,
      });

      const result = await submitAction({
        environment: config.environment,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        invoicePayload: JSON.stringify(payload),
      });

      const record: ETAInvoiceRecord = {
        saleId,
        invoiceNumber: sale.invoiceNumber,
        status: result.success ? "submitted" : "invalid",
        submissionId: result.submissionId,
        uuid: result.uuid,
        longId: result.longId,
        hashKey: result.hashKey,
        submittedAt: new Date().toISOString(),
        errorMessage: result.errorMessage,
        etaResponse: result.rawResponse,
      };

      saveETARecord(record);
      reloadRecords();

      if (result.success) {
        toast.success(`تم إرسال الفاتورة ${sale.invoiceNumber} بنجاح`);
      } else {
        toast.error(`فشل إرسال الفاتورة: ${result.errorMessage}`);
      }
    } catch {
      toast.error("حدث خطأ غير متوقع أثناء الإرسال");
    } finally {
      setLoading(null);
    }
  };

  const handleRefreshStatus = async (saleId: string) => {
    if (!config) return;
    const rec = getRecord(saleId);
    if (!rec?.uuid) {
      toast.error("لا يوجد UUID للفاتورة — أرسلها أولاً");
      return;
    }
    setLoading(saleId);
    const result = await statusAction({
      environment: config.environment,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      uuid: rec.uuid,
    });
    if (result.success && result.status) {
      const statusMap: Record<string, ETAInvoiceRecord["status"]> = {
        Valid: "valid",
        Submitted: "submitted",
        Cancelled: "cancelled",
        Rejected: "invalid",
      };
      const newStatus = statusMap[result.status] ?? "submitted";
      const updated = { ...rec, status: newStatus };
      saveETARecord(updated);
      reloadRecords();
      toast.success(`حالة الفاتورة: ${result.status}`);
    } else {
      toast.error(result.errorMessage ?? "تعذّر جلب الحالة");
    }
    setLoading(null);
  };

  const handleCancel = async () => {
    if (!config || !cancelDialogSaleId) return;
    const rec = getRecord(cancelDialogSaleId);
    if (!rec?.uuid) return;

    setLoading(cancelDialogSaleId);
    const result = await cancelAction({
      environment: config.environment,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      uuid: rec.uuid,
      reason: cancelReason || "إلغاء من قِبل الممول",
    });

    if (result.success) {
      const updated: ETAInvoiceRecord = { ...rec, status: "cancelled" };
      saveETARecord(updated);
      reloadRecords();
      toast.success("تم إلغاء الفاتورة بنجاح");
    } else {
      toast.error(result.errorMessage ?? "فشل الإلغاء");
    }

    setCancelDialogSaleId(null);
    setCancelReason("");
    setLoading(null);
  };

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
        <AlertTriangle className="w-12 h-12 opacity-40 text-orange-400" />
        <p className="font-semibold">لم يتم إعداد بيانات ETA بعد</p>
        <p className="text-sm">اذهب إلى تبويب الإعدادات وأدخل بيانات الاعتماد</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* إحصائيات */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["unsent", "submitted", "valid", "invalid"] as const).map((s) => {
          const count = (sales ?? []).filter((sale) => {
            const r = getRecord(sale.id);
            return (r?.status ?? "unsent") === s;
          }).length;
          const Icon = STATUS_ICON[s];
          return (
            <div
              key={s}
              className={cn("rounded-xl p-3 text-center border", STATUS_COLORS[s])}
            >
              <Icon className="w-5 h-5 mx-auto mb-1" />
              <p className="font-bold text-lg">{count}</p>
              <p className="text-xs">{STATUS_LABELS[s]}</p>
            </div>
          );
        })}
      </div>

      {/* البحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث برقم الفاتورة أو اسم العميل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {/* جدول الفواتير */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-right p-3 font-semibold">رقم الفاتورة</th>
              <th className="text-right p-3 font-semibold">العميل</th>
              <th className="text-right p-3 font-semibold">التاريخ</th>
              <th className="text-right p-3 font-semibold">الحالة</th>
              <th className="text-center p-3 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sale) => {
              const rec = getRecord(sale.id);
              const status = rec?.status ?? "unsent";
              const Icon = STATUS_ICON[status];
              const isLoading = loading === sale.id;
              return (
                <tr key={sale.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-bold text-blue-600">{sale.invoiceNumber}</td>
                  <td className="p-3">{sale.customerName}</td>
                  <td className="p-3 text-muted-foreground">{sale.date}</td>
                  <td className="p-3">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold", STATUS_COLORS[status])}>
                      <Icon className="w-3 h-3" />
                      {STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* إرسال */}
                      {(status === "unsent" || status === "invalid") && (
                        <Button
                          size="sm"
                          disabled={isLoading}
                          onClick={() => handleSubmit(sale.id)}
                          className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          إرسال
                        </Button>
                      )}
                      {/* تحديث الحالة */}
                      {(status === "submitted" || status === "valid") && rec?.uuid && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isLoading}
                          onClick={() => handleRefreshStatus(sale.id)}
                          className="gap-1 text-xs h-7 px-2"
                        >
                          <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                          تحديث
                        </Button>
                      )}
                      {/* إلغاء */}
                      {(status === "submitted" || status === "valid") && rec?.uuid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isLoading}
                          onClick={() => setCancelDialogSaleId(sale.id)}
                          className="gap-1 text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Ban className="w-3 h-3" />
                          إلغاء
                        </Button>
                      )}
                      {/* تفاصيل */}
                      {rec && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailRecord(rec)}
                          className="gap-1 text-xs h-7 px-2"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">لا توجد فواتير</p>
        )}
      </div>

      {/* Dialog تفاصيل الفاتورة */}
      <Dialog open={!!detailRecord} onOpenChange={(v) => !v && setDetailRecord(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل استجابة ETA</DialogTitle>
          </DialogHeader>
          {detailRecord && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <p className="font-semibold">{STATUS_LABELS[detailRecord.status]}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground">وقت الإرسال</p>
                  <p className="font-semibold text-xs">
                    {detailRecord.submittedAt
                      ? new Date(detailRecord.submittedAt).toLocaleString("ar-EG")
                      : "—"}
                  </p>
                </div>
              </div>
              {detailRecord.submissionId && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground mb-1">Submission ID</p>
                  <p className="font-mono text-xs break-all">{detailRecord.submissionId}</p>
                </div>
              )}
              {detailRecord.uuid && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground mb-1">UUID</p>
                  <p className="font-mono text-xs break-all">{detailRecord.uuid}</p>
                </div>
              )}
              {detailRecord.longId && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground mb-1">Long ID</p>
                  <p className="font-mono text-xs break-all">{detailRecord.longId}</p>
                </div>
              )}
              {detailRecord.errorMessage && (
                <div className="bg-red-50 dark:bg-red-950/30 rounded p-2 text-red-700 dark:text-red-300">
                  <p className="text-xs font-semibold mb-1">رسالة الخطأ</p>
                  <p className="text-xs">{detailRecord.errorMessage}</p>
                </div>
              )}
              {detailRecord.etaResponse && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold">الاستجابة الكاملة من ETA</p>
                  <Textarea
                    value={detailRecord.etaResponse}
                    readOnly
                    rows={8}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                </div>
              )}
              {detailRecord.uuid && config && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    const url = `${ETA_URLS[config.environment].portal}/documents/${detailRecord.uuid}/details`;
                    window.open(url, "_blank");
                  }}
                >
                  <Eye className="w-4 h-4" />
                  عرض في بوابة ETA
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog إلغاء */}
      <Dialog open={!!cancelDialogSaleId} onOpenChange={(v) => !v && setCancelDialogSaleId(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إلغاء الفاتورة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من إلغاء هذه الفاتورة في منظومة ETA؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">سبب الإلغاء</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="إلغاء من قِبل الممول"
                dir="rtl"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => setCancelDialogSaleId(null)}
              >
                تراجع
              </Button>
              <Button
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={handleCancel}
                disabled={!!loading}
              >
                تأكيد الإلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── الصفحة الرئيسية ───────────────────────────────────────────────────────────
export default function ETAPage() {
  const [config, setConfig] = useState<ETAConfig | null>(loadETAConfig);

  return (
    <div className="space-y-6 p-1" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-[#1e2a4a] flex items-center justify-center shadow-md flex-shrink-0">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">منظومة الفاتورة الإلكترونية</h1>
          <p className="text-sm text-muted-foreground">
            التكامل مع مصلحة الضرائب المصرية (ETA)
          </p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {config ? (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                config.environment === "prod"
                  ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400"
                  : "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-400"
              )}
            >
              {config.environment === "prod" ? "🟢 بيئة الإنتاج" : "🟡 بيئة الاختبار"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-300">
              غير مُعدّ
            </Badge>
          )}
        </div>
      </div>

      {/* تنبيه مهم */}
      <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10 dark:border-orange-900">
        <CardContent className="py-3 px-4">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-800 dark:text-orange-300 space-y-1">
              <p className="font-semibold">ملاحظة هامة بشأن التوقيع الرقمي</p>
              <p>
                تتطلب منظومة ETA توقيع رقمياً (Digital Signature) على كل فاتورة باستخدام شهادة رقمية معتمدة.
                يُجهّز هذا النظام البيانات ويُرسلها، لكن قد تحتاج إلى ربط شهادة رقمية معتمدة من مزود معتمد
                للقبول الكامل في بيئة الإنتاج. ابدأ بـ بيئة الاختبار (PreProd) للتجربة.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices" dir="rtl">
        <TabsList className="w-full grid grid-cols-2 h-auto p-1">
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="w-4 h-4" />
            الفواتير
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            الإعدادات
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <TabsContent value="invoices" className="mt-0">
              <InvoicesTab config={config} />
            </TabsContent>
            <TabsContent value="settings" className="mt-0">
              <SettingsTab config={config} onSave={setConfig} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalBackup } from "@/lib/db.ts";
import {
  saveLocalBackup,
  deleteLocalBackup,
  exportToFile,
  exportToDirectory,
  exportLocalBackupToFile,
  openBackupFile,
  parseFile,
  applyBackup,
  getDataStats,
  fsSaveSupported,
  fsDirSupported,
  type BackupPayload,
  type ImportResult,
} from "@/lib/backup.ts";
import { AUTO_BACKUP_MAX } from "@/lib/auto-backup.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import {
  HardDrive, Save, Upload, Download, Trash2, FolderOpen,
  Usb, RefreshCw, CheckCircle, AlertTriangle, Info,
  ShieldCheck, Database, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ── ترجمات أسماء الجداول ─────────────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  settings: "إعدادات الشركة", rawMaterials: "المواد الخام",
  products: "المنتجات", suppliers: "الموردون", customers: "العملاء",
  collections: "التحصيلات", purchases: "المشتريات", sales: "المبيعات",
  treasury: "الخزنة", expenses: "المصروفات", employees: "الموظفون",
  attendance: "الحضور", salaryPayments: "الرواتب",
  productionOrders: "الإنتاج", partners: "الشركاء",
  profitDistributions: "توزيع الأرباح", appUsers: "المستخدمون",
  qualityChecks: "فحوصات الجودة", deliveryOrders: "طلبيات التوزيع",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isAutoBackup(b: LocalBackup) { return b.label.startsWith("تلقائي"); }
function isManualBackup(b: LocalBackup) { return !b.label.startsWith("تلقائي"); }

// ── مكوّن بطاقة نسخة داخلية ──────────────────────────────────────────────────
function BackupCard({
  backup,
  onRestore,
  onDelete,
  onExport,
}: {
  backup: LocalBackup;
  onRestore: (b: LocalBackup) => void;
  onDelete: (id: string) => void;
  onExport: (b: LocalBackup) => void;
}) {
  const isAuto = isAutoBackup(backup);
  return (
    <div className={cn(
      "border rounded-xl p-3 bg-card hover:border-primary/40 transition-colors",
      isAuto && "border-dashed",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            isAuto ? "bg-green-100 dark:bg-green-950/40" : "bg-primary/10",
          )}>
            {isAuto
              ? <Zap className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              : <Database className="w-3.5 h-3.5 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-xs truncate">{backup.label}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              {new Date(backup.createdAt).toLocaleString("ar-EG")}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                {backup.recordCount.toLocaleString("ar-EG")} سجل
              </Badge>
              <span className="text-[10px] text-muted-foreground">{formatSize(backup.sizeBytes)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={() => onExport(backup)} title="تصدير للفلاشة">
            <Usb className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] gap-1 text-blue-600 hover:text-blue-700 cursor-pointer" onClick={() => onRestore(backup)}>
            <Upload className="w-3 h-3" />
            استعادة
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive cursor-pointer" onClick={() => onDelete(backup.id)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── مكوّن نتيجة الاستيراد ─────────────────────────────────────────────────────
function RestoreResult({ result }: { result: ImportResult }) {
  const total = Object.values(result.counts).reduce((s, v) => s + v, 0);
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-lg p-3 text-sm",
      result.success
        ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
        : "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
    )}>
      {result.success
        ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      <div>
        <p className="font-semibold">
          {result.success ? `تمت الاستعادة — ${total.toLocaleString("ar-EG")} سجل` : "اكتملت مع أخطاء"}
        </p>
        {result.errors.map((e, i) => (
          <p key={i} className="text-xs mt-1 opacity-80">{e}</p>
        ))}
      </div>
    </div>
  );
}

// ── الصفحة ────────────────────────────────────────────────────────────────────
export default function BackupPage() {
  const fsFile = fsSaveSupported();
  const fsDir = fsDirSupported();

  const backups = useLiveQuery(() => db.backups.orderBy("createdAt").reverse().toArray(), []);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // حفظ داخلي
  const [savingLocal, setSavingLocal] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  // تصدير خارجي
  const [exporting, setExporting] = useState(false);

  // استعادة
  const [restorePayload, setRestorePayload] = useState<BackupPayload | null>(null);
  const [restoreSource, setRestoreSource] = useState<LocalBackup | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<ImportResult | null>(null);

  // استيراد من ملف (fallback)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    setLoadingStats(true);
    try { setStats(await getDataStats()); }
    finally { setLoadingStats(false); }
  };

  useEffect(() => { loadStats(); }, []);

  const totalRecords = stats ? Object.values(stats).reduce((s, v) => s + v, 0) : 0;

  // ── حفظ داخلي ──────────────────────────────────────────────────────────────
  const handleSaveLocal = async () => {
    setSavingLocal(true);
    try {
      const b = await saveLocalBackup(newLabel.trim() || undefined);
      setNewLabel("");
      toast.success(`تم الحفظ داخلياً — ${b.recordCount.toLocaleString("ar-EG")} سجل`);
      await loadStats();
    } catch (err) {
      toast.error(`فشل الحفظ: ${err instanceof Error ? err.message : "خطأ"}`);
    } finally {
      setSavingLocal(false);
    }
  };

  // ── حذف نسخة داخلية ────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await deleteLocalBackup(id);
    toast.success("تم الحذف");
  };

  // ── تصدير نسخة داخلية للفلاشة ──────────────────────────────────────────────
  const handleExportBackup = async (b: LocalBackup) => {
    try {
      const name = await exportLocalBackupToFile(b);
      toast.success(`تم التصدير: ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("abort") || msg.includes("cancel")) return;
      toast.error(`فشل التصدير: ${msg}`);
    }
  };

  // ── تصدير مباشر (بيانات حالية) ─────────────────────────────────────────────
  const handleExportDirect = async (type: "file" | "dir") => {
    setExporting(true);
    try {
      const name = type === "file" ? await exportToFile() : await exportToDirectory();
      toast.success(`تم الحفظ على الجهاز: ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("abort") || msg.includes("cancel")) return;
      toast.error(`فشل التصدير: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  // ── بدء الاستعادة من نسخة داخلية ───────────────────────────────────────────
  const handleRestoreFromBackup = (b: LocalBackup) => {
    try {
      const payload = JSON.parse(b.data) as BackupPayload;
      setRestorePayload(payload);
      setRestoreSource(b);
      setRestoreResult(null);
      setRestoreMode("merge");
      setRestoreDialogOpen(true);
    } catch {
      toast.error("بيانات النسخة تالفة");
    }
  };

  // ── بدء الاستعادة من ملف خارجي ─────────────────────────────────────────────
  const handleOpenExternal = async () => {
    try {
      const payload = await openBackupFile();
      setRestorePayload(payload);
      setRestoreSource(null);
      setRestoreResult(null);
      setRestoreMode("merge");
      setRestoreDialogOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "USE_INPUT") { fileInputRef.current?.click(); return; }
      if (msg.includes("abort") || msg.includes("cancel")) return;
      toast.error(`تعذّر فتح الملف: ${msg}`);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await parseFile(file);
      setRestorePayload(payload);
      setRestoreSource(null);
      setRestoreResult(null);
      setRestoreMode("merge");
      setRestoreDialogOpen(true);
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : "خطأ"}`);
    }
    e.target.value = "";
  };

  // ── تنفيذ الاستعادة ─────────────────────────────────────────────────────────
  const handleApplyRestore = async () => {
    if (!restorePayload) return;
    setRestoring(true);
    try {
      const result = await applyBackup(restorePayload, restoreMode);
      setRestoreResult(result);
      setRestoreDialogOpen(false);
      if (result.success) toast.success("تمت الاستعادة بنجاح");
      else toast.warning("اكتملت الاستعادة مع بعض الأخطاء");
      await loadStats();
    } catch (err) {
      toast.error(`فشل: ${err instanceof Error ? err.message : "خطأ"}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6 p-1 max-w-3xl" dir="rtl">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
          <HardDrive className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold">النسخ الاحتياطي والاستعادة</h1>
          <p className="text-sm text-muted-foreground">
            نسخ داخلية محفوظة في قاعدة البيانات + تصدير للفلاشة
          </p>
        </div>
      </div>

      {/* ── شرح المفهوم ── */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-900">
        <CardContent className="py-3 px-4 flex gap-3 items-start">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed space-y-1">
            <p><strong>طريقتان للحفظ:</strong></p>
            <p>🗄️ <strong>داخلي:</strong> النسخة تُحفظ مباشرة في قاعدة البيانات المحلية (IndexedDB) — مستقلة عن نظام التشغيل ولا تظهر في مجلدات الجهاز.</p>
            <p>💾 <strong>فلاشة / جهاز:</strong> تصدير ملف JSON مباشرة لأي مجلد أو فلاشة USB تختارها.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">

        {/* ── بطاقة الحفظ الداخلي ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              حفظ داخلي (IndexedDB)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!loadingStats && stats && (
              <div className="bg-muted/40 rounded-lg p-2.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">السجلات الحالية</span>
                <span className="font-bold">{totalRecords.toLocaleString("ar-EG")} سجل</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">تسمية النسخة (اختياري)</Label>
              <Input
                placeholder="مثال: نهاية الشهر — يونيو"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleSaveLocal}
              disabled={savingLocal}
              className="w-full gap-2 cursor-pointer"
            >
              {savingLocal
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ الحفظ...</>
                : <><Save className="w-4 h-4" /> حفظ نسخة الآن</>}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              النسخ مخزّنة في قاعدة البيانات — لا تظهر في مجلدات الجهاز
            </p>
          </CardContent>
        </Card>

        {/* ── بطاقة الحفظ على الفلاشة ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Usb className="w-4 h-4 text-primary" />
              حفظ على فلاشة / جهاز
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              يصدّر ملف JSON مباشرة إلى مجلد أو فلاشة USB تختارها.
            </p>
            {fsFile ? (
              <Button
                variant="secondary"
                onClick={() => handleExportDirect("file")}
                disabled={exporting}
                className="w-full gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                حفظ كملف (اختر المكان)
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => handleExportDirect("file")}
                disabled={exporting}
                className="w-full gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                تنزيل ملف JSON
              </Button>
            )}
            {fsDir && (
              <Button
                variant="outline"
                onClick={() => handleExportDirect("dir")}
                disabled={exporting}
                className="w-full gap-2 cursor-pointer"
              >
                <Usb className="w-4 h-4" />
                حفظ في مجلد / فلاشة USB
              </Button>
            )}
            <Separator />
            <p className="text-xs font-medium">استعادة من ملف خارجي</p>
            <Button
              variant="outline"
              onClick={handleOpenExternal}
              className="w-full gap-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              {fsFile ? "فتح من فلاشة / جهاز" : "رفع ملف JSON"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileInput} />
          </CardContent>
        </Card>
      </div>

      {/* ── قائمة النسخ الداخلية — بتبويبين ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            النسخ المحفوظة داخلياً
            <div className="mr-auto flex items-center gap-2">
              {/* مؤشر النسخ التلقائي */}
              <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-900">
                <Zap className="w-2.5 h-2.5" />
                تلقائي {(backups ?? []).filter(isAutoBackup).length}/{AUTO_BACKUP_MAX}
              </div>
              <Badge variant="secondary">
                {(backups ?? []).length} نسخة
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(backups ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">النسخ التلقائية ستظهر هنا بعد أي عملية</p>
              <p className="text-xs mt-1">أو اضغط "حفظ نسخة الآن" لنسخة يدوية فورية</p>
            </div>
          ) : (
            <Tabs defaultValue="auto" dir="rtl">
              <TabsList className="w-full grid grid-cols-2 mb-3">
                <TabsTrigger value="auto" className="text-xs gap-1">
                  <Zap className="w-3 h-3" />
                  تلقائية ({(backups ?? []).filter(isAutoBackup).length})
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs gap-1">
                  <Database className="w-3 h-3" />
                  يدوية ({(backups ?? []).filter(isManualBackup).length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="auto" className="mt-0">
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {(backups ?? []).filter(isAutoBackup).length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-4">
                      ستُنشأ نسخة تلقائية بعد 3 ثوانٍ من أي عملية
                    </p>
                  ) : (backups ?? []).filter(isAutoBackup).map((b) => (
                    <BackupCard key={b.id} backup={b} onRestore={handleRestoreFromBackup} onDelete={handleDelete} onExport={handleExportBackup} />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="manual" className="mt-0">
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {(backups ?? []).filter(isManualBackup).length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-4">
                      لا توجد نسخ يدوية — اضغط "حفظ نسخة الآن" أعلاه
                    </p>
                  ) : (backups ?? []).filter(isManualBackup).map((b) => (
                    <BackupCard key={b.id} backup={b} onRestore={handleRestoreFromBackup} onDelete={handleDelete} onExport={handleExportBackup} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* ── إحصاءات قاعدة البيانات ── */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              محتويات قاعدة البيانات
              <button onClick={loadStats} disabled={loadingStats} className="mr-auto text-muted-foreground hover:text-foreground cursor-pointer">
                <RefreshCw className={cn("w-3.5 h-3.5", loadingStats && "animate-spin")} />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-muted/40 rounded-md px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">{TABLE_LABELS[k] ?? k}</span>
                  <span className="font-semibold tabular-nums">{v.toLocaleString("ar-EG")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── نصائح ── */}
      <Card className="border-green-200 dark:border-green-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
            <ShieldCheck className="w-4 h-4" />
            نصائح الحفظ الآمن
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            {[
              "احفظ نسخة داخلية يومياً — سريعة وبضغطة واحدة",
              "صدّر للفلاشة أسبوعياً على الأقل كضمان إضافي",
              "النسخ الداخلية تبقى حتى لو أغلقت التطبيق أو أعدت تشغيل الجهاز",
              "إذا مسحت بيانات المتصفح أو أعدت تنسيق الجهاز، ستفقد النسخ الداخلية — لهذا يجب الحفظ على الفلاشة بشكل دوري",
              "وضع 'دمج' آمن للاستعادة — وضع 'استبدال' يحذف جميع البيانات الحالية",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-500 flex-shrink-0 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── نتيجة آخر استعادة ── */}
      {restoreResult && (
        <RestoreResult result={restoreResult} />
      )}

      {/* ── Dialog تأكيد الاستعادة ── */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              تأكيد استعادة البيانات
            </DialogTitle>
          </DialogHeader>
          {restorePayload && (
            <div className="space-y-4">
              {/* معلومات المصدر */}
              <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1.5">
                {restoreSource ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">النسخة</span>
                    <span className="font-medium">{restoreSource.label}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">تاريخ النسخة</span>
                  <span className="font-medium">{new Date(restorePayload.exportedAt).toLocaleString("ar-EG")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">عدد السجلات</span>
                  <span className="font-bold">
                    {Object.values(restorePayload.tables)
                      .reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0)
                      .toLocaleString("ar-EG")}
                  </span>
                </div>
              </div>

              {/* اختيار الوضع */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">وضع الاستعادة</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["merge", "replace"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setRestoreMode(mode)}
                      className={cn(
                        "rounded-lg border p-3 text-sm text-right transition-all cursor-pointer",
                        restoreMode === mode ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground",
                      )}
                    >
                      <p className="font-semibold">{mode === "merge" ? "🔀 دمج" : "♻️ استبدال"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mode === "merge" ? "يضيف دون حذف الموجود" : "يحذف الكل ثم يستعيد"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {restoreMode === "replace" && (
                <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    <strong>تحذير:</strong> سيتم حذف جميع بياناتك الحالية. لا يمكن التراجع.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button
              onClick={handleApplyRestore}
              disabled={restoring}
              variant={restoreMode === "replace" ? "destructive" : "default"}
              className="gap-2 cursor-pointer"
            >
              {restoring
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ الاستعادة...</>
                : <><Upload className="w-4 h-4" />{restoreMode === "merge" ? "دمج البيانات" : "استبدال البيانات"}</>}
            </Button>
            <Button variant="ghost" onClick={() => setRestoreDialogOpen(false)} disabled={restoring} className="cursor-pointer">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

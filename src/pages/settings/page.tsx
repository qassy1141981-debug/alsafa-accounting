import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Download, Upload, Settings, Building2, HardDrive, Smartphone, RefreshCw, CheckCircle, WifiOff } from "lucide-react";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import { usePwaInstall } from "@/hooks/use-pwa-install.ts";
import type { CompanySettings } from "@/lib/db.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useLocalAuth } from "@/hooks/use-local-auth.ts";
import UsersManagement from "./_components/users-management.tsx";

/** زر سري: اضغط على رقم الإصدار 5 مرات خلال 3 ثوانٍ للدخول للوحة الإدارة */
function AdminSecretEntry() {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = () => {
    const next = count + 1;
    setCount(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next >= 5) {
      setCount(0);
      window.location.href = "/admin/licenses";
      return;
    }
    timerRef.current = setTimeout(() => setCount(0), 3000);
  };

  return (
    <div className="text-center pt-4 pb-2 select-none" onClick={handleTap}>
      <p className="text-xs text-muted-foreground cursor-default">
        النظام المحاسبي المتكامل v2.0 | جميع البيانات مخزنة محلياً على جهازك
      </p>
      {count > 0 && count < 5 && (
        <p className="text-xs text-muted-foreground/50 mt-1">{count}/5</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const settings = useCompanySettings();
  const { installPrompt, install } = usePwaInstall();
  const canInstall = !!installPrompt;
  const { session } = useLocalAuth();
  const isAdmin = session?.role === "admin";
  const [form, setForm] = useState<Omit<CompanySettings, "id">>({
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyLogo: "",
    taxNumber: undefined,
    email: undefined,
    currency: "ج.م",
  });
  const [saving, setSaving] = useState(false);
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "updating" | "done" | "offline">("idle");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName ?? "",
        companyAddress: settings.companyAddress ?? "",
        companyPhone: settings.companyPhone ?? "",
        companyLogo: settings.companyLogo ?? "",
        taxNumber: settings.taxNumber,
        email: settings.email,
        currency: settings.currency ?? "ج.م",
      });
    }
  }, [settings]);

  // متابعة حالة الاتصال
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setForm((f) => ({ ...f, companyLogo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  // تحديث التطبيق: حذف كل الكاش + تحميل النسخة الجديدة من الإنترنت
  const handleUpdate = async () => {
    if (!isOnline) {
      setUpdateState("offline");
      toast.error("لا يوجد اتصال بالإنترنت. يرجى الاتصال ثم المحاولة مرة أخرى.");
      return;
    }
    setUpdateState("checking");
    try {
      // أرسل رسالة للـ Service Worker لحذف الكاش
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "FORCE_UPDATE" });
      }

      // احذف كل الكاش مباشرة من الصفحة كذلك
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      setUpdateState("updating");

      // سجّل الـ SW من جديد
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      toast.success("تم تحديث التطبيق بنجاح! سيتم إعادة التحميل الآن...");
      setUpdateState("done");

      // أعد تحميل الصفحة بعد ثانية لتحميل النسخة الجديدة
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch {
      setUpdateState("idle");
      toast.error("حدث خطأ أثناء التحديث. حاول مرة أخرى.");
    }
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) { toast.error("اسم الشركة مطلوب"); return; }
    setSaving(true);
    try {
      await db.settings.put({ id: "company", ...form });
      toast.success("تم حفظ الإعدادات");
    } catch { toast.error("حدث خطأ"); }
    finally { setSaving(false); }
  };

  const exportBackup = async () => {
    try {
      const [s, rm, p, sup, cust, col, pur, sal, treas, exp, emp, att, salPay, prod] = await Promise.all([
        db.settings.toArray(),
        db.rawMaterials.toArray(),
        db.products.toArray(),
        db.suppliers.toArray(),
        db.customers.toArray(),
        db.collections.toArray(),
        db.purchases.toArray(),
        db.sales.toArray(),
        db.treasury.toArray(),
        db.expenses.toArray(),
        db.employees.toArray(),
        db.attendance.toArray(),
        db.salaryPayments.toArray(),
        db.productionOrders.toArray(),
      ]);

      // تضمين مفتاح الترخيص وبصمة الجهاز في النسخة الاحتياطية
      const licenseCode = localStorage.getItem("app_license_code") ?? "";
      const deviceFingerprint = localStorage.getItem("app_device_fp") ?? "";

      const data = {
        // ─── بيانات قاعدة البيانات ───────────────────────────────
        settings: s,
        rawMaterials: rm,
        products: p,
        suppliers: sup,
        customers: cust,
        collections: col,
        purchases: pur,
        sales: sal,
        treasury: treas,
        expenses: exp,
        employees: emp,
        attendance: att,
        salaryPayments: salPay,
        productionOrders: prod,
        // ─── بيانات الترخيص ──────────────────────────────────────
        licenseCode,
        deviceFingerprint,
        // ─── معلومات النسخة ───────────────────────────────────────
        exportedAt: new Date().toISOString(),
        version: "2.0",
        // ─── ملخص عدد السجلات للتحقق عند الاستعادة ──────────────
        summary: {
          settings: s.length,
          rawMaterials: rm.length,
          products: p.length,
          suppliers: sup.length,
          customers: cust.length,
          collections: col.length,
          purchases: pur.length,
          sales: sal.length,
          treasury: treas.length,
          expenses: exp.length,
          employees: emp.length,
          attendance: att.length,
          salaryPayments: salPay.length,
          productionOrders: prod.length,
        },
      };

      const json = JSON.stringify(data, null, 2);
      const companyName = (form.companyName || "الشركة").replace(/\s+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${companyName}_نسخة_احتياطية_${dateStr}.json`;

      // استخدام File System Access API إذا كانت متاحة (Chrome/Edge)
      if ("showSaveFilePicker" in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: "ملف النسخة الاحتياطية JSON", accept: { "application/json": [".json"] } }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(json);
          await writable.close();

          const total = Object.values(data.summary).reduce((a, b) => a + b, 0);
          toast.success(`✅ تم حفظ النسخة الاحتياطية بنجاح — ${total} سجل`);
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      // Fallback: تنزيل عبر رابط
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      const total = Object.values(data.summary).reduce((a, b) => a + b, 0);
      toast.success(`✅ تم تصدير النسخة الاحتياطية — ${total} سجل`);
    } catch { toast.error("حدث خطأ أثناء التصدير"); }
  };

  const importBackup = async () => {
    // استخدام File System Access API إذا كانت متاحة
    if ("showOpenFilePicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [{ description: "ملف النسخة الاحتياطية JSON", accept: { "application/json": [".json"] } }],
          multiple: false,
        });
        const file = await fileHandle.getFile();
        const text = await file.text();
        await doImport(text);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        toast.error("حدث خطأ أثناء فتح الملف");
      }
      return;
    }
    // Fallback: input تقليدي
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => doImport(reader.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  const doImport = async (text: string) => {
    if (!confirm("تحذير: سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية. هل أنت متأكد؟")) return;
    try {
      const data = JSON.parse(text);

      // استعادة قاعدة البيانات كاملة
      await db.transaction("rw", [db.settings, db.rawMaterials, db.products, db.suppliers, db.customers, db.collections, db.purchases, db.sales, db.treasury, db.expenses, db.employees, db.attendance, db.salaryPayments, db.productionOrders], async () => {
        await db.settings.clear(); if (data.settings?.length) await db.settings.bulkPut(data.settings);
        await db.rawMaterials.clear(); if (data.rawMaterials?.length) await db.rawMaterials.bulkPut(data.rawMaterials);
        await db.products.clear(); if (data.products?.length) await db.products.bulkPut(data.products);
        await db.suppliers.clear(); if (data.suppliers?.length) await db.suppliers.bulkPut(data.suppliers);
        await db.customers.clear(); if (data.customers?.length) await db.customers.bulkPut(data.customers);
        await db.collections.clear(); if (data.collections?.length) await db.collections.bulkPut(data.collections);
        await db.purchases.clear(); if (data.purchases?.length) await db.purchases.bulkPut(data.purchases);
        await db.sales.clear(); if (data.sales?.length) await db.sales.bulkPut(data.sales);
        await db.treasury.clear(); if (data.treasury?.length) await db.treasury.bulkPut(data.treasury);
        await db.expenses.clear(); if (data.expenses?.length) await db.expenses.bulkPut(data.expenses);
        await db.employees.clear(); if (data.employees?.length) await db.employees.bulkPut(data.employees);
        await db.attendance.clear(); if (data.attendance?.length) await db.attendance.bulkPut(data.attendance);
        await db.salaryPayments.clear(); if (data.salaryPayments?.length) await db.salaryPayments.bulkPut(data.salaryPayments);
        await db.productionOrders.clear(); if (data.productionOrders?.length) await db.productionOrders.bulkPut(data.productionOrders);
      });

      // استعادة مفتاح الترخيص وبصمة الجهاز إذا كانت موجودة في النسخة
      if (data.licenseCode) {
        localStorage.setItem("app_license_code", data.licenseCode);
      }
      if (data.deviceFingerprint) {
        localStorage.setItem("app_device_fp", data.deviceFingerprint);
      }

      // حساب إجمالي السجلات المستعادة
      const tables = ["settings","rawMaterials","products","suppliers","customers","collections","purchases","sales","treasury","expenses","employees","attendance","salaryPayments","productionOrders"] as const;
      const total = tables.reduce((sum, t) => sum + (Array.isArray(data[t]) ? (data[t] as unknown[]).length : 0), 0);

      toast.success(`✅ تم استعادة النسخة الاحتياطية بنجاح — ${total} سجل`);
      setTimeout(() => window.location.reload(), 1000);
    } catch { toast.error("ملف غير صالح أو تالف — تأكد من اختيار الملف الصحيح"); }
  };

  const generalSettings = (
    <>
      {/* Company Settings */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-5 h-5" /> بيانات الشركة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1"><Label>اسم الشركة *</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} dir="rtl" /></div>
            <div className="space-y-1"><Label>رقم الهاتف</Label><Input value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} dir="rtl" /></div>
          </div>
          <div className="space-y-1"><Label>العنوان</Label><Input value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} dir="rtl" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1"><Label>الرقم الضريبي</Label><Input value={form.taxNumber ?? ""} onChange={(e) => setForm({ ...form, taxNumber: e.target.value || undefined })} dir="rtl" /></div>
            <div className="space-y-1"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value || undefined })} dir="ltr" /></div>
          </div>
          <div className="space-y-1"><Label>العملة</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="max-w-xs" dir="rtl" /></div>

          {/* Logo */}
          <div className="space-y-2">
            <Label>شعار الشركة</Label>
            <div className="flex items-center gap-3">
              {form.companyLogo && (
                <img src={form.companyLogo} alt="شعار" className="w-16 h-16 object-contain rounded-lg border" />
              )}
              <label className="cursor-pointer">
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-500 transition-colors">
                  {form.companyLogo ? "تغيير الشعار" : "رفع الشعار"}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </label>
              {form.companyLogo && (
                <Button size="sm" variant="ghost" className="text-destructive text-xs" onClick={() => setForm({ ...form, companyLogo: "" })}>إزالة</Button>
              )}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
            {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="w-5 h-5" /> النسخ الاحتياطي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* تصدير */}
          <div>
            <p className="text-sm font-medium mb-2">حفظ نسخة احتياطية</p>
            <Button onClick={exportBackup} className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white gap-2">
              <Download className="w-4 h-4" /> حفظ النسخة الاحتياطية
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              📁 ستظهر نافذة Windows لاختيار مكان الحفظ — يمكنك اختيار D: أو E: أو فلاشة USB أو أي مكان خارج C:
            </p>
          </div>

          <div className="border-t my-1" />

          {/* استيراد */}
          <div>
            <p className="text-sm font-medium mb-2">استعادة نسخة احتياطية</p>
            <Button onClick={importBackup} variant="secondary" className="w-full gap-2">
              <Upload className="w-4 h-4" /> استعادة من نسخة احتياطية
            </Button>
            {/* Fallback input مخفي للمتصفحات القديمة */}
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileInputChange} />
            <p className="text-xs text-muted-foreground mt-2">
              📂 ستظهر نافذة لاختيار ملف النسخة الاحتياطية (.json) من أي مكان على جهازك
            </p>
          </div>

          {/* تنبيه مهم */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠️ معلومات مهمة عن حفظ البيانات</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              • قاعدة البيانات محفوظة داخل المتصفح (IndexedDB) وليست في ملف مستقل — لا يمكن تغيير مسارها مباشرة
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              • عند مسح بيانات المتصفح أو إعادة تثبيت Windows ستُفقد البيانات ما لم تحفظ نسخة احتياطية
            </p>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              ✅ الحل: احفظ النسخة الاحتياطية دورياً في D: أو فلاشة USB خارج C:
            </p>
          </div>
        </CardContent>
      </Card>

      {/* تحديث التطبيق */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-5 h-5" /> تحديث التطبيق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            يقوم التحديث بتنزيل أحدث نسخة من التطبيق من الإنترنت <strong>دون المساس بأي بيانات</strong>. جميع بياناتك محفوظة في قاعدة بيانات الجهاز وليست في الكاش.
          </p>

          {/* حالة الاتصال */}
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${isOnline ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600"}`}>
            {isOnline
              ? <><CheckCircle className="w-3.5 h-3.5" /> متصل بالإنترنت — يمكن التحديث</>
              : <><WifiOff className="w-3.5 h-3.5" /> غير متصل بالإنترنت — يلزم الاتصال للتحديث</>
            }
          </div>

          <Button
            onClick={handleUpdate}
            disabled={updateState === "checking" || updateState === "updating" || updateState === "done" || !isOnline}
            className={`w-full gap-2 ${updateState === "done" ? "bg-green-600 hover:bg-green-700" : "bg-[#1e2a4a] hover:bg-[#2d3f6b]"} text-white`}
          >
            <RefreshCw className={`w-4 h-4 ${updateState === "checking" || updateState === "updating" ? "animate-spin" : ""}`} />
            {updateState === "idle" && "تحديث التطبيق"}
            {updateState === "checking" && "جارٍ التحقق..."}
            {updateState === "updating" && "جارٍ التحديث..."}
            {updateState === "done" && "تم التحديث! إعادة تحميل..."}
            {updateState === "offline" && "لا يوجد اتصال بالإنترنت"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            ✅ بياناتك محفوظة محلياً في IndexedDB ولن تتأثر بالتحديث
          </p>
        </CardContent>
      </Card>

      {/* PWA Install */}
      {canInstall && (
        <Card className="border-0 shadow-md bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-300">تثبيت التطبيق</p>
                <p className="text-xs text-muted-foreground">ثبّت النظام على جهازك للوصول السريع</p>
              </div>
            </div>
            <Button onClick={install} className="bg-blue-600 hover:bg-blue-700 text-white">تثبيت</Button>
          </CardContent>
        </Card>
      )}
    </>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-7 h-7 text-[#1e2a4a] dark:text-blue-300" />
        <h1 className="text-2xl font-bold">الإعدادات</h1>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="users" className="flex-1">المستخدمون</TabsTrigger>
            <TabsTrigger value="general" className="flex-1">الإعدادات العامة</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersManagement />
          </TabsContent>
          <TabsContent value="general" className="mt-4 space-y-4 sm:space-y-6">
            {generalSettings}
          </TabsContent>
        </Tabs>
      ) : (
        generalSettings
      )}

      {/* Version — الضغط 5 مرات يفتح لوحة الإدارة سراً */}
      <AdminSecretEntry />
    </div>
  );
}

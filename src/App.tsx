import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import { registerAutoBackupMiddleware } from "./lib/auto-backup.ts";
import NotFound from "./pages/NotFound.tsx";
import CompanySetup from "./pages/setup/page.tsx";
import AppLayout from "./components/AppLayout.tsx";
import Dashboard from "./pages/dashboard/page.tsx";
import RawMaterials from "./pages/raw-materials/page.tsx";
import Products from "./pages/products/page.tsx";
import ItemsPage from "./pages/items/page.tsx";
import Inventory from "./pages/inventory/page.tsx";
import Suppliers from "./pages/suppliers/page.tsx";
import Purchases from "./pages/purchases/page.tsx";
import Customers from "./pages/customers/page.tsx";
import Sales from "./pages/sales/page.tsx";
import Production from "./pages/production/page.tsx";
import Treasury from "./pages/treasury/page.tsx";
import Employees from "./pages/employees/page.tsx";
import ProfitsPage from "./pages/profits/page.tsx";
import Reports from "./pages/reports/page.tsx";
import SettingsPage from "./pages/settings/page.tsx";
import WhatsAppPage from "./pages/whatsapp/page.tsx";
import BackupPage from "./pages/backup/page.tsx";
import AIPage from "./pages/ai/page.tsx";
import QualityPage from "./pages/quality/page.tsx";
import DeliveryPage from "./pages/delivery/page.tsx";
import ETAPage from "./pages/eta/page.tsx";
import LicenseGate from "./pages/license/LicenseGate.tsx";
import TrialExpired from "./pages/license/TrialExpired.tsx";
import AdminLicenses from "./pages/license/AdminLicenses.tsx";
import LoginPage from "./pages/login/page.tsx";
import { LocalAuthProvider, useLocalAuth } from "./hooks/use-local-auth.ts";
import { db, seedDefaultData } from "./lib/db.ts";
import { getSavedLicenseCode, getTrialStatus } from "./lib/license.ts";
import { useServiceWorker } from "./hooks/use-service-worker.ts";
import { PwaInstallBanner } from "./components/PwaInstallBanner.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { getDeviceFingerprint } from "./lib/license.ts";

// حالات تهيئة التطبيق
type AppState =
  | "loading"           // جارٍ التحميل
  | "license-required"  // لا يوجد ترخيص ولا تجربة
  | "trial-expired"     // التجربة انتهت
  | "license-invalid"   // الترخيص غير صالح
  | "setup-required"    // جاهز لكن لم يُعيَّن اسم الشركة
  | "ready";            // جاهز تماماً

function AppRoutes() {
  useServiceWorker();
  const convex = useConvex();
  const [appState, setAppState] = useState<AppState>("loading");

  useEffect(() => {
    const init = async () => {
      if (window.location.pathname.startsWith("/admin")) {
        setAppState("ready");
        return;
      }

      if (navigator.storage?.persist) await navigator.storage.persist();

      const savedCode = getSavedLicenseCode();

      if (savedCode) {
        // ── مسار: ترخيص مدفوع ──
        try {
          const fp = await getDeviceFingerprint();
          await convex.mutation(api.licenses.activateOrVerify, {
            code: savedCode,
            deviceFingerprint: fp,
          });
        } catch {
          setAppState("license-invalid");
          return;
        }
      } else {
        // ── مسار: تجربة مجانية ──
        const trial = getTrialStatus();
        if (trial.mode === "no-trial") {
          setAppState("license-required");
          return;
        }
        if (trial.mode === "expired") {
          setAppState("trial-expired");
          return;
        }
        // trial.mode === "active" → نكمل للتطبيق
      }

      const settings = await db.settings.get("company");
      await seedDefaultData();

      if (!settings) {
        setAppState("setup-required");
      } else {
        setAppState("ready");
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── شاشة التحميل ──────────────────────────────────────────────────────────
  if (appState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e2a4a]">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-3/4 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
        </div>
      </div>
    );
  }

  // ── لا يوجد ترخيص ولا تجربة (أول مرة) ────────────────────────────────────
  if (appState === "license-required" || appState === "license-invalid") {
    return (
      <LicenseGate
        onActivated={() => {
          setAppState("loading");
          setTimeout(() => {
            db.settings.get("company").then((s) => {
              setAppState(s ? "ready" : "setup-required");
            });
          }, 500);
        }}
        onTrialStarted={() => {
          setAppState("loading");
          setTimeout(() => {
            db.settings.get("company").then((s) => {
              setAppState(s ? "ready" : "setup-required");
            });
          }, 300);
        }}
      />
    );
  }

  // ── التجربة منتهية ────────────────────────────────────────────────────────
  if (appState === "trial-expired") {
    return (
      <TrialExpired
        onActivated={() => {
          setAppState("loading");
          setTimeout(() => {
            db.settings.get("company").then((s) => {
              setAppState(s ? "ready" : "setup-required");
            });
          }, 500);
        }}
      />
    );
  }

  // ── إعداد الشركة ──────────────────────────────────────────────────────────
  if (appState === "setup-required") {
    return <CompanySetup onComplete={() => setAppState("ready")} />;
  }

  // ── التطبيق الكامل (بعد تسجيل الدخول المحلي) ─────────────────────────────
  return <AuthenticatedApp />;
}

/** يتحقق من جلسة الدخول المحلية قبل عرض التطبيق */
function AuthenticatedApp() {
  const { session, isLoading, login } = useLocalAuth();

  // مسار الإدارة السري يبقى متاحاً دون تسجيل دخول
  const isAdminPath = window.location.pathname.startsWith("/admin");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e2a4a]">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-3/4 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
        </div>
      </div>
    );
  }

  if (!session && !isAdminPath) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/admin/licenses" element={<AdminLicenses />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/purchases" element={<AppLayout><Purchases /></AppLayout>} />
        <Route path="/sales" element={<AppLayout><Sales /></AppLayout>} />
        <Route path="/customers" element={<AppLayout><Customers /></AppLayout>} />
        <Route path="/inventory" element={<AppLayout><Inventory /></AppLayout>} />
        <Route path="/raw-materials" element={<AppLayout><RawMaterials /></AppLayout>} />
        <Route path="/products" element={<AppLayout><Products /></AppLayout>} />
        <Route path="/items" element={<AppLayout><ItemsPage /></AppLayout>} />
        <Route path="/suppliers" element={<AppLayout><Suppliers /></AppLayout>} />
        <Route path="/production" element={<AppLayout><Production /></AppLayout>} />
        <Route path="/treasury" element={<AppLayout><Treasury /></AppLayout>} />
        <Route path="/employees" element={<AppLayout><Employees /></AppLayout>} />
        <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
        <Route path="/profits" element={<AppLayout><ProfitsPage /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
        <Route path="/whatsapp" element={<AppLayout><WhatsAppPage /></AppLayout>} />
        <Route path="/backup" element={<AppLayout><BackupPage /></AppLayout>} />
        <Route path="/ai" element={<AppLayout><AIPage /></AppLayout>} />
        <Route path="/quality" element={<AppLayout><QualityPage /></AppLayout>} />
        <Route path="/delivery" element={<AppLayout><DeliveryPage /></AppLayout>} />
        <Route path="/eta" element={<AppLayout><ETAPage /></AppLayout>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  useEffect(() => {
    registerAutoBackupMiddleware();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DefaultProviders>
      <LocalAuthProvider>
        <AppRoutes />
        <PwaInstallBanner />
      </LocalAuthProvider>
    </DefaultProviders>
  );
}

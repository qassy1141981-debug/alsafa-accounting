import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar.tsx";
import TrialBanner from "@/components/TrialBanner.tsx";
import { Menu, ShieldAlert } from "lucide-react";
import { getSavedLicenseCode, getTrialStatus } from "@/lib/license.ts";
import { useLocalAuth } from "@/hooks/use-local-auth.ts";
import { canAccessRoute, ROLE_LABELS, ROLE_COLORS } from "@/lib/auth.ts";
import { cn } from "@/lib/utils.ts";

interface Props {
  children: ReactNode;
}

export default function AppLayout({ children }: Props) {
  const [open, setOpen] = useState(false);
  const { session } = useLocalAuth();
  const location = useLocation();

  // نعرض الشريط التجريبي فقط إذا لا يوجد ترخيص مدفوع والتجربة نشطة
  const isTrial = !getSavedLicenseCode() && getTrialStatus().mode === "active";

  // حماية الصفحة بناءً على دور المستخدم
  const allowed = session ? canAccessRoute(session.role, location.pathname) : true;

  return (
    <div className="flex h-screen bg-background" dir="rtl">
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar drawer */}
      <div
        className={`fixed right-0 top-0 h-screen z-40 transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      {/* Main content - full width */}
      <main className="flex-1 overflow-y-auto w-full">
        {/* شريط التجربة */}
        {isTrial && <TrialBanner />}

        {/* Top bar */}
        <div
          className="sticky top-0 z-20 flex items-center px-4 py-3 border-b"
          style={{ background: "#1e2a4a" }}
        >
          <button
            onClick={() => setOpen(true)}
            className="text-white hover:text-blue-200 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/10"
            aria-label="فتح القائمة"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-white font-bold text-sm mr-3">النظام المحاسبي</span>

          {/* بيانات المستخدم على اليسار */}
          {session && (
            <div className="mr-auto flex items-center gap-2">
              <span className="text-blue-100 text-xs font-medium truncate max-w-[120px]">
                {session.name}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  ROLE_COLORS[session.role],
                )}
              >
                {ROLE_LABELS[session.role]}
              </span>
            </div>
          )}
        </div>
        {allowed ? (
          children
        ) : (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-24 px-6">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-bold">لا تملك صلاحية الوصول</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              دورك الحالي لا يسمح بعرض هذه الصفحة. تواصل مع المدير إذا كنت بحاجة للوصول.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Users,
  Warehouse,
  Package,
  Truck,
  Factory,
  Vault,
  UserCheck,
  BarChart3,
  Settings,
  FlaskConical,
  MessageCircle,
  HardDriveDownload,
  BrainCircuit,
  ShieldCheck,
  CalendarDays,
  BadgeDollarSign,
  FileText,
} from "lucide-react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import { useLocalAuth } from "@/hooks/use-local-auth.ts";
import { canAccessRoute, ROLE_LABELS, ROLE_COLORS } from "@/lib/auth.ts";

const navItems = [
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/purchases", label: "المشتريات", icon: ShoppingCart },
  { to: "/sales", label: "فواتير المبيعات", icon: Receipt },
  { to: "/customers", label: "العملاء", icon: Users },
  { to: "/inventory", label: "المخازن والجرد", icon: Warehouse },
  { to: "/items", label: "الأصناف", icon: Package },
  { to: "/suppliers", label: "الموردين", icon: Truck },
  { to: "/production", label: "الإنتاج", icon: Factory },
  { to: "/delivery", label: "التوزيع الأسبوعي", icon: CalendarDays },
  { to: "/quality", label: "الجودة والتشغيل", icon: ShieldCheck },
  { to: "/treasury", label: "الخزنة", icon: Vault },
  { to: "/employees", label: "العمال والرواتب", icon: UserCheck },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/profits", label: "الأرباح", icon: BadgeDollarSign },
  { to: "/ai", label: "الذكاء الاصطناعي", icon: BrainCircuit },
  { to: "/whatsapp", label: "واتساب", icon: MessageCircle },
  { to: "/eta", label: "الفاتورة الإلكترونية", icon: FileText },
  { to: "/backup", label: "النسخ الاحتياطي", icon: HardDriveDownload },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const settings = useCompanySettings();
  const location = useLocation();
  const { session, logout } = useLocalAuth();

  const visibleNavItems = session
    ? navItems.filter((item) => canAccessRoute(session.role, item.to))
    : navItems;

  return (
    <aside
      className="flex flex-col w-[260px] h-screen overflow-y-auto"
      style={{ background: "#1e2a4a" }}
    >
      {/* Company Info */}
      <div
        className="p-5 border-b flex items-center gap-3"
        style={{ borderColor: "rgba(255,255,255,0.1)" }}
      >
        {settings?.companyLogo ? (
          <img
            src={settings.companyLogo}
            alt="شعار"
            className="w-12 h-12 rounded-xl object-contain bg-white/10 flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-white/20">
            <img src={`${import.meta.env.BASE_URL}icon/icon-192.png`} alt="شعار" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-white font-bold text-sm truncate leading-tight">
            {settings?.companyName ?? "النظام المحاسبي"}
          </p>
          {settings?.companyAddress && (
            <p className="text-blue-300 text-xs truncate mt-0.5">{settings.companyAddress}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/dashboard"
              ? location.pathname === "/" || location.pathname === "/dashboard"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer",
                isActive
                  ? "bg-blue-500/25 text-white font-semibold"
                  : "text-blue-200 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User card */}
      {session && (
        <div
          className="p-3 border-t"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <div className="rounded-lg bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-white text-sm font-semibold truncate">{session.name}</p>
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                  ROLE_COLORS[session.role],
                )}
              >
                {ROLE_LABELS[session.role]}
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 text-xs text-blue-200 hover:text-white hover:bg-white/10 rounded-md py-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              خروج
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="p-4 text-center border-t"
        style={{ borderColor: "rgba(255,255,255,0.1)" }}
      >
        <p className="text-blue-400 text-xs">النظام المحاسبي v2.0</p>
      </div>
    </aside>
  );
}

import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Users,
  Warehouse,
  Factory,
  Vault,
  UserCheck,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

const bottomItems = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/sales", label: "مبيعات", icon: Receipt },
  { to: "/purchases", label: "مشتريات", icon: ShoppingCart },
  { to: "/customers", label: "العملاء", icon: Users },
  { to: "/inventory", label: "المخازن", icon: Warehouse },
  { to: "/production", label: "الإنتاج", icon: Factory },
  { to: "/treasury", label: "الخزنة", icon: Vault },
  { to: "/employees", label: "العمال", icon: UserCheck },
  { to: "/reports", label: "تقارير", icon: BarChart3 },
  { to: "/settings", label: "إعدادات", icon: Settings },
];

export default function BottomNav() {
  const location = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex justify-around border-t bg-[#1e2a4a] z-40 md:hidden"
      style={{ borderColor: "rgba(255,255,255,0.15)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {bottomItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.to === "/dashboard"
            ? location.pathname === "/" || location.pathname === "/dashboard"
            : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 px-1 text-xs transition-colors cursor-pointer min-w-0 flex-1",
              isActive ? "text-blue-300" : "text-blue-500/60 hover:text-blue-300",
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

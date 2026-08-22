export type { UserRole } from "./db.ts";
import type { UserRole } from "./db.ts";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "مدير",
  accountant: "محاسب",
  warehouse: "مستودع",
  sales_rep: "مبيعات",
  readonly: "قراءة فقط",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  accountant: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  warehouse: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  sales_rep: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  readonly: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

// الصفحات المسموح لكل دور
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  "/dashboard": ["admin", "accountant", "warehouse", "sales_rep", "readonly"],
  "/purchases": ["admin", "accountant", "readonly"],
  "/sales": ["admin", "accountant", "sales_rep", "readonly"],
  "/customers": ["admin", "accountant", "sales_rep", "readonly"],
  "/inventory": ["admin", "accountant", "warehouse", "readonly"],
  "/raw-materials": ["admin", "warehouse", "readonly"],
  "/products": ["admin", "warehouse", "sales_rep", "readonly"],
  "/suppliers": ["admin", "accountant", "warehouse", "readonly"],
  "/production": ["admin", "warehouse", "readonly"],
  "/treasury": ["admin", "accountant", "readonly"],
  "/employees": ["admin", "readonly"],
  "/reports": ["admin", "accountant", "readonly"],
  "/profits": ["admin", "accountant", "readonly"],
  "/whatsapp": ["admin", "accountant", "sales_rep"],
  "/backup": ["admin"],
  "/ai": ["admin", "accountant", "readonly"],
  "/quality": ["admin", "accountant", "warehouse", "readonly"],
  "/delivery": ["admin", "accountant", "sales_rep", "warehouse", "readonly"],
  "/eta": ["admin", "accountant"],
  "/settings": ["admin"],
};

export function canAccessRoute(role: UserRole, path: string): boolean {
  const allowed = ROUTE_ROLES[path];
  if (!allowed) return role === "admin";
  return allowed.includes(role);
}

export function canWrite(role: UserRole): boolean {
  return role !== "readonly";
}

const SESSION_KEY = "app_user_session";

export type Session = {
  userId: string;
  username: string;
  name: string;
  role: UserRole;
};

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_acc_salt_2024_");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

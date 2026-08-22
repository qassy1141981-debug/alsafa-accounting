/**
 * نظام النسخ الاحتياطي
 *
 * ── طبقتان للحفظ ──
 * 1. داخلي: النسخ تُخزَّن في جدول `backups` داخل IndexedDB
 *    (مستقلة عن نظام التشغيل، لا تظهر في الملفات)
 * 2. خارجي (فلاشة/جهاز): تصدير ملف JSON إلى الفلاشة أو أي مجلد
 *    عبر File System Access API مع fallback للتنزيل العادي
 */

import { db, type LocalBackup } from "./db.ts";

export const BACKUP_VERSION = 8;

// ── أنواع ──────────────────────────────────────────────────────────────────────

export type BackupPayload = {
  version: number;
  exportedAt: string;
  tables: {
    settings: unknown[];
    rawMaterials: unknown[];
    products: unknown[];
    suppliers: unknown[];
    customers: unknown[];
    collections: unknown[];
    purchases: unknown[];
    sales: unknown[];
    treasury: unknown[];
    expenses: unknown[];
    employees: unknown[];
    attendance: unknown[];
    salaryPayments: unknown[];
    productionOrders: unknown[];
    partners: unknown[];
    profitDistributions: unknown[];
    appUsers: unknown[];
    qualityChecks?: unknown[];
    deliveryOrders?: unknown[];
  };
};

export type ImportResult = {
  success: boolean;
  counts: Record<string, number>;
  errors: string[];
};

// ── File System Access API ─────────────────────────────────────────────────────

type FSWritable = { write(data: string): Promise<void>; close(): Promise<void> };
type FSFileHandle = { createWritable(): Promise<FSWritable>; getFile(): Promise<File>; name: string };
type FSDirHandle = { getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>; name: string };

declare global {
  interface Window {
    showSaveFilePicker?(opts?: { suggestedName?: string; types?: Array<{ description: string; accept: Record<string, string[]> }> }): Promise<FSFileHandle>;
    showOpenFilePicker?(opts?: { types?: Array<{ description: string; accept: Record<string, string[]> }>; multiple?: boolean }): Promise<FSFileHandle[]>;
    showDirectoryPicker?(opts?: { mode?: "read" | "readwrite" }): Promise<FSDirHandle>;
  }
}

export function fsSaveSupported(): boolean {
  return typeof window?.showSaveFilePicker === "function";
}
export function fsDirSupported(): boolean {
  return typeof window?.showDirectoryPicker === "function";
}

// ── جمع البيانات ────────────────────────────────────────────────────────────────

async function collectPayload(): Promise<BackupPayload> {
  const [
    settings, rawMaterials, products, suppliers, customers,
    collections, purchases, sales, treasury, expenses,
    employees, attendance, salaryPayments, productionOrders,
    partners, profitDistributions, appUsers, qualityChecks, deliveryOrders,
  ] = await Promise.all([
    db.settings.toArray(), db.rawMaterials.toArray(), db.products.toArray(),
    db.suppliers.toArray(), db.customers.toArray(), db.collections.toArray(),
    db.purchases.toArray(), db.sales.toArray(), db.treasury.toArray(),
    db.expenses.toArray(), db.employees.toArray(), db.attendance.toArray(),
    db.salaryPayments.toArray(), db.productionOrders.toArray(),
    db.partners.toArray(), db.profitDistributions.toArray(), db.appUsers.toArray(),
    db.qualityChecks.toArray(), db.deliveryOrders.toArray(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      settings, rawMaterials, products, suppliers, customers,
      collections, purchases, sales, treasury, expenses,
      employees, attendance, salaryPayments, productionOrders,
      partners, profitDistributions, appUsers, qualityChecks, deliveryOrders,
    },
  };
}

function payloadJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

function countRecords(payload: BackupPayload): number {
  return Object.values(payload.tables).reduce(
    (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
}

function suggestedFilename(): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5).replace(":", "-");
  return `backup-${date}_${time}.json`;
}

// ── 1. حفظ داخلي في IndexedDB ──────────────────────────────────────────────────

/** يحفظ نسخة جديدة داخل قاعدة البيانات المحلية (بعيداً عن نظام الملفات) */
export async function saveLocalBackup(label = ""): Promise<LocalBackup> {
  const payload = await collectPayload();
  const json = payloadJson(payload);
  const entry: LocalBackup = {
    id: crypto.randomUUID(),
    createdAt: payload.exportedAt,
    label: label || new Date().toLocaleString("ar-EG"),
    sizeBytes: new TextEncoder().encode(json).length,
    recordCount: countRecords(payload),
    data: json,
  };
  await db.backups.add(entry);
  return entry;
}

/** يجلب كل النسخ الداخلية مرتبة من الأحدث للأقدم */
export async function listLocalBackups(): Promise<LocalBackup[]> {
  return db.backups.orderBy("createdAt").reverse().toArray();
}

/** يحذف نسخة داخلية بالـ id */
export async function deleteLocalBackup(id: string): Promise<void> {
  await db.backups.delete(id);
}

// ── 2. تصدير خارجي (فلاشة / جهاز) ────────────────────────────────────────────

/** تصدير نسخة مباشرة من البيانات الحالية إلى ملف (نافذة "حفظ باسم") */
export async function exportToFile(): Promise<string> {
  const payload = await collectPayload();
  const json = payloadJson(payload);
  const filename = suggestedFilename();

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "ملف JSON للنسخ الاحتياطي", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return handle.name;
  }

  // fallback: تنزيل عادي
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return filename;
}

/** تصدير إلى مجلد مختار (للفلاشة) */
export async function exportToDirectory(): Promise<string> {
  const payload = await collectPayload();
  const json = payloadJson(payload);
  const filename = suggestedFilename();

  if (!window.showDirectoryPicker) throw new Error("المتصفح لا يدعم اختيار المجلد");
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(json);
  await writable.close();
  return filename;
}

/** تصدير نسخة داخلية موجودة إلى ملف خارجي */
export async function exportLocalBackupToFile(backup: LocalBackup): Promise<string> {
  const filename = `backup-${backup.createdAt.slice(0, 10)}.json`;

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "ملف JSON للنسخ الاحتياطي", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(backup.data);
    await writable.close();
    return handle.name;
  }

  const blob = new Blob([backup.data], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return filename;
}

// ── 3. استيراد ─────────────────────────────────────────────────────────────────

export async function openBackupFile(): Promise<BackupPayload> {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "ملف JSON للنسخ الاحتياطي", accept: { "application/json": [".json"] } }],
    });
    const file = await handle.getFile();
    return parseFile(file);
  }
  throw new Error("USE_INPUT"); // الـ fallback يعالجه UI
}

export function parseFile(file: File): Promise<BackupPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as BackupPayload;
        if (!data.tables) reject(new Error("الملف غير صالح"));
        else resolve(data);
      } catch { reject(new Error("الملف تالف أو غير صالح")); }
    };
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsText(file, "utf-8");
  });
}

export async function applyBackup(
  payload: BackupPayload,
  mode: "merge" | "replace",
): Promise<ImportResult> {
  const errors: string[] = [];
  const counts: Record<string, number> = {};

  if (!payload.tables) return { success: false, counts: {}, errors: ["ملف غير صالح"] };

  if (mode === "replace") {
    await Promise.all([
      db.settings.clear(), db.rawMaterials.clear(), db.products.clear(),
      db.suppliers.clear(), db.customers.clear(), db.collections.clear(),
      db.purchases.clear(), db.sales.clear(), db.treasury.clear(),
      db.expenses.clear(), db.employees.clear(), db.attendance.clear(),
      db.salaryPayments.clear(), db.productionOrders.clear(),
      db.partners.clear(), db.profitDistributions.clear(),
      db.qualityChecks.clear(), db.deliveryOrders.clear(),
    ]);
  }

  const tables: Array<[string, unknown[]]> = [
    ["settings", payload.tables.settings ?? []],
    ["rawMaterials", payload.tables.rawMaterials ?? []],
    ["products", payload.tables.products ?? []],
    ["suppliers", payload.tables.suppliers ?? []],
    ["customers", payload.tables.customers ?? []],
    ["collections", payload.tables.collections ?? []],
    ["purchases", payload.tables.purchases ?? []],
    ["sales", payload.tables.sales ?? []],
    ["treasury", payload.tables.treasury ?? []],
    ["expenses", payload.tables.expenses ?? []],
    ["employees", payload.tables.employees ?? []],
    ["attendance", payload.tables.attendance ?? []],
    ["salaryPayments", payload.tables.salaryPayments ?? []],
    ["productionOrders", payload.tables.productionOrders ?? []],
    ["partners", payload.tables.partners ?? []],
    ["profitDistributions", payload.tables.profitDistributions ?? []],
    ["qualityChecks", payload.tables.qualityChecks ?? []],
    ["deliveryOrders", payload.tables.deliveryOrders ?? []],
  ];

  for (const [name, items] of tables) {
    if (!items.length) { counts[name] = 0; continue; }
    try {
      await (db as unknown as Record<string, { bulkPut(i: unknown[]): Promise<unknown> }>)[name].bulkPut(items);
      counts[name] = items.length;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      counts[name] = 0;
    }
  }

  return { success: errors.length === 0, counts, errors };
}

// ── 4. إحصاءات ─────────────────────────────────────────────────────────────────

export async function getDataStats(): Promise<Record<string, number>> {
  const [
    s, rm, pr, su, cu, co, pu, sa, tr, ex,
    em, at, sp, po, pa, pd, au, qc, do_,
  ] = await Promise.all([
    db.settings.count(), db.rawMaterials.count(), db.products.count(),
    db.suppliers.count(), db.customers.count(), db.collections.count(),
    db.purchases.count(), db.sales.count(), db.treasury.count(),
    db.expenses.count(), db.employees.count(), db.attendance.count(),
    db.salaryPayments.count(), db.productionOrders.count(),
    db.partners.count(), db.profitDistributions.count(), db.appUsers.count(),
    db.qualityChecks.count(), db.deliveryOrders.count(),
  ]);
  return {
    settings: s, rawMaterials: rm, products: pr, suppliers: su,
    customers: cu, collections: co, purchases: pu, sales: sa,
    treasury: tr, expenses: ex, employees: em, attendance: at,
    salaryPayments: sp, productionOrders: po, partners: pa,
    profitDistributions: pd, appUsers: au, qualityChecks: qc,
    deliveryOrders: do_,
  };
}

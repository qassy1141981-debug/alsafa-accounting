/**
 * النسخ الاحتياطي التلقائي — يعمل بعد كل عملية كتابة في قاعدة البيانات
 *
 * الآلية:
 * - Dexie middleware يرصد كل insert/update/delete
 * - debounce 3 ثوانٍ: يجمّع العمليات المتتالية في نسخة واحدة
 * - يحتفظ بآخر 50 نسخة تلقائية (يحذف الأقدم تلقائياً)
 * - النسخ مخزّنة في IndexedDB — مستقلة عن نظام الملفات
 */

import { db, type LocalBackup } from "./db.ts";

export const AUTO_BACKUP_MAX = 50; // أقصى عدد للنسخ التلقائية
const DEBOUNCE_MS = 3000;          // 3 ثوانٍ debounce

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isBackingUp = false;

// ── الـ debounced trigger ──────────────────────────────────────────────────────
export function triggerAutoBackup(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runAutoBackup();
  }, DEBOUNCE_MS);
}

async function runAutoBackup(): Promise<void> {
  if (isBackingUp) return;
  isBackingUp = true;
  try {
    await performAutoBackup();
  } catch (err) {
    // نسخ تلقائية صامتة — لا نُزعج المستخدم بالأخطاء
    console.error("[AutoBackup] فشل النسخ التلقائي:", err);
  } finally {
    isBackingUp = false;
  }
}

async function performAutoBackup(): Promise<void> {
  // جمع البيانات من كل الجداول
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

  const payload = {
    version: 8,
    exportedAt: new Date().toISOString(),
    tables: {
      settings, rawMaterials, products, suppliers, customers,
      collections, purchases, sales, treasury, expenses,
      employees, attendance, salaryPayments, productionOrders,
      partners, profitDistributions, appUsers, qualityChecks, deliveryOrders,
    },
  };

  const json = JSON.stringify(payload);
  const recordCount = Object.values(payload.tables).reduce(
    (s, arr) => s + arr.length, 0,
  );
  const sizeBytes = new TextEncoder().encode(json).length;

  const entry: LocalBackup = {
    id: crypto.randomUUID(),
    createdAt: payload.exportedAt,
    label: `تلقائي — ${new Date().toLocaleString("ar-EG")}`,
    sizeBytes,
    recordCount,
    data: json,
  };

  await db.backups.add(entry);

  // احتفظ بآخر 50 نسخة تلقائية فقط
  const allAuto = await db.backups
    .orderBy("createdAt")
    .filter((b) => b.label.startsWith("تلقائي"))
    .toArray();

  if (allAuto.length > AUTO_BACKUP_MAX) {
    const toDelete = allAuto
      .slice(0, allAuto.length - AUTO_BACKUP_MAX)
      .map((b) => b.id);
    await db.backups.bulkDelete(toDelete);
  }
}

// ── تسجيل Middleware في Dexie ──────────────────────────────────────────────────
export function registerAutoBackupMiddleware(): void {
  db.use({
    stack: "dbcore",
    name: "AutoBackupMiddleware",
    create(downlevelDatabase) {
      return {
        ...downlevelDatabase,
        table(tableName) {
          const downlevelTable = downlevelDatabase.table(tableName);

          // لا نراقب جدول backups نفسه (نتجنب الحلقة المفرغة)
          if (tableName === "backups") return downlevelTable;

          return {
            ...downlevelTable,
            mutate(req) {
              const result = downlevelTable.mutate(req);
              // بعد أي insert/put/delete → شغّل النسخ التلقائي
              result.then(() => {
                if (req.type === "add" || req.type === "put" || req.type === "delete" || req.type === "deleteRange") {
                  triggerAutoBackup();
                }
              }).catch(() => { /* صامت */ });
              return result;
            },
          };
        },
      };
    },
  });
}

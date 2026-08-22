/**
 * نظام الترخيص — توليد بصمة الجهاز وإدارة حالة التفعيل
 * + دعم النسخة التجريبية المحدودة بالوقت
 */

const FINGERPRINT_KEY = "app_device_fp";
const LICENSE_KEY = "app_license_code";
const TRIAL_KEY = "app_trial_start";

/** مدة التجربة المجانية بالأيام */
export const TRIAL_DAYS = 3;

/** توليد بصمة مستقرة للجهاز */
async function buildFingerprint(): Promise<string> {
  const nav = navigator;
  const parts: string[] = [
    nav.userAgent,
    nav.language,
    String(nav.hardwareConcurrency ?? ""),
    String((nav as { deviceMemory?: number }).deviceMemory ?? ""),
    String(screen.colorDepth),
    String(screen.width + "x" + screen.height),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("BrowserFingerprint🔑", 2, 2);
      parts.push(canvas.toDataURL());
    }
  } catch {
    // متجاهل إذا لم يتوفر Canvas
  }

  const raw = parts.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** الحصول على بصمة الجهاز — تُخزَّن في localStorage للثبات */
export async function getDeviceFingerprint(): Promise<string> {
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    fp = await buildFingerprint();
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}

/** حفظ كود الترخيص محلياً بعد التفعيل */
export function saveLicenseCode(code: string) {
  localStorage.setItem(LICENSE_KEY, code.trim().toUpperCase());
}

/** قراءة الكود المحفوظ */
export function getSavedLicenseCode(): string | null {
  return localStorage.getItem(LICENSE_KEY);
}

/** مسح بيانات الترخيص (للاختبار) */
export function clearLicense() {
  localStorage.removeItem(LICENSE_KEY);
  localStorage.removeItem(FINGERPRINT_KEY);
}

// ── نظام النسخة التجريبية ─────────────────────────────────────────────────

/** بدء التجربة المجانية — يُخزَّن تاريخ البدء */
export function startTrial(): void {
  if (!localStorage.getItem(TRIAL_KEY)) {
    localStorage.setItem(TRIAL_KEY, new Date().toISOString());
  }
}

/** الحصول على تاريخ بدء التجربة */
export function getTrialStartDate(): Date | null {
  const raw = localStorage.getItem(TRIAL_KEY);
  if (!raw) return null;
  return new Date(raw);
}

/** حالة التجربة */
export type TrialStatus =
  | { mode: "no-trial" }         // لم تبدأ تجربة
  | { mode: "active"; daysLeft: number; hoursLeft: number } // جارية
  | { mode: "expired" };         // منتهية

/** الحصول على حالة التجربة الحالية */
export function getTrialStatus(): TrialStatus {
  const start = getTrialStartDate();
  if (!start) return { mode: "no-trial" };

  const now = new Date();
  const msElapsed = now.getTime() - start.getTime();
  const msTotal = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = msTotal - msElapsed;

  if (msLeft <= 0) return { mode: "expired" };

  const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { mode: "active", daysLeft, hoursLeft };
}

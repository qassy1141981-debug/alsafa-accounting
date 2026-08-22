import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

// كلمة سر لوحة الإدارة — يمكن تغييرها من هنا
const ADMIN_PASSWORD = "ASmohamed@1141981";

// ── توليد كود عشوائي ─────────────────────────────────────────────────────────
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

// ── التحقق من كود الترخيص وتفعيله ───────────────────────────────────────────
/**
 * يُستدعى من العميل عند أول تشغيل أو عند كل تشغيل للتحقق.
 * - إذا كان الكود غير موجود → خطأ
 * - إذا كان معطَّلاً → خطأ
 * - إذا كان غير مُفعَّل (unused) → يُفعَّل ويُسجَّل بصمة الجهاز
 * - إذا كان مُفعَّلاً → يُتحقق أن بصمة الجهاز تطابق المسجَّلة
 */
export const activateOrVerify = mutation({
  args: {
    code: v.string(),
    deviceFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.trim().toUpperCase();

    const license = await ctx.db
      .query("licenses")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();

    if (!license) {
      throw new ConvexError({ code: "NOT_FOUND", message: "كود الترخيص غير صحيح" });
    }

    if (license.status === "disabled") {
      throw new ConvexError({ code: "FORBIDDEN", message: "هذا الترخيص مُعطَّل. تواصل مع الدعم الفني." });
    }

    if (license.status === "unused") {
      // أول تفعيل — نربط الكود بهذا الجهاز
      await ctx.db.patch(license._id, {
        status: "active",
        deviceFingerprint: args.deviceFingerprint,
        activatedAt: new Date().toISOString(),
      });
      return { success: true, firstActivation: true };
    }

    // الكود مُفعَّل مسبقاً — نتحقق من بصمة الجهاز
    if (license.deviceFingerprint !== args.deviceFingerprint) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "هذا الترخيص مرتبط بجهاز آخر. لا يمكن استخدامه على هذا الجهاز.",
      });
    }

    return { success: true, firstActivation: false };
  },
});

// ── إدارة الأكواد (محمية بكلمة سر) ──────────────────────────────────────────

export const adminCreateLicense = mutation({
  args: {
    password: v.string(),
    clientName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.password !== ADMIN_PASSWORD) {
      throw new ConvexError({ code: "FORBIDDEN", message: "كلمة السر غير صحيحة" });
    }
    const code = generateCode();
    await ctx.db.insert("licenses", {
      code,
      clientName: args.clientName,
      notes: args.notes,
      status: "unused",
    });
    return { code };
  },
});

export const adminListLicenses = query({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    // Return null instead of throwing so the React component can handle it gracefully
    if (args.password !== ADMIN_PASSWORD) {
      return null;
    }
    return await ctx.db.query("licenses").order("desc").collect();
  },
});

export const adminToggleLicense = mutation({
  args: {
    password: v.string(),
    licenseId: v.id("licenses"),
    disabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.password !== ADMIN_PASSWORD) {
      throw new ConvexError({ code: "FORBIDDEN", message: "كلمة السر غير صحيحة" });
    }
    const license = await ctx.db.get(args.licenseId);
    if (!license) throw new ConvexError({ code: "NOT_FOUND", message: "الترخيص غير موجود" });

    if (args.disabled) {
      await ctx.db.patch(args.licenseId, { status: "disabled" });
    } else {
      // إعادة تفعيل: نعيده إلى unused لتسمح بتفعيله على جهاز جديد
      await ctx.db.patch(args.licenseId, {
        status: "unused",
        deviceFingerprint: undefined,
        activatedAt: undefined,
      });
    }
    return { success: true };
  },
});

export const adminDeleteLicense = mutation({
  args: {
    password: v.string(),
    licenseId: v.id("licenses"),
  },
  handler: async (ctx, args) => {
    if (args.password !== ADMIN_PASSWORD) {
      throw new ConvexError({ code: "FORBIDDEN", message: "كلمة السر غير صحيحة" });
    }
    await ctx.db.delete(args.licenseId);
    return { success: true };
  },
});

export const adminUpdateLicense = mutation({
  args: {
    password: v.string(),
    licenseId: v.id("licenses"),
    clientName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.password !== ADMIN_PASSWORD) {
      throw new ConvexError({ code: "FORBIDDEN", message: "كلمة السر غير صحيحة" });
    }
    await ctx.db.patch(args.licenseId, {
      clientName: args.clientName,
      notes: args.notes,
    });
    return { success: true };
  },
});

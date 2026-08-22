import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // جدول أكواد الترخيص
  licenses: defineTable({
    code: v.string(),             // كود الترخيص (مثل: XXXX-XXXX-XXXX)
    clientName: v.optional(v.string()), // اسم العميل
    deviceFingerprint: v.optional(v.string()), // بصمة الجهاز بعد التفعيل
    activatedAt: v.optional(v.string()), // تاريخ التفعيل
    status: v.union(
      v.literal("active"),    // مُفعَّل ومرتبط بجهاز
      v.literal("unused"),    // لم يُستخدم بعد
      v.literal("disabled"),  // مُعطَّل من قِبَل المسؤول
    ),
    notes: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),
});

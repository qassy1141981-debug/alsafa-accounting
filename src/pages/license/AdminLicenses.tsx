import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import {
  Plus,
  Copy,
  Ban,
  RotateCcw,
  Trash2,
  ShieldCheck,
  Lock,
  KeyRound,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  unused:   { label: "غير مُفعَّل",  variant: "secondary" },
  active:   { label: "مُفعَّل",       variant: "default" },
  disabled: { label: "مُعطَّل",       variant: "destructive" },
};

export default function AdminLicenses() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const licenses = useQuery(
    api.licenses.adminListLicenses,
    authed ? { password } : "skip",
  );

  const createLicense   = useMutation(api.licenses.adminCreateLicense);
  const toggleLicense   = useMutation(api.licenses.adminToggleLicense);
  const deleteLicense   = useMutation(api.licenses.adminDeleteLicense);

  const handleLogin = () => {
    setPassword(pwInput);
    setAuthed(true);
  };

  // If query returned null, the password is wrong — reset
  if (authed && licenses === null) {
    setAuthed(false);
    setPassword("");
    toast.error("كلمة السر غير صحيحة");
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createLicense({
        password,
        clientName: newClientName.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      setCreatedCode(res.code);
      setNewClientName("");
      setNewNotes("");
      toast.success("تم إنشاء كود الترخيص بنجاح");
    } catch (err) {
      handleErr(err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (licenseId: Id<"licenses">, disable: boolean) => {
    try {
      await toggleLicense({ password, licenseId, disabled: disable });
      toast.success(disable ? "تم تعطيل الترخيص" : "تمت إعادة التفعيل");
    } catch (err) {
      handleErr(err);
    }
  };

  const handleDelete = async (licenseId: Id<"licenses">) => {
    if (!confirm("هل تريد حذف هذا الترخيص نهائياً؟")) return;
    try {
      await deleteLicense({ password, licenseId });
      toast.success("تم الحذف");
    } catch (err) {
      handleErr(err);
    }
  };

  const handleErr = (err: unknown) => {
    if (err instanceof ConvexError) {
      const { message } = err.data as { code: string; message: string };
      toast.error(message);
      if (message.includes("كلمة السر")) setAuthed(false);
    } else {
      toast.error("حدث خطأ");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم النسخ");
  };

  // ── شاشة الدخول ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, #1e2a4a 0%, #2d3f6b 50%, #1a2440 100%)" }}
        dir="rtl"
      >
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-[#1e2a4a] text-white p-6 text-center">
            <Lock className="w-10 h-10 mx-auto mb-2 text-blue-200" />
            <h1 className="text-xl font-bold">لوحة إدارة التراخيص</h1>
            <p className="text-blue-300 text-xs mt-1">للمشرف فقط</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[#1e2a4a] font-semibold">كلمة السر</Label>
              <Input
                type="password"
                placeholder="أدخل كلمة السر"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="text-right"
                dir="rtl"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={!pwInput}
              className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white font-bold rounded-xl"
            >
              دخول
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── لوحة الإدارة ─────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{ background: "linear-gradient(135deg, #1e2a4a 0%, #2d3f6b 50%, #1a2440 100%)" }}
      dir="rtl"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-blue-300" />
              لوحة إدارة التراخيص
            </h1>
            <p className="text-blue-300 text-sm mt-1">إنشاء وإدارة أكواد الترخيص</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAuthed(false)}
            className="text-xs"
          >
            خروج
          </Button>
        </div>

        {/* بطاقة إنشاء كود جديد */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <h2 className="font-bold text-[#1e2a4a] flex items-center gap-2">
            <Plus className="w-5 h-5" />
            إنشاء كود ترخيص جديد
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">اسم العميل (اختياري)</Label>
              <Input
                placeholder="مثال: شركة النور"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="text-right"
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">ملاحظات (اختياري)</Label>
              <Input
                placeholder="مثال: فاتورة رقم 123"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="text-right"
                dir="rtl"
              />
            </div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white font-bold px-6"
          >
            <Plus className="w-4 h-4 ml-1" />
            {creating ? "جارٍ الإنشاء..." : "إنشاء كود جديد"}
          </Button>
        </div>

        {/* قائمة التراخيص */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-[#1e2a4a] flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              أكواد الترخيص ({licenses?.length ?? "..."})
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!licenses ? (
              <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>
            ) : licenses.length === 0 ? (
              <div className="p-8 text-center text-gray-400">لا توجد أكواد بعد. أنشئ أول كود أعلاه.</div>
            ) : (
              licenses.map((lic) => {
                const st = STATUS_LABELS[lic.status] ?? STATUS_LABELS["unused"];
                return (
                  <div key={lic._id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      {/* كود الترخيص */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-lg font-bold text-[#1e2a4a] tracking-widest">
                            {lic.code}
                          </span>
                          <button
                            onClick={() => copyCode(lic.code)}
                            className="text-gray-400 hover:text-[#1e2a4a] transition-colors cursor-pointer"
                            title="نسخ"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </div>
                        <div className="text-sm text-gray-500 mt-1 space-x-3 space-x-reverse flex flex-wrap gap-x-4 gap-y-1">
                          {lic.clientName && <span>العميل: <strong>{lic.clientName}</strong></span>}
                          {lic.notes && <span>ملاحظة: {lic.notes}</span>}
                          {lic.activatedAt && (
                            <span>تفعيل: {new Date(lic.activatedAt).toLocaleDateString("ar-EG")}</span>
                          )}
                          {lic.deviceFingerprint && (
                            <span className="text-xs text-gray-400 font-mono truncate max-w-[180px]" title={lic.deviceFingerprint}>
                              الجهاز: {lic.deviceFingerprint.slice(0, 12)}…
                            </span>
                          )}
                        </div>
                      </div>
                      {/* أزرار */}
                      <div className="flex items-center gap-2 shrink-0">
                        {lic.status !== "disabled" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleToggle(lic._id, true)}
                            title="تعطيل"
                          >
                            <Ban className="w-4 h-4 ml-1" />
                            تعطيل
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleToggle(lic._id, false)}
                            title="إعادة تفعيل"
                          >
                            <RotateCcw className="w-4 h-4 ml-1" />
                            إعادة تفعيل
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(lic._id)}
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* نافذة عرض الكود المُنشأ */}
      <Dialog open={!!createdCode} onOpenChange={() => setCreatedCode(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-[#1e2a4a] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              تم إنشاء كود الترخيص
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-gray-500">أرسل هذا الكود إلى العميل</p>
            <div className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-[#1e2a4a]/30">
              <p className="font-mono text-2xl font-bold text-[#1e2a4a] tracking-widest">
                {createdCode}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => { copyCode(createdCode ?? ""); }}
              className="bg-[#1e2a4a] text-white"
            >
              <Copy className="w-4 h-4 ml-2" />
              نسخ الكود
            </Button>
            <Button variant="secondary" onClick={() => setCreatedCode(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

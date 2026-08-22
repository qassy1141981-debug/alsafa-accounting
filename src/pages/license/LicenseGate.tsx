import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, Loader2, PlayCircle } from "lucide-react";
import { getDeviceFingerprint, saveLicenseCode, startTrial, TRIAL_DAYS } from "@/lib/license.ts";

interface Props {
  onActivated: () => void;
  onTrialStarted: () => void;
}

export default function LicenseGate({ onActivated, onTrialStarted }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"choice" | "license">("choice");
  const activateOrVerify = useMutation(api.licenses.activateOrVerify);

  const handleFormatCode = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const parts = [];
    for (let i = 0; i < clean.length && i < 16; i += 4) {
      parts.push(clean.slice(i, i + 4));
    }
    setCode(parts.join("-"));
  };

  const handleActivate = async () => {
    if (code.replace(/-/g, "").length < 16) {
      toast.error("أدخل الكود كاملاً (16 حرف)");
      return;
    }
    setLoading(true);
    try {
      const fp = await getDeviceFingerprint();
      const result = await activateOrVerify({ code, deviceFingerprint: fp });
      saveLicenseCode(code);
      if (result.firstActivation) {
        toast.success("تم تفعيل الترخيص بنجاح! مرحباً بك.");
      } else {
        toast.success("تم التحقق من الترخيص.");
      }
      onActivated();
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("تعذّر الاتصال بالسيرفر. تحقق من الإنترنت.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrial = () => {
    startTrial();
    toast.success(`بدأت التجربة المجانية! لديك ${TRIAL_DAYS} يوماً لاستكشاف البرنامج.`);
    onTrialStarted();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1e2a4a 0%, #2d3f6b 50%, #1a2440 100%)" }}
      dir="rtl"
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* رأس */}
          <div className="bg-[#1e2a4a] text-white p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden shadow-lg shadow-black/30 border-2 border-white/20">
              <img src={`${import.meta.env.BASE_URL}icon/icon-192.png`} alt="شعار التطبيق" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold mb-1">النظام المحاسبي المتكامل</h1>
            <p className="text-blue-200 text-sm">v2.0</p>
          </div>

          <div className="p-8 space-y-6">
            {view === "choice" ? (
              /* شاشة الاختيار: تجربة أو ترخيص */
              <>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-bold text-[#1e2a4a]">مرحباً بك</h2>
                  <p className="text-sm text-gray-500">اختر طريقة البدء</p>
                </div>

                {/* بطاقة التجربة المجانية */}
                <div className="border-2 border-amber-400 rounded-xl p-5 space-y-3 bg-amber-50">
                  <div className="flex items-center gap-2 text-amber-700 font-bold">
                    <PlayCircle className="w-5 h-5" />
                    <span>جرّب مجاناً لمدة {TRIAL_DAYS} يوماً</span>
                  </div>
                  <p className="text-xs text-amber-600 leading-relaxed">
                    استخدم البرنامج كاملاً بدون قيود لمدة {TRIAL_DAYS} يوماً.
                    بعد انتهاء المدة سيُغلق البرنامج ويتطلب ترخيصاً للمواصلة.
                  </p>
                  <Button
                    onClick={handleStartTrial}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg"
                  >
                    ابدأ التجربة المجانية
                  </Button>
                </div>

                {/* فاصل */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">أو</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* زر الترخيص */}
                <Button
                  onClick={() => setView("license")}
                  variant="secondary"
                  className="w-full font-semibold rounded-xl"
                >
                  <KeyRound className="w-4 h-4 ml-2" />
                  لدي كود ترخيص
                </Button>
              </>
            ) : (
              /* شاشة إدخال الترخيص */
              <>
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-2">
                    <ShieldCheck className="w-7 h-7 text-[#1e2a4a]" />
                  </div>
                  <h2 className="text-xl font-bold text-[#1e2a4a]">تفعيل الترخيص</h2>
                  <p className="text-sm text-gray-500">
                    أدخل كود الترخيص الخاص بك للمتابعة.
                    <br />
                    كل كود صالح لجهاز واحد فقط.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#1e2a4a] font-semibold flex items-center gap-1">
                    <KeyRound className="w-4 h-4" />
                    كود الترخيص
                  </Label>
                  <Input
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={code}
                    onChange={(e) => handleFormatCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                    className="text-center text-lg font-mono tracking-widest border-2 border-gray-200 focus:border-[#1e2a4a]"
                    dir="ltr"
                    maxLength={19}
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <Button
                  onClick={handleActivate}
                  disabled={loading || code.replace(/-/g, "").length < 16}
                  className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white py-3 text-base font-bold rounded-xl"
                >
                  {loading ? (
                    <span className="flex items-center gap-2 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جارٍ التحقق...
                    </span>
                  ) : (
                    "تفعيل البرنامج"
                  )}
                </Button>

                <button
                  onClick={() => setView("choice")}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  رجوع
                </button>
              </>
            )}
          </div>

          {/* زر الإدارة السري */}
          <div className="border-t border-gray-100 px-8 py-3 flex justify-end">
            <button
              onClick={() => window.location.href = "/admin/licenses"}
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors cursor-pointer select-none"
              title="لوحة الإدارة"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              إدارة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

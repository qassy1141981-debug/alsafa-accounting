import { useState, useEffect } from "react";
import { db, type AppUser } from "@/lib/db.ts";
import { hashPassword, setSession, type Session } from "@/lib/auth.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { ShieldCheck, User, Lock, Eye, EyeOff, Loader2, Info } from "lucide-react";

interface Props {
  onLogin: (session: Session) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [firstRun, setFirstRun] = useState(false);

  // عند أول تشغيل: أنشئ مستخدم admin افتراضي
  useEffect(() => {
    const init = async () => {
      const count = await db.appUsers.count();
      if (count === 0) {
        const defaultAdmin: AppUser = {
          id: crypto.randomUUID(),
          username: "admin",
          name: "المدير",
          passwordHash: await hashPassword("admin123"),
          role: "admin",
          active: true,
          createdAt: new Date().toISOString(),
        };
        await db.appUsers.add(defaultAdmin);
        setFirstRun(true);
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const uname = username.toLowerCase().trim();
    if (!uname || !password) {
      setError("أدخل اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    try {
      const user = await db.appUsers.where("username").equals(uname).first();
      if (!user || !user.active) {
        setError("اسم المستخدم غير موجود أو الحساب معطّل");
        setLoading(false);
        return;
      }
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) {
        setError("كلمة المرور غير صحيحة");
        setLoading(false);
        return;
      }
      await db.appUsers.update(user.id, { lastLogin: new Date().toISOString() });
      const session: Session = {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      };
      setSession(session);
      toast.success(`مرحباً ${user.name}`);
      onLogin(session);
    } catch {
      setError("حدث خطأ أثناء تسجيل الدخول");
      setLoading(false);
    }
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
            <p className="text-blue-200 text-sm">تسجيل الدخول</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-1">
                <ShieldCheck className="w-7 h-7 text-[#1e2a4a]" />
              </div>
              <h2 className="text-xl font-bold text-[#1e2a4a]">أهلاً بك</h2>
              <p className="text-sm text-gray-500">أدخل بيانات الدخول للمتابعة</p>
            </div>

            {/* رسالة أول تشغيل */}
            {firstRun && (
              <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 leading-relaxed">
                  تم إنشاء مستخدم افتراضي:
                  <br />
                  اسم المستخدم: <strong className="font-mono">admin</strong> — كلمة المرور:{" "}
                  <strong className="font-mono">admin123</strong>
                  <br />
                  يُرجى تغيير كلمة المرور من الإعدادات بعد الدخول.
                </div>
              </div>
            )}

            {/* اسم المستخدم */}
            <div className="space-y-2">
              <Label className="text-[#1e2a4a] font-semibold flex items-center gap-1">
                <User className="w-4 h-4" /> اسم المستخدم
              </Label>
              <Input
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-2 border-gray-200 focus:border-[#1e2a4a]"
                dir="ltr"
                disabled={loading}
                autoFocus
              />
            </div>

            {/* كلمة المرور */}
            <div className="space-y-2">
              <Label className="text-[#1e2a4a] font-semibold flex items-center gap-1">
                <Lock className="w-4 h-4" /> كلمة المرور
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-2 border-gray-200 focus:border-[#1e2a4a] pl-10"
                  dir="ltr"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* خطأ */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white py-3 text-base font-bold rounded-xl"
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> جارٍ الدخول...
                </span>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

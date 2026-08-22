import { useState } from "react";
import { db } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

interface Props {
  onComplete: () => void;
}

export default function CompanySetup({ onComplete }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setLogoBase64(result);
      setLogoPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error("اسم الشركة مطلوب");
      return;
    }
    setSaving(true);
    try {
      await db.settings.put({
        id: "company",
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim(),
        companyPhone: companyPhone.trim(),
        companyLogo: logoBase64,
        currency: "ج.م",
      });
      onComplete();
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1e2a4a 0%, #2d3f6b 50%, #1a2440 100%)" }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#1e2a4a] text-white p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden shadow-lg shadow-black/30 border-2 border-white/20">
            <img src={`${import.meta.env.BASE_URL}icon/icon-192.png`} alt="شعار التطبيق" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold mb-1">مرحباً بك</h1>
          <p className="text-blue-200 text-sm">النظام المحاسبي المتكامل v2.0</p>
          <p className="text-blue-300 text-xs mt-2">أدخل بيانات شركتك للبدء</p>
        </div>

        {/* Form */}
        <div className="p-8 space-y-5">
          <div className="space-y-2">
            <Label className="text-[#1e2a4a] font-semibold">
              اسم الشركة <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="مثال: شركة النور للمنظفات"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="text-right"
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#1e2a4a] font-semibold">العنوان</Label>
            <Input
              placeholder="مثال: القاهرة، شارع الجمهورية"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="text-right"
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#1e2a4a] font-semibold">رقم الهاتف</Label>
            <Input
              placeholder="01xxxxxxxxx"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              className="text-right"
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#1e2a4a] font-semibold">شعار الشركة</Label>
            <div className="flex items-center gap-3">
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="شعار الشركة"
                  className="w-16 h-16 object-contain rounded-lg border border-gray-200"
                />
              )}
              <label className="flex-1 cursor-pointer">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                  {logoPreview ? "تغيير الشعار" : "اختر صورة الشعار"}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </label>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !companyName.trim()}
            className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white py-3 text-base font-bold rounded-xl"
          >
            {saving ? "جارٍ الحفظ..." : "ابدأ الاستخدام"}
          </Button>
        </div>
      </div>
    </div>
  );
}

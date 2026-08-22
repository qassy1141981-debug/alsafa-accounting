import { useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install.ts";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export function PwaInstallBanner() {
  const { installPrompt, isInstalled, isIos, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  // لا تعرض داخل الـ iframe (App Builder)
  if (window.self !== window.top) return null;
  if (isInstalled || dismissed) return null;
  if (!installPrompt && !isIos) return null;

  return (
    <>
      {/* البانر */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
          bg-[#1e2a4a] text-white rounded-2xl shadow-2xl border border-white/10
          flex items-center gap-3 px-4 py-3"
        dir="rtl"
      >
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">ثبّت التطبيق</p>
          <p className="text-xs text-white/70 mt-0.5">يعمل بدون إنترنت على جهازك</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isIos ? (
            <Button
              size="sm"
              className="bg-white text-[#1e2a4a] hover:bg-white/90 text-xs font-bold h-8 px-3"
              onClick={() => setShowIosGuide(true)}
            >
              كيف؟
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-white text-[#1e2a4a] hover:bg-white/90 text-xs font-bold h-8 px-3"
              onClick={install}
            >
              <Download className="w-3.5 h-3.5 ml-1" />
              تثبيت
            </Button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* دليل iOS */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#1e2a4a] text-lg">تثبيت على iPhone/iPad</h3>
              <button onClick={() => setShowIosGuide(false)} className="text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="bg-[#1e2a4a] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <span>اضغط على زر <strong>المشاركة</strong> (□↑) في شريط Safari السفلي</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-[#1e2a4a] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <span>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-[#1e2a4a] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <span>اضغط <strong>إضافة</strong> — سيظهر التطبيق على شاشتك</span>
              </li>
            </ol>
            <Button
              className="w-full bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"
              onClick={() => setShowIosGuide(false)}
            >
              فهمت
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

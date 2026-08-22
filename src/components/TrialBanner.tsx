import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { getTrialStatus, type TrialStatus } from "@/lib/license.ts";

/**
 * شريط تنبيه يظهر في أعلى الشاشة خلال فترة التجربة المجانية
 * يحدث كل دقيقة ويختفي إذا أغلقه المستخدم مؤقتاً
 */
export default function TrialBanner() {
  const [status, setStatus] = useState<TrialStatus>(getTrialStatus());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getTrialStatus());
    }, 60 * 1000); // تحديث كل دقيقة
    return () => clearInterval(interval);
  }, []);

  // لا نعرض الشريط إذا لا توجد تجربة أو منتهية أو أُغلق
  if (status.mode !== "active" || dismissed) return null;

  const { daysLeft, hoursLeft } = status;

  const isUrgent = daysLeft <= 2;

  return (
    <div
      dir="rtl"
      className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
        isUrgent
          ? "bg-red-600 text-white"
          : "bg-amber-500 text-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          {isUrgent
            ? `تنبيه: تنتهي فترة التجربة المجانية خلال ${daysLeft > 0 ? `${daysLeft} يوم` : `${hoursLeft} ساعة`} — شارف البرنامج على الإغلاق!`
            : `النسخة التجريبية — متبقي ${daysLeft} يوم و ${hoursLeft} ساعة من أصل 14 يوماً`}
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer shrink-0"
        title="إخفاء"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

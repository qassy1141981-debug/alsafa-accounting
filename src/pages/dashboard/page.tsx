import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import {
  TrendingUp,
  TrendingDown,
  Vault,
  Package,
  ShoppingBag,
  Receipt,
  BadgeDollarSign,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: color + "20" }}
          >
            <Icon className="w-6 h-6" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";
  const today = new Date().toISOString().slice(0, 10);

  // مبيعات اليوم
  const todaySales = useLiveQuery(async () => {
    const sales = await db.sales.filter((s) => s.date.startsWith(today)).toArray();
    return sales.reduce((sum, s) => sum + s.netAmount, 0);
  }, [today]);

  // ربح اليوم = فارق سعر البيع عن التكلفة
  const todayProfit = useLiveQuery(async () => {
    const sales = await db.sales.filter((s) => s.date.startsWith(today)).toArray();
    const products = await db.products.toArray();
    const pMap = new Map(products.map((p) => [p.id, p]));
    let profit = 0;
    for (const sale of sales) {
      let cost = 0;
      for (const item of sale.items) {
        cost += (pMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
      }
      profit += sale.netAmount - cost;
    }
    return profit;
  }, [today]);

  // مشتريات اليوم (للمعلومية فقط)
  const todayPurchases = useLiveQuery(async () => {
    const purchases = await db.purchases.filter((p) => p.date.startsWith(today)).toArray();
    return purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  }, [today]);

  const treasuryBalance = useLiveQuery(async () => {
    const all = await db.treasury.toArray();
    return all.reduce((sum, e) => (e.type === "in" ? sum + e.amount : sum - e.amount), 0);
  });

  const productCount = useLiveQuery(() => db.products.count());
  const rawMatCount = useLiveQuery(() => db.rawMaterials.count());

  // إجمالي المبيعات الكلي
  const totalSales = useLiveQuery(async () => {
    const all = await db.sales.toArray();
    return all.reduce((sum, s) => sum + s.netAmount, 0);
  });

  // إجمالي الربح الكلي = مجموع (بيع - تكلفة) لكل فاتورة
  const totalProfit = useLiveQuery(async () => {
    const sales = await db.sales.toArray();
    const products = await db.products.toArray();
    const pMap = new Map(products.map((p) => [p.id, p]));
    let profit = 0;
    for (const sale of sales) {
      let cost = 0;
      for (const item of sale.items) {
        cost += (pMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
      }
      profit += sale.netAmount - cost;
    }
    return profit;
  });

  // إجمالي التكلفة الكلي
  const totalCost = useLiveQuery(async () => {
    const sales = await db.sales.toArray();
    const products = await db.products.toArray();
    const pMap = new Map(products.map((p) => [p.id, p]));
    let cost = 0;
    for (const sale of sales) {
      for (const item of sale.items) {
        cost += (pMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
      }
    }
    return cost;
  });

  const totalPurchases = useLiveQuery(async () => {
    const all = await db.purchases.toArray();
    return all.reduce((sum, p) => sum + p.totalAmount, 0);
  });

  const recentSales = useLiveQuery(() =>
    db.sales.orderBy("date").reverse().limit(5).toArray(),
  );

  const fmt = (n: number | undefined) =>
    n !== undefined ? `${n.toLocaleString("ar-EG")} ${currency}` : "...";

  const profitColor = (n: number | undefined) =>
    n === undefined ? "text-foreground" : n >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400";

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* إحصائيات اليوم */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">إحصائيات اليوم</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="مبيعات اليوم" value={fmt(todaySales)} icon={TrendingUp} color="#22c55e" />
          <StatCard title="ربح اليوم" value={fmt(todayProfit)} icon={BadgeDollarSign} color="#3b82f6"
            sub="بيع − تكلفة" />
          <StatCard title="رصيد الخزنة" value={fmt(treasuryBalance)} icon={Vault} color="#8b5cf6" />
          <StatCard title="أصناف المخازن" value={`${(productCount ?? 0) + (rawMatCount ?? 0)} صنف`} icon={Package} color="#f97316"
            sub={`${productCount ?? 0} منتج + ${rawMatCount ?? 0} مادة`} />
        </div>
      </div>

      {/* ملخص إجمالي */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">ملخص إجمالي</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <Card className="border-0 shadow-md bg-green-50 dark:bg-green-900/20">
            <CardContent className="p-5 flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{fmt(totalSales)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-slate-50 dark:bg-slate-900/20">
            <CardContent className="p-5 flex items-center gap-4">
              <Receipt className="w-8 h-8 text-slate-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">إجمالي التكلفة</p>
                <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{fmt(totalCost)}</p>
                <p className="text-xs text-muted-foreground">تكلفة الأصناف المباعة</p>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-0 shadow-md ${(totalProfit ?? 0) >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
            <CardContent className="p-5 flex items-center gap-4">
              <BadgeDollarSign className={`w-8 h-8 flex-shrink-0 ${(totalProfit ?? 0) >= 0 ? "text-blue-600" : "text-red-600"}`} />
              <div>
                <p className="text-sm text-muted-foreground">صافي الربح الإجمالي</p>
                <p className={`text-xl font-bold ${profitColor(totalProfit)}`}>{fmt(totalProfit)}</p>
                <p className="text-xs text-muted-foreground">مبيعات − تكلفة الأصناف</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-orange-50 dark:bg-orange-900/20">
            <CardContent className="p-5 flex items-center gap-4">
              <ShoppingBag className="w-8 h-8 text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المشتريات</p>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{fmt(totalPurchases)}</p>
                <p className="text-xs text-muted-foreground">للمعلومية — لا تؤثر على الربح</p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* آخر المبيعات */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">آخر المبيعات</h2>
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            {!recentSales || recentSales.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">لا توجد مبيعات بعد</div>
            ) : (
              <div className="divide-y">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="font-medium text-sm">{sale.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{sale.customerName}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-green-600">{sale.netAmount.toLocaleString("ar-EG")} {currency}</p>
                      <p className="text-xs text-muted-foreground">{new Date(sale.date).toLocaleDateString("ar-EG")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

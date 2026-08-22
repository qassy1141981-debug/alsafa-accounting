import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Printer, BarChart3, Users, Truck, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

type ReportTab = "period" | "daily-profit" | "margin" | "customer-debts" | "supplier-debts" | "top-customers";

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>("period");
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [debtDialogType, setDebtDialogType] = useState<"customers" | "suppliers" | null>(null);
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const allSales = useLiveQuery(() => db.sales.orderBy("date").toArray(), []);
  const allPurchases = useLiveQuery(() => db.purchases.orderBy("date").toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);

  const from = new Date(fromDate).toISOString();
  const to = new Date(toDate + "T23:59:59").toISOString();

  const periodSales = allSales?.filter((s) => s.date >= from && s.date <= to) ?? [];
  const periodPurchases = allPurchases?.filter((p) => p.date >= from && p.date <= to) ?? [];

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const calcProfit = (sales: typeof periodSales) => {
    let revenue = 0;
    let cost = 0;
    for (const sale of sales) {
      revenue += sale.netAmount;
      for (const item of sale.items) {
        cost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
      }
    }
    return { revenue, cost, profit: revenue - cost };
  };

  const { revenue: totalSales, cost: totalCost, profit: netProfit } = calcProfit(periodSales);
  const totalPurchases = periodPurchases.reduce((s, r) => s + r.totalAmount, 0);

  // بيانات الربح اليومي
  const dailyMap = new Map<string, { revenue: number; cost: number }>();
  for (const sale of periodSales) {
    const d = sale.date.slice(0, 10);
    const prev = dailyMap.get(d) ?? { revenue: 0, cost: 0 };
    let saleCost = 0;
    for (const item of sale.items) {
      saleCost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
    }
    dailyMap.set(d, { revenue: prev.revenue + sale.netAmount, cost: prev.cost + saleCost });
  }
  const dailyData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5),
      revenue: v.revenue,
      cost: v.cost,
      profit: v.revenue - v.cost,
    }));

  // هامش الربح لكل منتج
  const marginData = (products ?? []).map((p) => {
    const margin = p.price && p.costPrice && p.price > 0
      ? ((p.price - p.costPrice) / p.price * 100)
      : 0;
    const profitPerUnit = (p.price ?? 0) - (p.costPrice ?? 0);
    return { name: p.name, margin: Number(margin.toFixed(1)), price: p.price ?? 0, costPrice: p.costPrice ?? 0, profitPerUnit };
  }).sort((a, b) => b.margin - a.margin);

  // ── ديون العملاء ──
  const debtedCustomers = (customers ?? []).filter((c) => c.balance > 0);
  const totalCustomerDebt = debtedCustomers.reduce((s, c) => s + c.balance, 0);

  // ── ديون الموردين ──
  const debtedSuppliers = (allPurchases ?? [])
    .filter((p) => p.remainingAmount > 0)
    .reduce((acc, p) => {
      const key = p.supplierId ?? p.supplierName ?? "غير محدد";
      const name = p.supplierName ?? "غير محدد";
      if (!acc.has(key)) acc.set(key, { id: key, name, total: 0 });
      acc.get(key)!.total += p.remainingAmount;
      return acc;
    }, new Map<string, { id: string; name: string; total: number }>());
  const supplierDebtList = Array.from(debtedSuppliers.values()).sort((a, b) => b.total - a.total);
  const totalSupplierDebt = supplierDebtList.reduce((s, d) => s + d.total, 0);

  // ── أعلى العملاء مسحوبات (خلال الفترة) ──
  const customerPurchaseMap = new Map<string, { name: string; revenue: number; cost: number; invoiceCount: number }>();
  for (const sale of periodSales) {
    const key = sale.customerId ?? sale.customerName;
    const prev = customerPurchaseMap.get(key) ?? { name: sale.customerName, revenue: 0, cost: 0, invoiceCount: 0 };
    let saleCost = 0;
    for (const item of sale.items) {
      saleCost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
    }
    customerPurchaseMap.set(key, {
      name: sale.customerName,
      revenue: prev.revenue + sale.netAmount,
      cost: prev.cost + saleCost,
      invoiceCount: prev.invoiceCount + 1,
    });
  }
  const topCustomers = Array.from(customerPurchaseMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8"><title>تقرير الربح</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body{font-family:'Cairo',sans-serif;padding:20px}
          table{width:100%;border-collapse:collapse;margin-top:15px}
          th,td{border:1px solid #ddd;padding:8px;text-align:right}
          th{background:#1e2a4a;color:white}
          .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #1e2a4a;padding-bottom:10px}
          .info-box{background:#f0f4f8;border-radius:8px;padding:12px;margin:8px 0}
          .footer{margin-top:30px;text-align:center;color:#666;font-size:12px}
        </style>
      </head><body>
        <div class="header">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height:60px"><br>` : ""}
          <h2>${settings?.companyName ?? "الشركة"}</h2>
          <h3>تقرير الأرباح — من ${fromDate} إلى ${toDate}</h3>
        </div>
        <div class="info-box">
          <p>💰 إجمالي المبيعات: <strong>${totalSales.toLocaleString("ar-EG")} ${currency}</strong></p>
          <p>📦 إجمالي التكلفة: <strong>${totalCost.toLocaleString("ar-EG")} ${currency}</strong></p>
          <p>✅ صافي الربح: <strong style="color:${netProfit >= 0 ? "green" : "red"}">${netProfit.toLocaleString("ar-EG")} ${currency}</strong></p>
        </div>
        <table>
          <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإيراد</th><th>التكلفة</th><th>الربح</th></tr>
          ${periodSales.map((s) => {
            let sCost = 0;
            for (const item of s.items) sCost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
            const sProfit = s.netAmount - sCost;
            return `<tr>
              <td>${s.invoiceNumber}</td><td>${new Date(s.date).toLocaleDateString("ar-EG")}</td>
              <td>${s.customerName}</td><td>${s.netAmount.toLocaleString("ar-EG")} ${currency}</td>
              <td>${sCost.toLocaleString("ar-EG")} ${currency}</td>
              <td style="color:${sProfit >= 0 ? "green" : "red"};font-weight:bold">${sProfit.toLocaleString("ar-EG")} ${currency}</td>
            </tr>`;
          }).join("")}
        </table>
        <div class="footer">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const printTopCustomers = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8"><title>تقرير أعلى العملاء مسحوبات</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body{font-family:'Cairo',sans-serif;padding:20px}
          table{width:100%;border-collapse:collapse;margin-top:15px}
          th,td{border:1px solid #ddd;padding:8px;text-align:right}
          th{background:#1e2a4a;color:white}
          .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #1e2a4a;padding-bottom:10px}
          .footer{margin-top:30px;text-align:center;color:#666;font-size:12px}
        </style>
      </head><body>
        <div class="header">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height:60px"><br>` : ""}
          <h2>${settings?.companyName ?? "الشركة"}</h2>
          <h3>أعلى العملاء مسحوبات — من ${fromDate} إلى ${toDate}</h3>
        </div>
        <table>
          <tr><th>#</th><th>اسم العميل</th><th>عدد الفواتير</th><th>إجمالي المسحوبات</th><th>التكلفة</th><th>ربح الشركة</th><th>نسبة الربح</th></tr>
          ${topCustomers.map((c, i) => {
            const profit = c.revenue - c.cost;
            const margin = c.revenue > 0 ? (profit / c.revenue * 100).toFixed(1) : "0";
            return `<tr>
              <td>${i + 1}</td><td>${c.name}</td><td>${c.invoiceCount}</td>
              <td>${c.revenue.toLocaleString("ar-EG")} ${currency}</td>
              <td>${c.cost.toLocaleString("ar-EG")} ${currency}</td>
              <td style="color:${profit >= 0 ? "green" : "red"};font-weight:bold">${profit.toLocaleString("ar-EG")} ${currency}</td>
              <td>${margin}%</td>
            </tr>`;
          }).join("")}
        </table>
        <div class="footer">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const tabLabels: Record<ReportTab, string> = {
    "period": "تقرير الفترة",
    "daily-profit": "الربح اليومي",
    "margin": "هامش الربح",
    "customer-debts": "ديون العملاء",
    "supplier-debts": "ديون الموردين",
    "top-customers": "أعلى العملاء",
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="w-7 h-7 text-[#1e2a4a] dark:text-blue-300" />
        <h1 className="text-2xl font-bold">التقارير</h1>
      </div>

      {/* بطاقات الديون السريعة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setDebtDialogType("customers")}
          className="cursor-pointer text-right"
        >
          <Card className="border-0 shadow-md bg-orange-50 dark:bg-orange-900/20 hover:shadow-lg transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">إجمالي ديون العملاء للشركة</p>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
                  {totalCustomerDebt.toLocaleString("ar-EG")} {currency}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{debtedCustomers.length} عميل مدين — اضغط للتفاصيل</p>
              </div>
              <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </CardContent>
          </Card>
        </button>

        <button
          onClick={() => setDebtDialogType("suppliers")}
          className="cursor-pointer text-right"
        >
          <Card className="border-0 shadow-md bg-red-50 dark:bg-red-900/20 hover:shadow-lg transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">إجمالي ديون الشركة للموردين</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">
                  {totalSupplierDebt.toLocaleString("ar-EG")} {currency}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{supplierDebtList.length} مورد دائن — اضغط للتفاصيل</p>
              </div>
              <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {(Object.keys(tabLabels) as ReportTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`pb-2 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${tab === t ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* فلتر التاريخ */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label>من:</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" dir="rtl" />
        </div>
        <div className="flex items-center gap-2">
          <Label>إلى:</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" dir="rtl" />
        </div>
        {tab === "period" && (
          <Button onClick={printReport} variant="secondary" size="sm">
            <Printer className="w-4 h-4 ml-2" /> طباعة
          </Button>
        )}
        {tab === "top-customers" && (
          <Button onClick={printTopCustomers} variant="secondary" size="sm">
            <Printer className="w-4 h-4 ml-2" /> طباعة
          </Button>
        )}
      </div>

      {/* ملاحظة منهجية الحساب */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
        💡 <strong>منهجية حساب الربح:</strong> الربح = (سعر البيع − سعر التكلفة) × الكمية لكل صنف مباع.
      </div>

      {/* تقرير الفترة */}
      {tab === "period" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-md bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي الإيراد</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{totalSales.toLocaleString("ar-EG")} {currency}</p>
                <p className="text-xs text-muted-foreground mt-1">{periodSales.length} فاتورة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-slate-50 dark:bg-slate-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي التكلفة</p>
                <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{totalCost.toLocaleString("ar-EG")} {currency}</p>
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-md ${netProfit >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">صافي الربح</p>
                <p className={`text-xl font-bold ${netProfit >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}`}>
                  {netProfit.toLocaleString("ar-EG")} {currency}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-orange-50 dark:bg-orange-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">المشتريات</p>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{totalPurchases.toLocaleString("ar-EG")} {currency}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">تفاصيل المبيعات والأرباح</CardTitle></CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right p-3">رقم الفاتورة</th>
                      <th className="text-right p-3">التاريخ</th>
                      <th className="text-right p-3">العميل</th>
                      <th className="text-right p-3">الإيراد</th>
                      <th className="text-right p-3">التكلفة</th>
                      <th className="text-right p-3">الربح</th>
                      <th className="text-right p-3">نسبة الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodSales.map((s) => {
                      let sCost = 0;
                      for (const item of s.items) sCost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
                      const sProfit = s.netAmount - sCost;
                      const margin = s.netAmount > 0 ? (sProfit / s.netAmount * 100) : 0;
                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-medium text-blue-600">{s.invoiceNumber}</td>
                          <td className="p-3 text-muted-foreground">{new Date(s.date).toLocaleDateString("ar-EG")}</td>
                          <td className="p-3">{s.customerName}</td>
                          <td className="p-3 text-green-600 font-semibold">{s.netAmount.toLocaleString("ar-EG")} {currency}</td>
                          <td className="p-3 text-muted-foreground">{sCost.toLocaleString("ar-EG")} {currency}</td>
                          <td className={`p-3 font-bold ${sProfit >= 0 ? "text-blue-700" : "text-red-600"}`}>{sProfit.toLocaleString("ar-EG")} {currency}</td>
                          <td className="p-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${margin >= 20 ? "bg-green-100 text-green-700" : margin >= 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                              {margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {periodSales.length === 0 && <div className="text-center py-8 text-muted-foreground">لا توجد مبيعات في هذه الفترة</div>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* الربح اليومي */}
      {tab === "daily-profit" && (
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">الربح اليومي (إيراد − تكلفة)</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد بيانات في هذه الفترة</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
                    <XAxis dataKey="date" tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <YAxis tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString("ar-EG")} ${currency}`} />
                    <Bar dataKey="revenue" name="إيراد" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" name="تكلفة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="ربح صافي" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">منحنى الربح اليومي</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyData}>
                    <XAxis dataKey="date" tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <YAxis tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString("ar-EG")} ${currency}`} />
                    <Line type="monotone" dataKey="profit" name="ربح صافي" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* هامش الربح */}
      {tab === "margin" && (
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">هامش الربح لكل منتج = (سعر البيع − التكلفة) ÷ سعر البيع</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {marginData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">لا توجد منتجات</div>
              ) : (
                marginData.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{p.name}</span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground">ربح/وحدة: <strong>{p.profitPerUnit.toLocaleString("ar-EG")} {currency}</strong></span>
                        <span className={`font-bold ${p.margin >= 20 ? "text-green-600" : p.margin >= 10 ? "text-orange-600" : "text-red-600"}`}>{p.margin}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${p.margin >= 20 ? "bg-green-500" : p.margin >= 10 ? "bg-orange-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(Math.max(p.margin, 0), 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>تكلفة: {p.costPrice.toLocaleString("ar-EG")} {currency}</span>
                      <span>بيع: {p.price.toLocaleString("ar-EG")} {currency}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ديون العملاء */}
      {tab === "customer-debts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-0 shadow-md bg-orange-50 dark:bg-orange-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي ديون العملاء</p>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{totalCustomerDebt.toLocaleString("ar-EG")} {currency}</p>
                <p className="text-xs text-muted-foreground mt-1">{debtedCustomers.length} عميل مدين</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-slate-50 dark:bg-slate-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي العملاء</p>
                <p className="text-2xl font-bold">{(customers ?? []).length}</p>
                <p className="text-xs text-muted-foreground mt-1">{(customers ?? []).filter(c => c.balance === 0).length} عميل سوّى حسابه</p>
              </CardContent>
            </Card>
          </div>
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">قائمة العملاء المدينين</CardTitle></CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right p-3">#</th>
                      <th className="text-right p-3">اسم العميل</th>
                      <th className="text-right p-3">رقم الهاتف</th>
                      <th className="text-right p-3">المبلغ المستحق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtedCustomers.sort((a, b) => b.balance - a.balance).map((c, i) => (
                      <tr key={c.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                        <td className="p-3 font-bold text-orange-700 dark:text-orange-400">{c.balance.toLocaleString("ar-EG")} {currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {debtedCustomers.length === 0 && <div className="text-center py-8 text-muted-foreground">لا يوجد عملاء مدينون</div>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ديون الموردين */}
      {tab === "supplier-debts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-0 shadow-md bg-red-50 dark:bg-red-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي ديون الشركة للموردين</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{totalSupplierDebt.toLocaleString("ar-EG")} {currency}</p>
                <p className="text-xs text-muted-foreground mt-1">{supplierDebtList.length} مورد دائن</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-slate-50 dark:bg-slate-900/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">فواتير مشتريات غير مسددة</p>
                <p className="text-2xl font-bold">{(allPurchases ?? []).filter(p => p.remainingAmount > 0).length}</p>
                <p className="text-xs text-muted-foreground mt-1">فاتورة معلقة</p>
              </CardContent>
            </Card>
          </div>
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">ديون الشركة للموردين</CardTitle></CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right p-3">#</th>
                      <th className="text-right p-3">اسم المورد</th>
                      <th className="text-right p-3">إجمالي المستحق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierDebtList.map((s, i) => (
                      <tr key={s.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 font-bold text-red-700 dark:text-red-400">{s.total.toLocaleString("ar-EG")} {currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {supplierDebtList.length === 0 && <div className="text-center py-8 text-muted-foreground">لا توجد ديون للموردين</div>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* أعلى العملاء مسحوبات */}
      {tab === "top-customers" && (
        <div className="space-y-4">
          {topCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">لا توجد مبيعات في هذه الفترة</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-0 shadow-md bg-blue-50 dark:bg-blue-900/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">إجمالي مسحوبات الفترة</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{totalSales.toLocaleString("ar-EG")} {currency}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md bg-green-50 dark:bg-green-900/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">صافي ربح الشركة</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{netProfit.toLocaleString("ar-EG")} {currency}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-900/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">عدد العملاء النشطين</p>
                    <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{topCustomers.length}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-md">
                <CardHeader><CardTitle className="text-sm">ترتيب العملاء حسب حجم المسحوبات</CardTitle></CardHeader>
                <CardContent className="p-0 pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-right p-3">#</th>
                          <th className="text-right p-3">اسم العميل</th>
                          <th className="text-right p-3">عدد الفواتير</th>
                          <th className="text-right p-3">إجمالي المسحوبات</th>
                          <th className="text-right p-3">التكلفة</th>
                          <th className="text-right p-3">ربح الشركة منه</th>
                          <th className="text-right p-3">نسبة الربح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomers.map((c, i) => {
                          const profit = c.revenue - c.cost;
                          const margin = c.revenue > 0 ? (profit / c.revenue * 100) : 0;
                          return (
                            <tr key={i} className="border-b hover:bg-muted/20">
                              <td className="p-3">
                                {i === 0 ? <span className="text-yellow-500 font-bold text-base">🥇</span> : i === 1 ? <span className="text-slate-400 font-bold">🥈</span> : i === 2 ? <span className="text-orange-500 font-bold">🥉</span> : <span className="text-muted-foreground">{i + 1}</span>}
                              </td>
                              <td className="p-3 font-semibold">{c.name}</td>
                              <td className="p-3 text-center">
                                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-semibold">{c.invoiceCount}</span>
                              </td>
                              <td className="p-3 font-bold text-green-700 dark:text-green-400">{c.revenue.toLocaleString("ar-EG")} {currency}</td>
                              <td className="p-3 text-muted-foreground">{c.cost.toLocaleString("ar-EG")} {currency}</td>
                              <td className={`p-3 font-bold ${profit >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                                {profit.toLocaleString("ar-EG")} {currency}
                              </td>
                              <td className="p-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${margin >= 20 ? "bg-green-100 text-green-700" : margin >= 10 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                                  {margin.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* رسم بياني */}
              <Card className="border-0 shadow-md">
                <CardHeader><CardTitle className="text-sm">مقارنة بصرية لأعلى 10 عملاء</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topCustomers.slice(0, 10).map(c => ({ name: c.name.length > 10 ? c.name.slice(0, 10) + "…" : c.name, مسحوبات: c.revenue, ربح: c.revenue - c.cost }))}>
                      <XAxis dataKey="name" tick={{ fontFamily: "Cairo", fontSize: 10 }} />
                      <YAxis tick={{ fontFamily: "Cairo", fontSize: 10 }} />
                      <Tooltip formatter={(v) => `${Number(v).toLocaleString("ar-EG")} ${currency}`} />
                      <Bar dataKey="مسحوبات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ربح" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Dialog: ديون العملاء */}
      <Dialog open={debtDialogType === "customers"} onOpenChange={(o) => !o && setDebtDialogType(null)}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              ديون العملاء للشركة
            </DialogTitle>
          </DialogHeader>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-center mb-4">
            <p className="text-sm text-muted-foreground">إجمالي الديون</p>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{totalCustomerDebt.toLocaleString("ar-EG")} {currency}</p>
            <p className="text-xs text-muted-foreground mt-1">{debtedCustomers.length} عميل مدين</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-right p-2">#</th>
              <th className="text-right p-2">العميل</th>
              <th className="text-right p-2">الهاتف</th>
              <th className="text-right p-2">المستحق</th>
            </tr></thead>
            <tbody>
              {debtedCustomers.sort((a, b) => b.balance - a.balance).map((c, i) => (
                <tr key={c.id} className="border-b hover:bg-muted/20">
                  <td className="p-2 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2 text-muted-foreground text-xs">{c.phone ?? "—"}</td>
                  <td className="p-2 font-bold text-orange-700 dark:text-orange-400">{c.balance.toLocaleString("ar-EG")} {currency}</td>
                </tr>
              ))}
              {debtedCustomers.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">لا يوجد عملاء مدينون</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      {/* Dialog: ديون الموردين */}
      <Dialog open={debtDialogType === "suppliers"} onOpenChange={(o) => !o && setDebtDialogType(null)}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-red-600" />
              ديون الشركة للموردين
            </DialogTitle>
          </DialogHeader>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center mb-4">
            <p className="text-sm text-muted-foreground">إجمالي ديون الشركة</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{totalSupplierDebt.toLocaleString("ar-EG")} {currency}</p>
            <p className="text-xs text-muted-foreground mt-1">{supplierDebtList.length} مورد دائن</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-right p-2">#</th>
              <th className="text-right p-2">المورد</th>
              <th className="text-right p-2">المستحق</th>
            </tr></thead>
            <tbody>
              {supplierDebtList.map((s, i) => (
                <tr key={s.id} className="border-b hover:bg-muted/20">
                  <td className="p-2 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="p-2 font-medium">{s.name}</td>
                  <td className="p-2 font-bold text-red-700 dark:text-red-400">{s.total.toLocaleString("ar-EG")} {currency}</td>
                </tr>
              ))}
              {supplierDebtList.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">لا توجد ديون للموردين</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

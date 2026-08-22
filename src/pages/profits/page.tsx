import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, BadgeDollarSign, Printer, BarChart3 } from "lucide-react";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

export default function ProfitsPage() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState<"invoices" | "products" | "chart">("invoices");

  const allSales = useLiveQuery(() => db.sales.orderBy("date").toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const from = new Date(fromDate).toISOString();
  const to = new Date(toDate + "T23:59:59").toISOString();

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const periodSales = (allSales ?? []).filter((s) => s.date >= from && s.date <= to);

  // حساب الربح لكل فاتورة
  const invoiceRows = periodSales.map((s) => {
    let cost = 0;
    const itemDetails = s.items.map((item) => {
      const prod = productMap.get(item.productId);
      const unitCost = prod?.costPrice ?? 0;
      const itemCost = unitCost * item.quantity;
      const itemProfit = item.total - itemCost;
      cost += itemCost;
      return { ...item, unitCost, itemCost, itemProfit };
    });
    const profit = s.netAmount - cost;
    const margin = s.netAmount > 0 ? (profit / s.netAmount) * 100 : 0;
    return { sale: s, cost, profit, margin, itemDetails };
  });

  const totalRevenue = invoiceRows.reduce((s, r) => s + r.sale.netAmount, 0);
  const totalCost = invoiceRows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // ربح لكل منتج مباع في الفترة
  const productProfitMap = new Map<string, { name: string; quantity: number; revenue: number; cost: number; profit: number }>();
  for (const row of invoiceRows) {
    for (const item of row.itemDetails) {
      const prev = productProfitMap.get(item.productId) ?? { name: item.productName, quantity: 0, revenue: 0, cost: 0, profit: 0 };
      productProfitMap.set(item.productId, {
        name: item.productName,
        quantity: prev.quantity + item.quantity,
        revenue: prev.revenue + item.total,
        cost: prev.cost + item.itemCost,
        profit: prev.profit + item.itemProfit,
      });
    }
  }
  const productRows = Array.from(productProfitMap.values()).sort((a, b) => b.profit - a.profit);

  // بيانات المخطط اليومي
  const dailyMap = new Map<string, { revenue: number; cost: number }>();
  for (const row of invoiceRows) {
    const d = row.sale.date.slice(0, 10);
    const prev = dailyMap.get(d) ?? { revenue: 0, cost: 0 };
    dailyMap.set(d, { revenue: prev.revenue + row.sale.netAmount, cost: prev.cost + row.cost });
  }
  const chartData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date: date.slice(5), revenue: v.revenue, cost: v.cost, profit: v.revenue - v.cost }));

  const pColor = (n: number) => (n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400");
  const fmt = (n: number) => `${n.toLocaleString("ar-EG")} ${currency}`;

  const printProfitReport = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8"><title>تقرير الأرباح</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body{font-family:'Cairo',sans-serif;padding:20px;font-size:13px}
          table{width:100%;border-collapse:collapse;margin-top:12px}
          th,td{border:1px solid #ddd;padding:8px;text-align:right}
          th{background:#1e2a4a;color:white}
          .header{text-align:center;border-bottom:2px solid #1e2a4a;padding-bottom:10px;margin-bottom:16px}
          .summary{display:flex;gap:12px;margin:12px 0}
          .box{flex:1;background:#f0f4f8;border-radius:8px;padding:10px;text-align:center}
          .profit{color:green}.loss{color:red}
        </style>
      </head><body>
        <div class="header">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height:60px"><br>` : ""}
          <h2>${settings?.companyName ?? "الشركة"}</h2>
          <h3>تقرير الأرباح — من ${fromDate} إلى ${toDate}</h3>
        </div>
        <div class="summary">
          <div class="box"><strong>إجمالي الإيراد</strong><br>${fmt(totalRevenue)}</div>
          <div class="box"><strong>إجمالي التكلفة</strong><br>${fmt(totalCost)}</div>
          <div class="box"><strong class="${totalProfit >= 0 ? "profit" : "loss"}">صافي الربح</strong><br><strong class="${totalProfit >= 0 ? "profit" : "loss"}">${fmt(totalProfit)}</strong></div>
          <div class="box"><strong>نسبة الربح</strong><br>${avgMargin.toFixed(1)}%</div>
        </div>
        <h4>تفاصيل الفواتير</h4>
        <table>
          <tr><th>#</th><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإيراد</th><th>التكلفة</th><th>الربح</th><th>نسبة الربح</th></tr>
          ${invoiceRows.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td>${r.sale.invoiceNumber}</td>
            <td>${new Date(r.sale.date).toLocaleDateString("ar-EG")}</td>
            <td>${r.sale.customerName}</td>
            <td>${fmt(r.sale.netAmount)}</td>
            <td>${fmt(r.cost)}</td>
            <td class="${r.profit >= 0 ? "profit" : "loss"}"><strong>${fmt(r.profit)}</strong></td>
            <td>${r.margin.toFixed(1)}%</td>
          </tr>`).join("")}
        </table>
        <div style="margin-top:30px;text-align:center;color:#666;font-size:11px">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const tabs = [
    { id: "invoices" as const, label: "ربح كل فاتورة" },
    { id: "products" as const, label: "ربح كل منتج" },
    { id: "chart" as const, label: "مخطط الأرباح" },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* العنوان */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <BadgeDollarSign className="w-7 h-7 text-emerald-600" />
          <h1 className="text-2xl font-bold">الأرباح</h1>
        </div>
        <Button onClick={printProfitReport} variant="secondary" size="sm">
          <Printer className="w-4 h-4 ml-2" /> طباعة التقرير
        </Button>
      </div>

      {/* فلتر التاريخ */}
      <div className="flex items-center gap-4 flex-wrap bg-muted/40 rounded-xl p-3 border">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">من:</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40 h-9" dir="rtl" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">إلى:</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40 h-9" dir="rtl" />
        </div>
        <span className="text-sm text-muted-foreground">{periodSales.length} فاتورة</span>
      </div>

      {/* بطاقات ملخص */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-md bg-emerald-50 dark:bg-emerald-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span className="text-xs text-muted-foreground">إجمالي الإيراد</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-slate-50 dark:bg-slate-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="w-5 h-5 text-slate-500" />
              <span className="text-xs text-muted-foreground">إجمالي التكلفة</span>
            </div>
            <p className="text-xl font-bold text-slate-600 dark:text-slate-300">{fmt(totalCost)}</p>
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-md ${totalProfit >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <BadgeDollarSign className={`w-5 h-5 ${totalProfit >= 0 ? "text-blue-600" : "text-red-600"}`} />
              <span className="text-xs text-muted-foreground">صافي الربح</span>
            </div>
            <p className={`text-xl font-bold ${pColor(totalProfit)}`}>{fmt(totalProfit)}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <span className="text-xs text-muted-foreground">نسبة الربح</span>
            </div>
            <p className={`text-xl font-bold ${pColor(totalProfit)}`}>{avgMargin.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* ملاحظة منهجية */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
        💡 <strong>منهجية الحساب:</strong> ربح كل صنف = (سعر البيع − سعر التكلفة) × الكمية. صافي الربح = إجمالي الإيراد − إجمالي تكلفة الأصناف المباعة.
      </div>

      {/* التبويبات */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${activeTab === t.id ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* تبويب: ربح كل فاتورة */}
      {activeTab === "invoices" && (
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-sm">تفاصيل الأرباح لكل فاتورة مبيعات</CardTitle></CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right p-3 font-semibold">رقم الفاتورة</th>
                    <th className="text-right p-3 font-semibold">التاريخ</th>
                    <th className="text-right p-3 font-semibold">العميل</th>
                    <th className="text-right p-3 font-semibold">الأصناف</th>
                    <th className="text-right p-3 font-semibold">الإيراد</th>
                    <th className="text-right p-3 font-semibold">التكلفة</th>
                    <th className="text-right p-3 font-semibold">صافي الربح</th>
                    <th className="text-right p-3 font-semibold">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((r) => (
                    <tr key={r.sale.id} className="border-b hover:bg-muted/20">
                      <td className="p-3 font-bold text-blue-600">{r.sale.invoiceNumber}</td>
                      <td className="p-3 text-muted-foreground text-xs">{new Date(r.sale.date).toLocaleDateString("ar-EG")}</td>
                      <td className="p-3 font-medium">{r.sale.customerName}</td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          {r.itemDetails.map((item, i) => (
                            <div key={i} className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
                              <span className="font-medium text-foreground">{item.productName}</span>
                              <span>×{item.quantity}</span>
                              <span className="text-blue-600">بيع: {item.unitPrice.toLocaleString("ar-EG")}</span>
                              <span className="text-slate-500">تكلفة: {item.unitCost.toLocaleString("ar-EG")}</span>
                              <span className={`font-semibold ${item.itemProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                ربح: {item.itemProfit.toLocaleString("ar-EG")} {currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-emerald-600">{fmt(r.sale.netAmount)}</td>
                      <td className="p-3 text-muted-foreground">{fmt(r.cost)}</td>
                      <td className={`p-3 font-bold ${pColor(r.profit)}`}>{fmt(r.profit)}</td>
                      <td className="p-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.margin >= 20 ? "bg-green-100 text-green-700" : r.margin >= 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                          {r.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {invoiceRows.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد مبيعات في هذه الفترة</td></tr>
                  )}
                </tbody>
                {invoiceRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-bold">
                      <td colSpan={4} className="p-3 text-right">الإجمالي ({invoiceRows.length} فاتورة)</td>
                      <td className="p-3 text-emerald-700">{fmt(totalRevenue)}</td>
                      <td className="p-3 text-slate-600">{fmt(totalCost)}</td>
                      <td className={`p-3 ${pColor(totalProfit)}`}>{fmt(totalProfit)}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${avgMargin >= 20 ? "bg-green-100 text-green-700" : avgMargin >= 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                          {avgMargin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* تبويب: ربح كل منتج */}
      {activeTab === "products" && (
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-sm">ربح كل منتج في الفترة المحددة</CardTitle></CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right p-3 font-semibold">#</th>
                    <th className="text-right p-3 font-semibold">المنتج</th>
                    <th className="text-right p-3 font-semibold">الكمية المباعة</th>
                    <th className="text-right p-3 font-semibold">إجمالي الإيراد</th>
                    <th className="text-right p-3 font-semibold">إجمالي التكلفة</th>
                    <th className="text-right p-3 font-semibold">صافي الربح</th>
                    <th className="text-right p-3 font-semibold">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p, i) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <tr key={p.name} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-semibold">{p.name}</td>
                        <td className="p-3 text-center">{p.quantity.toLocaleString("ar-EG")}</td>
                        <td className="p-3 text-emerald-600 font-semibold">{fmt(p.revenue)}</td>
                        <td className="p-3 text-muted-foreground">{fmt(p.cost)}</td>
                        <td className={`p-3 font-bold ${pColor(p.profit)}`}>{fmt(p.profit)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-muted rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${margin >= 20 ? "bg-green-500" : margin >= 0 ? "bg-blue-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold ${margin >= 20 ? "text-green-700" : margin >= 0 ? "text-blue-700" : "text-red-700"}`}>
                              {margin.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {productRows.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد مبيعات في هذه الفترة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* تبويب: المخطط */}
      {activeTab === "chart" && (
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">مقارنة الإيراد والتكلفة والربح يومياً</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد بيانات في هذه الفترة</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
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
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <YAxis tick={{ fontFamily: "Cairo", fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString("ar-EG")} ${currency}`} />
                    <Line type="monotone" dataKey="profit" name="ربح صافي" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-muted-foreground">لا توجد بيانات</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

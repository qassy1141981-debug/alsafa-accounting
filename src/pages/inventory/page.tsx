import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db.ts";
import { AlertTriangle, Warehouse, Package, FlaskConical, DollarSign, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

export default function Inventory() {
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);
  const rawMaterials = useLiveQuery(() => db.rawMaterials.orderBy("name").toArray(), []);

  const lowProducts = products?.filter((p) => p.minStock !== undefined && p.currentStock <= p.minStock);
  const lowMaterials = rawMaterials?.filter((m) => m.minStock !== undefined && m.currentStock <= m.minStock);

  // إجمالي قيمة المخزون
  const totalProductsCost = products?.reduce((sum, p) => sum + p.currentStock * (p.costPrice ?? 0), 0) ?? 0;
  const totalProductsSell = products?.reduce((sum, p) => sum + p.currentStock * (p.price ?? 0), 0) ?? 0;
  const totalMaterialsCost = rawMaterials?.reduce((sum, m) => sum + m.currentStock * (m.price ?? 0), 0) ?? 0;
  const grandTotalCost = totalProductsCost + totalMaterialsCost;
  const grandTotalSell = totalProductsSell + totalMaterialsCost;
  const expectedProfit = grandTotalSell - grandTotalCost;

  const printInventoryValue = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="rtl"><head>
        <meta charset="UTF-8"><title>تقرير قيمة المخزون</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body{font-family:'Cairo',sans-serif;padding:24px;color:#111}
          h2,h3{color:#1e2a4a}
          table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
          th{background:#1e2a4a;color:white;padding:8px;text-align:right}
          td{border:1px solid #ddd;padding:7px;text-align:right}
          tr:nth-child(even){background:#f5f7fa}
          .summary{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}
          .card{border:1px solid #ddd;border-radius:8px;padding:12px 20px;min-width:180px;text-align:center}
          .card .val{font-size:20px;font-weight:700;color:#1e2a4a}
          .card .lbl{font-size:12px;color:#666;margin-top:2px}
          .profit{color:green} .footer{margin-top:30px;text-align:center;font-size:12px;color:#999}
        </style>
      </head><body>
        <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #1e2a4a;padding-bottom:10px">
          ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height:55px"><br>` : ""}
          <h2 style="margin:4px 0">${settings?.companyName ?? "الشركة"}</h2>
          <h3 style="margin:4px 0;font-weight:400">تقرير قيمة المخزون الإجمالية</h3>
          <small>بتاريخ: ${new Date().toLocaleDateString("ar-EG")}</small>
        </div>

        <div class="summary">
          <div class="card"><div class="val">${grandTotalCost.toLocaleString("ar-EG")} ${currency}</div><div class="lbl">إجمالي التكلفة</div></div>
          <div class="card"><div class="val">${grandTotalSell.toLocaleString("ar-EG")} ${currency}</div><div class="lbl">إجمالي سعر البيع</div></div>
          <div class="card"><div class="val profit">${expectedProfit.toLocaleString("ar-EG")} ${currency}</div><div class="lbl">الربح المتوقع</div></div>
        </div>

        <h3>المنتجات الجاهزة</h3>
        <table>
          <thead><tr><th>المنتج</th><th>الكمية</th><th>الوحدة</th><th>سعر التكلفة</th><th>سعر البيع</th><th>قيمة التكلفة</th><th>قيمة البيع</th></tr></thead>
          <tbody>
            ${(products ?? []).map((p) => `
              <tr>
                <td>${p.name}</td><td>${p.currentStock.toLocaleString("ar-EG")}</td><td>${p.unit}</td>
                <td>${(p.costPrice ?? 0).toLocaleString("ar-EG")} ${currency}</td>
                <td>${(p.price ?? 0).toLocaleString("ar-EG")} ${currency}</td>
                <td>${(p.currentStock * (p.costPrice ?? 0)).toLocaleString("ar-EG")} ${currency}</td>
                <td>${(p.currentStock * (p.price ?? 0)).toLocaleString("ar-EG")} ${currency}</td>
              </tr>`).join("")}
            <tr style="background:#e8f0fe;font-weight:700">
              <td colspan="5">الإجمالي</td>
              <td>${totalProductsCost.toLocaleString("ar-EG")} ${currency}</td>
              <td>${totalProductsSell.toLocaleString("ar-EG")} ${currency}</td>
            </tr>
          </tbody>
        </table>

        <h3>المواد الخام</h3>
        <table>
          <thead><tr><th>المادة</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>القيمة الإجمالية</th></tr></thead>
          <tbody>
            ${(rawMaterials ?? []).map((m) => `
              <tr>
                <td>${m.name}</td><td>${m.currentStock.toLocaleString("ar-EG")}</td><td>${m.unit}</td>
                <td>${(m.price ?? 0).toLocaleString("ar-EG")} ${currency}</td>
                <td>${(m.currentStock * (m.price ?? 0)).toLocaleString("ar-EG")} ${currency}</td>
              </tr>`).join("")}
            <tr style="background:#e8f0fe;font-weight:700">
              <td colspan="4">الإجمالي</td>
              <td>${totalMaterialsCost.toLocaleString("ar-EG")} ${currency}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")} | ${settings?.companyName ?? ""}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Warehouse className="w-7 h-7 text-[#1e2a4a] dark:text-blue-300" />
          <h1 className="text-2xl font-bold">المخازن والجرد</h1>
        </div>
        <button
          onClick={printInventoryValue}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e2a4a] text-white text-sm font-semibold hover:bg-[#2d3f6b] transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" /> طباعة تقرير القيمة
        </button>
      </div>

      {/* ملخص قيمة المخزون */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-blue-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground mb-1">قيمة المنتجات (تكلفة)</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {totalProductsCost.toLocaleString("ar-EG")}
            </p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-900/20">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-purple-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground mb-1">قيمة المنتجات (بيع)</p>
            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
              {totalProductsSell.toLocaleString("ar-EG")}
            </p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-orange-50 dark:bg-orange-900/20">
          <CardContent className="p-4 text-center">
            <FlaskConical className="w-6 h-6 text-orange-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground mb-1">قيمة المواد الخام</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
              {totalMaterialsCost.toLocaleString("ar-EG")}
            </p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-green-50 dark:bg-green-900/20">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground mb-1">الربح المتوقع</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">
              {expectedProfit.toLocaleString("ar-EG")}
            </p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>
      </div>

      {/* إجمالي شامل */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-md border-r-4 border-r-[#1e2a4a]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي قيمة المخزون (بالتكلفة)</p>
              <p className="text-2xl font-bold text-[#1e2a4a] dark:text-blue-200 mt-1">
                {grandTotalCost.toLocaleString("ar-EG")} <span className="text-base font-normal">{currency}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">منتجات + مواد خام</p>
            </div>
            <Warehouse className="w-10 h-10 text-[#1e2a4a]/20 dark:text-blue-300/30" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md border-r-4 border-r-green-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي قيمة المخزون (بسعر البيع)</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                {grandTotalSell.toLocaleString("ar-EG")} <span className="text-base font-normal">{currency}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">القيمة السوقية للمخزون</p>
            </div>
            <Package className="w-10 h-10 text-green-500/20" />
          </CardContent>
        </Card>
      </div>

      {/* تنبيهات نقص المخزون */}
      {((lowProducts?.length ?? 0) + (lowMaterials?.length ?? 0)) > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <span className="font-bold text-orange-700 dark:text-orange-400">
              تنبيه: {(lowProducts?.length ?? 0) + (lowMaterials?.length ?? 0)} صنف وصل للحد الأدنى
            </span>
          </div>
          <ul className="space-y-1">
            {lowProducts?.map((p) => (
              <li key={p.id} className="text-sm text-orange-600 dark:text-orange-400">
                • {p.name}: المخزون {p.currentStock} {p.unit} (الحد الأدنى: {p.minStock})
              </li>
            ))}
            {lowMaterials?.map((m) => (
              <li key={m.id} className="text-sm text-orange-600 dark:text-orange-400">
                • {m.name}: المخزون {m.currentStock} {m.unit} (الحد الأدنى: {m.minStock})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* جدول المنتجات */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-purple-600" />
            المنتجات الجاهزة
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-right p-3 font-semibold">المنتج</th>
                  <th className="text-right p-3 font-semibold">الكمية</th>
                  <th className="text-right p-3 font-semibold">الوحدة</th>
                  <th className="text-right p-3 font-semibold">سعر التكلفة</th>
                  <th className="text-right p-3 font-semibold">سعر البيع</th>
                  <th className="text-right p-3 font-semibold">قيمة المخزون (تكلفة)</th>
                  <th className="text-right p-3 font-semibold">قيمة المخزون (بيع)</th>
                  <th className="text-right p-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {products?.map((p) => {
                  const low = p.minStock !== undefined && p.currentStock <= p.minStock;
                  const stockCost = p.currentStock * (p.costPrice ?? 0);
                  const stockSell = p.currentStock * (p.price ?? 0);
                  return (
                    <tr key={p.id} className={`border-b ${low ? "bg-orange-50/50 dark:bg-orange-900/10" : "hover:bg-muted/20"}`}>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className={`p-3 font-bold ${low ? "text-orange-600" : ""}`}>{p.currentStock.toLocaleString("ar-EG")}</td>
                      <td className="p-3 text-muted-foreground">{p.unit}</td>
                      <td className="p-3 text-muted-foreground">{p.costPrice?.toLocaleString("ar-EG") ?? "-"} {p.costPrice ? currency : ""}</td>
                      <td className="p-3 text-green-700 dark:text-green-400">{p.price?.toLocaleString("ar-EG") ?? "-"} {p.price ? currency : ""}</td>
                      <td className="p-3 font-semibold text-blue-700 dark:text-blue-300">{stockCost.toLocaleString("ar-EG")} {currency}</td>
                      <td className="p-3 font-semibold text-green-700 dark:text-green-400">{stockSell.toLocaleString("ar-EG")} {currency}</td>
                      <td className="p-3">
                        {low
                          ? <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> نقص</span>
                          : <span className="text-green-600 text-xs font-semibold">✓ طبيعي</span>}
                      </td>
                    </tr>
                  );
                })}
                {(products?.length ?? 0) > 0 && (
                  <tr className="bg-blue-50/60 dark:bg-blue-900/20 font-bold border-t-2">
                    <td className="p-3" colSpan={5}>الإجمالي</td>
                    <td className="p-3 text-blue-700 dark:text-blue-300">{totalProductsCost.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 text-green-700 dark:text-green-400">{totalProductsSell.toLocaleString("ar-EG")} {currency}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* جدول المواد الخام */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            المواد الخام
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-right p-3 font-semibold">المادة</th>
                  <th className="text-right p-3 font-semibold">الكمية</th>
                  <th className="text-right p-3 font-semibold">الوحدة</th>
                  <th className="text-right p-3 font-semibold">الحد الأدنى</th>
                  <th className="text-right p-3 font-semibold">سعر الوحدة</th>
                  <th className="text-right p-3 font-semibold">القيمة الإجمالية</th>
                  <th className="text-right p-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rawMaterials?.map((m) => {
                  const low = m.minStock !== undefined && m.currentStock <= m.minStock;
                  const totalVal = m.currentStock * (m.price ?? 0);
                  return (
                    <tr key={m.id} className={`border-b ${low ? "bg-orange-50/50 dark:bg-orange-900/10" : "hover:bg-muted/20"}`}>
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className={`p-3 font-bold ${low ? "text-orange-600" : ""}`}>{m.currentStock.toLocaleString("ar-EG")}</td>
                      <td className="p-3 text-muted-foreground">{m.unit}</td>
                      <td className="p-3 text-muted-foreground">{m.minStock ?? "-"}</td>
                      <td className="p-3 text-muted-foreground">{m.price?.toLocaleString("ar-EG") ?? "-"} {m.price ? currency : ""}</td>
                      <td className="p-3 font-semibold text-orange-700 dark:text-orange-400">{totalVal.toLocaleString("ar-EG")} {currency}</td>
                      <td className="p-3">
                        {low
                          ? <span className="flex items-center gap-1 text-orange-600 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> نقص</span>
                          : <span className="text-green-600 text-xs font-semibold">✓ طبيعي</span>}
                      </td>
                    </tr>
                  );
                })}
                {(rawMaterials?.length ?? 0) > 0 && (
                  <tr className="bg-orange-50/60 dark:bg-orange-900/20 font-bold border-t-2">
                    <td className="p-3" colSpan={5}>الإجمالي</td>
                    <td className="p-3 text-orange-700 dark:text-orange-400">{totalMaterialsCost.toLocaleString("ar-EG")} {currency}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * حساب الربح الصحيح:
 * الربح = مجموع (سعر البيع - سعر التكلفة) × الكمية لكل صنف في الفاتورة
 * المشتريات لا تدخل في حساب الربح مباشرةً — هي تُحدّث سعر التكلفة فقط
 */

import { db, type Sale } from "./db.ts";

/** احسب ربح فاتورة واحدة بناءً على سعر التكلفة المسجّل في المنتج */
export async function calcSaleProfit(sale: Sale): Promise<number> {
  let totalCost = 0;
  for (const item of sale.items) {
    if (item.productId) {
      const prod = await db.products.get(item.productId);
      const costPrice = prod?.costPrice ?? 0;
      totalCost += costPrice * item.quantity;
    }
  }
  // الربح = الصافي من البيع - إجمالي التكلفة
  return sale.netAmount - totalCost;
}

/** احسب ربح مجموعة فواتير مع بيانات مفصّلة لكل فاتورة */
export async function calcSalesProfitDetailed(sales: Sale[]): Promise<{
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitPerSale: { saleId: string; revenue: number; cost: number; profit: number }[];
}> {
  const products = await db.products.toArray();
  const productMap = new Map(products.map((p) => [p.id, p]));

  let totalRevenue = 0;
  let totalCost = 0;
  const profitPerSale = [];

  for (const sale of sales) {
    let saleCost = 0;
    for (const item of sale.items) {
      const prod = productMap.get(item.productId);
      saleCost += (prod?.costPrice ?? 0) * item.quantity;
    }
    const saleProfit = sale.netAmount - saleCost;
    totalRevenue += sale.netAmount;
    totalCost += saleCost;
    profitPerSale.push({ saleId: sale.id, revenue: sale.netAmount, cost: saleCost, profit: saleProfit });
  }

  return { totalRevenue, totalCost, grossProfit: totalRevenue - totalCost, profitPerSale };
}

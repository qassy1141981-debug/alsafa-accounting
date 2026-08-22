/**
 * مساعد توليد روابط واتساب wa.me
 * لا يتطلب API — يفتح تطبيق واتساب مباشرة
 */

/** تنظيف رقم الهاتف وإزالة الأصفار والمسافات */
function normalizePhone(phone: string): string {
  // إزالة كل شيء ما عدا الأرقام
  let digits = phone.replace(/\D/g, "");
  // إذا يبدأ بـ 0 → استبدله بـ 20 (مصر)
  if (digits.startsWith("0")) {
    digits = "20" + digits.slice(1);
  }
  // إذا لا يبدأ بكود دولة واضح → أضف 20
  if (!digits.startsWith("20") && digits.length <= 11) {
    digits = "20" + digits;
  }
  return digits;
}

/** فتح رابط واتساب العادي (wa.me) */
export function openWhatsApp(phone: string, message: string): void {
  const normalized = normalizePhone(phone);
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${normalized}?text=${encoded}`;
  window.open(url, "_blank");
}

/** فتح رابط واتساب بيزنس (api.whatsapp.com) */
export function openWhatsAppBusiness(phone: string, message: string): void {
  const normalized = normalizePhone(phone);
  const encoded = encodeURIComponent(message);
  const url = `https://api.whatsapp.com/send?phone=${normalized}&text=${encoded}`;
  window.open(url, "_blank");
}

/** توليد رسالة فاتورة مبيعات */
export function buildInvoiceMessage(params: {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  date: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }>;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
}): string {
  const {
    companyName,
    customerName,
    invoiceNumber,
    date,
    items,
    totalAmount,
    discount,
    netAmount,
    paidAmount,
    remainingAmount,
    currency,
  } = params;

  const itemLines = items
    .map(
      (i) =>
        `• ${i.productName}: ${i.quantity} × ${i.unitPrice.toLocaleString("ar-EG")} = ${i.total.toLocaleString("ar-EG")} ${currency}`,
    )
    .join("\n");

  let msg = `🧾 *فاتورة مبيعات*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🏢 *${companyName}*\n`;
  msg += `👤 العميل: ${customerName}\n`;
  msg += `📋 رقم الفاتورة: ${invoiceNumber}\n`;
  msg += `📅 التاريخ: ${date}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *الأصناف:*\n${itemLines}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `💰 الإجمالي: ${totalAmount.toLocaleString("ar-EG")} ${currency}\n`;
  if (discount > 0) {
    msg += `🎁 الخصم: ${discount.toLocaleString("ar-EG")} ${currency}\n`;
  }
  msg += `✅ الصافي: ${netAmount.toLocaleString("ar-EG")} ${currency}\n`;
  msg += `💵 المدفوع: ${paidAmount.toLocaleString("ar-EG")} ${currency}\n`;
  if (remainingAmount > 0) {
    msg += `⚠️ المتبقي: ${remainingAmount.toLocaleString("ar-EG")} ${currency}\n`;
  }
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `شكراً لتعاملكم معنا 🙏`;
  return msg;
}

/** توليد رسالة تذكير بالديون */
export function buildDebtReminderMessage(params: {
  companyName: string;
  customerName: string;
  balance: number;
  currency: string;
  notes?: string;
}): string {
  const { companyName, customerName, balance, currency, notes } = params;

  let msg = `📢 *تذكير بالرصيد المستحق*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🏢 *${companyName}*\n`;
  msg += `👤 العميل الكريم: ${customerName}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `💳 الرصيد المستحق عليكم:\n`;
  msg += `*${balance.toLocaleString("ar-EG")} ${currency}*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  if (notes) {
    msg += `📝 ملاحظة: ${notes}\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
  }
  msg += `نرجو التكرم بالسداد في أقرب وقت ممكن.\n`;
  msg += `شكراً لتعاملكم معنا 🙏`;
  return msg;
}

/** توليد تقرير دوري */
export function buildPeriodicReportMessage(params: {
  companyName: string;
  period: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  netProfit: number;
  totalCollections: number;
  currency: string;
}): string {
  const {
    companyName,
    period,
    totalSales,
    totalPurchases,
    totalExpenses,
    netProfit,
    totalCollections,
    currency,
  } = params;

  let msg = `📊 *التقرير الدوري*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🏢 *${companyName}*\n`;
  msg += `📅 الفترة: ${period}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📈 إجمالي المبيعات: ${totalSales.toLocaleString("ar-EG")} ${currency}\n`;
  msg += `📦 إجمالي المشتريات: ${totalPurchases.toLocaleString("ar-EG")} ${currency}\n`;
  msg += `💸 إجمالي المصروفات: ${totalExpenses.toLocaleString("ar-EG")} ${currency}\n`;
  msg += `💰 صافي التحصيلات: ${totalCollections.toLocaleString("ar-EG")} ${currency}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  const profitIcon = netProfit >= 0 ? "📈" : "📉";
  msg += `${profitIcon} *صافي الربح: ${netProfit.toLocaleString("ar-EG")} ${currency}*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `تم إنشاء هذا التقرير تلقائياً من النظام المحاسبي 🤖`;
  return msg;
}

/** توليد تنبيه نقص المخزون */
export function buildInventoryAlertMessage(params: {
  companyName: string;
  items: Array<{ name: string; currentStock: number; minStock: number; unit: string }>;
}): string {
  const { companyName, items } = params;

  const itemLines = items
    .map(
      (i) =>
        `⚠️ ${i.name}: المتاح ${i.currentStock} ${i.unit} (الحد الأدنى ${i.minStock} ${i.unit})`,
    )
    .join("\n");

  let msg = `🚨 *تنبيه نقص المخزون*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🏢 *${companyName}*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `الأصناف التالية وصلت للحد الأدنى أو أقل:\n\n`;
  msg += `${itemLines}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `يرجى اتخاذ الإجراء اللازم لتوفير المخزون. 📋`;
  return msg;
}

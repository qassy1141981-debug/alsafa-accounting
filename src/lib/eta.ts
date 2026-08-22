/**
 * مساعد التكامل مع منظومة الفاتورة الإلكترونية لمصلحة الضرائب المصرية (ETA)
 * الوثائق الرسمية: https://sdk.invoicing.eta.gov.eg
 *
 * ملاحظة مهمة: الـ ETA API تتطلب توقيع رقمي (Digital Signature) على المستندات
 * باستخدام شهادة رقمية معتمدة. هذا التكامل يُجهّز البيانات ويُرسلها عبر Convex Action.
 */

export type ETAEnvironment = "preprod" | "prod";

export type ETAConfig = {
  environment: ETAEnvironment;
  clientId: string;
  clientSecret: string;
  taxpayerActivityCode: string; // كود النشاط الضريبي
  issuerType: "B" | "P" | "F"; // نوع الممول: شركة/شخص/فرع
  issuerRegistrationNumber: string; // الرقم الضريبي
  issuerName: string;
  issuerAddress: string;
  issuerBranchCode?: string;
};

export type ETAInvoiceStatus =
  | "unsent"       // لم تُرسل
  | "submitted"    // تم الإرسال وانتظار التأكيد
  | "valid"        // مقبولة ومعتمدة
  | "invalid"      // مرفوضة من المنظومة
  | "cancelled";   // ملغاة

export type ETAInvoiceRecord = {
  saleId: string;
  invoiceNumber: string;
  status: ETAInvoiceStatus;
  submissionId?: string;       // UUID الإرسالية من ETA
  uuid?: string;               // UUID الفاتورة من ETA
  longId?: string;             // المعرف الطويل من ETA
  hashKey?: string;            // Hash من ETA
  submittedAt?: string;        // وقت الإرسال
  errorMessage?: string;       // رسالة الخطأ إن وجدت
  etaResponse?: string;        // استجابة ETA الكاملة (JSON)
};

// روابط بيئات ETA
export const ETA_URLS: Record<ETAEnvironment, { identity: string; api: string; portal: string }> = {
  preprod: {
    identity: "https://id.preprod.eta.gov.eg",
    api: "https://api.preprod.invoicing.eta.gov.eg",
    portal: "https://preprod.invoicing.eta.gov.eg",
  },
  prod: {
    identity: "https://id.eta.gov.eg",
    api: "https://api.invoicing.eta.gov.eg",
    portal: "https://invoicing.eta.gov.eg",
  },
};

// حفظ واسترجاع الإعدادات من localStorage
const SETTINGS_KEY = "eta_config";
const RECORDS_KEY = "eta_invoice_records";

export function saveETAConfig(config: ETAConfig): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
}

export function loadETAConfig(): ETAConfig | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ETAConfig;
  } catch {
    return null;
  }
}

export function saveETARecord(record: ETAInvoiceRecord): void {
  const all = loadAllETARecords();
  const idx = all.findIndex((r) => r.saleId === record.saleId);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  localStorage.setItem(RECORDS_KEY, JSON.stringify(all));
}

export function loadAllETARecords(): ETAInvoiceRecord[] {
  const raw = localStorage.getItem(RECORDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ETAInvoiceRecord[];
  } catch {
    return [];
  }
}

export function getETARecord(saleId: string): ETAInvoiceRecord | null {
  return loadAllETARecords().find((r) => r.saleId === saleId) ?? null;
}

/** بناء payload الفاتورة بصيغة ETA JSON (Invoice v1.0) */
export function buildETAInvoicePayload(params: {
  config: ETAConfig;
  saleId: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  customerRegistrationNumber?: string;
  customerAddress?: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalAmount: number;
  discount: number;
  netAmount: number;
}): object {
  const {
    config,
    invoiceNumber,
    date,
    customerName,
    customerRegistrationNumber,
    customerAddress,
    items,
    totalAmount,
    discount,
    netAmount,
  } = params;

  const dateTimeIssued = new Date(date + "T00:00:00Z").toISOString();

  const invoiceLines = items.map((item, i) => ({
    description: item.productName,
    itemType: "GS1",
    itemCode: `ITEM-${String(i + 1).padStart(3, "0")}`,
    unitType: "EA",
    quantity: item.quantity,
    unitValue: {
      currencySold: "EGP",
      amountEGP: item.unitPrice,
    },
    salesTotal: item.total,
    discount: { rate: 0, amount: 0 },
    taxableItems: [],
    netTotal: item.total,
    taxableAmount: item.total,
    valueDifference: 0,
    totalTaxableFees: 0,
    itemsDiscount: 0,
    total: item.total,
  }));

  return {
    issuer: {
      address: {
        branchID: config.issuerBranchCode ?? "0",
        country: "EG",
        governate: "Cairo",
        regionCity: config.issuerAddress,
        street: config.issuerAddress,
        buildingNumber: "1",
        postalCode: "",
        floor: "",
        room: "",
        landmark: "",
        additionalInformation: "",
      },
      type: config.issuerType,
      id: config.issuerRegistrationNumber,
      name: config.issuerName,
    },
    receiver: {
      address: {
        country: "EG",
        governate: "Cairo",
        regionCity: customerAddress ?? "Cairo",
        street: customerAddress ?? "",
        buildingNumber: "1",
      },
      type: customerRegistrationNumber ? "B" : "P",
      id: customerRegistrationNumber ?? "N/A",
      name: customerName,
    },
    documentType: "i",
    documentTypeVersion: "1.0",
    dateTimeIssued,
    taxpayerActivityCode: config.taxpayerActivityCode,
    internalId: invoiceNumber,
    invoiceLines,
    totalDiscountAmount: discount,
    totalSalesAmount: totalAmount,
    netAmount,
    taxTotals: [],
    totalAmount: netAmount,
    extraDiscountAmount: 0,
    totalItemsDiscountAmount: discount,
  };
}

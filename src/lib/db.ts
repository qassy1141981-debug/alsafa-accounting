import Dexie, { type EntityTable } from "dexie";

// ── Types ──────────────────────────────────────────────────────────────────

export type PaymentStatus = "paid" | "partial" | "unpaid";
export type TreasuryType = "in" | "out";
export type EmployeeStatus = "active" | "inactive";
export type AttendanceStatus = "present" | "absent" | "late" | "vacation";
export type ProductionOrderStatus = "pending" | "completed" | "cancelled";
export type QualityStatus = "passed" | "failed" | "partial";
export type DeliveryStatus = "pending" | "delivered" | "partial" | "cancelled";

export type DeliveryItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
};

export type DeliveryOrder = {
  id: string;
  weekStart: string;         // تاريخ بداية الأسبوع (السبت)
  date: string;              // تاريخ التسليم الفعلي
  customerId?: string;
  customerName: string;
  driverName?: string;       // اسم السائق
  vehiclePlate?: string;     // رقم السيارة / لوحة
  items: DeliveryItem[];
  totalQuantity: number;
  status: DeliveryStatus;
  deliveryAddress?: string;
  scheduledTime?: string;    // وقت التسليم المقرر HH:mm
  notes?: string;
};

export type QualityCheck = {
  id: string;
  date: string;
  productionOrderId?: string;  // ربط بأمر الإنتاج (اختياري)
  productId: string;
  productName: string;
  batchNumber?: string;        // رقم الدفعة
  quantityProduced: number;
  quantityPassed: number;
  quantityFailed: number;
  defectTypes: string[];       // أنواع العيوب المكتشفة
  inspector?: string;          // اسم المفتش
  notes?: string;
  status: QualityStatus;
};

export type CompanySettings = {
  id: "company";
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyLogo: string;
  taxNumber?: string;
  email?: string;
  currency: string;
};

export type RawMaterial = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock?: number;
  price?: number;
  notes?: string;
};

export type Product = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock?: number;
  price?: number;
  costPrice?: number;
  notes?: string;
  weight?: number;
};

export type Supplier = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  balance: number;
};

export type Collection = {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  amount: number;
  method?: string;
  notes?: string;
  reference?: string;
};

export type PurchaseItem = {
  materialId: string;
  materialName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Purchase = {
  id: string;
  date: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string;
};

export type SaleItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Sale = {
  id: string;
  date: string;
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  items: SaleItem[];
  totalAmount: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string;
};

export type TreasuryEntry = {
  id: string;
  date: string;
  type: TreasuryType;
  category: string;
  amount: number;
  description: string;
  reference?: string;
  balanceAfter: number;
};

export type Partner = {
  id: string;
  name: string;
  sharePercent: number; // النسبة المئوية من الأرباح
  phone?: string;
  notes?: string;
};

export type ProfitDistributionItem = {
  partnerId: string;
  partnerName: string;
  sharePercent: number;
  amount: number;
};

export type ProfitDistribution = {
  id: string;
  date: string;
  fromDate: string;
  toDate: string;
  totalProfit: number;
  items: ProfitDistributionItem[];
  notes?: string;
};

export type Expense = {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  reference?: string;
  notes?: string;
};

export type Employee = {
  id: string;
  name: string;
  nationalId?: string;
  phone?: string;
  address?: string;
  position?: string;
  baseSalary: number;
  hireDate: string;
  status: EmployeeStatus;
  notes?: string;
};

export type Attendance = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatus;
  hoursWorked?: number;
  overtime?: number;
  notes?: string;
};

export type SalaryPayment = {
  id: string;
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  baseSalary: number;
  deductions: number;
  bonuses: number;
  netSalary: number;
  paidAt: string;
  notes?: string;
};

export type ProductionMaterial = {
  materialId: string;
  materialName: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export type ProductionCostCategory =
  | "labor"         // عمالة
  | "energy"        // طاقة / وقود
  | "packaging"     // تغليف
  | "maintenance"   // صيانة
  | "transport"     // نقل
  | "overhead"      // مصاريف عامة
  | "other";        // أخرى

export const PRODUCTION_COST_LABELS: Record<ProductionCostCategory, string> = {
  labor:       "أجور عمالة",
  energy:      "طاقة / وقود",
  packaging:   "تغليف",
  maintenance: "صيانة",
  transport:   "نقل وشحن",
  overhead:    "مصاريف عامة",
  other:       "أخرى",
};

export type ProductionCost = {
  category: ProductionCostCategory;
  description: string;
  amount: number;
};

export type ProductionOrder = {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  materialsUsed: ProductionMaterial[];
  laborCost?: number;           // محفوظ للتوافق مع البيانات القديمة
  additionalCosts?: ProductionCost[];  // التكاليف الإضافية المتعددة الجديدة
  notes?: string;
  status: ProductionOrderStatus;
  completedAt?: string;
};

export type UserRole = "admin" | "accountant" | "warehouse" | "sales_rep" | "readonly";

export type AppUser = {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
};

export type LocalBackup = {
  id: string;
  createdAt: string;       // ISO timestamp
  label: string;           // وصف اختياري
  sizeBytes: number;       // حجم البيانات
  recordCount: number;     // عدد السجلات الكلي
  data: string;            // JSON المضغوط للبيانات
};

// ── Database ───────────────────────────────────────────────────────────────

export class AccountingDB extends Dexie {
  settings!: EntityTable<CompanySettings, "id">;
  rawMaterials!: EntityTable<RawMaterial, "id">;
  products!: EntityTable<Product, "id">;
  suppliers!: EntityTable<Supplier, "id">;
  customers!: EntityTable<Customer, "id">;
  collections!: EntityTable<Collection, "id">;
  purchases!: EntityTable<Purchase, "id">;
  sales!: EntityTable<Sale, "id">;
  treasury!: EntityTable<TreasuryEntry, "id">;
  expenses!: EntityTable<Expense, "id">;
  employees!: EntityTable<Employee, "id">;
  attendance!: EntityTable<Attendance, "id">;
  salaryPayments!: EntityTable<SalaryPayment, "id">;
  productionOrders!: EntityTable<ProductionOrder, "id">;
  partners!: EntityTable<Partner, "id">;
  profitDistributions!: EntityTable<ProfitDistribution, "id">;
  appUsers!: EntityTable<AppUser, "id">;
  backups!: EntityTable<LocalBackup, "id">;
  qualityChecks!: EntityTable<QualityCheck, "id">;
  deliveryOrders!: EntityTable<DeliveryOrder, "id">;

  constructor() {
    super("AccountingSystem");
    // Version 1: الجداول الأساسية
    this.version(1).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
    });
    // Version 2: إضافة جداول العمالة والإنتاج
    this.version(2).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
    });
    // Version 3: تأكيد وجود جميع الجداول (للمستخدمين الذين لديهم v1 مباشرة)
    this.version(3).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
    });
    // Version 4: إضافة جداول الشركاء وتوزيع الأرباح
    this.version(4).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
      partners: "id, name",
      profitDistributions: "id, date",
    });
    // Version 5: إضافة جدول مستخدمي التطبيق (نظام الصلاحيات)
    this.version(5).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
      partners: "id, name",
      profitDistributions: "id, date",
      appUsers: "id, username",
    });
    // Version 6: إضافة جدول النسخ الاحتياطية المحلية (مخزنة داخل IndexedDB)
    this.version(6).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
      partners: "id, name",
      profitDistributions: "id, date",
      appUsers: "id, username",
      backups: "id, createdAt",
    });
    // Version 7: إضافة جدول فحوصات الجودة
    this.version(7).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
      partners: "id, name",
      profitDistributions: "id, date",
      appUsers: "id, username",
      backups: "id, createdAt",
      qualityChecks: "id, date, productId, status",
    });
    // Version 8: إضافة جدول طلبيات التوزيع الأسبوعي وحركة السيارات
    this.version(8).stores({
      settings: "id",
      rawMaterials: "id, name",
      products: "id, name",
      suppliers: "id, name",
      customers: "id, name",
      collections: "id, date, customerId",
      purchases: "id, date, supplierId",
      sales: "id, date, customerId, invoiceNumber",
      treasury: "id, date, type",
      expenses: "id, date, category",
      employees: "id, name, status",
      attendance: "id, date, employeeId",
      salaryPayments: "id, employeeId, year, month",
      productionOrders: "id, date, productId, status",
      partners: "id, name",
      profitDistributions: "id, date",
      appUsers: "id, username",
      backups: "id, createdAt",
      qualityChecks: "id, date, productId, status",
      deliveryOrders: "id, date, weekStart, customerId, status",
    });
  }
}

export const db = new AccountingDB();

// ── Default seed data ──────────────────────────────────────────────────────

export async function seedDefaultData() {
  const [matCount, prodCount] = await Promise.all([
    db.rawMaterials.count(),
    db.products.count(),
  ]);

  if (matCount === 0) {
    await db.rawMaterials.bulkAdd([
      { id: crypto.randomUUID(), name: "كاوية", unit: "كيلو", currentStock: 0, minStock: 10 },
      { id: crypto.randomUUID(), name: "ملح", unit: "كيلو", currentStock: 0, minStock: 10 },
      { id: crypto.randomUUID(), name: "صودا", unit: "كيلو", currentStock: 0, minStock: 10 },
      { id: crypto.randomUUID(), name: "ماء أكسجين", unit: "كيلو", currentStock: 0, minStock: 5 },
      { id: crypto.randomUUID(), name: "كلور", unit: "كيلو", currentStock: 0, minStock: 10 },
      { id: crypto.randomUUID(), name: "حامض هيدروكلوريك", unit: "لتر", currentStock: 0, minStock: 5 },
      { id: crypto.randomUUID(), name: "عبوات بلاستيك", unit: "قطعة", currentStock: 0, minStock: 50 },
      { id: crypto.randomUUID(), name: "برشام", unit: "كيلو", currentStock: 0, minStock: 5 },
    ]);
  }

  if (prodCount === 0) {
    await db.products.bulkAdd([
      { id: crypto.randomUUID(), name: "كلور سائل", unit: "جمدانة", currentStock: 0, minStock: 5, price: 0, costPrice: 0 },
      { id: crypto.randomUUID(), name: "ماء جافيل", unit: "جمدانة", currentStock: 0, minStock: 5, price: 0, costPrice: 0 },
      { id: crypto.randomUUID(), name: "كاوية سائلة", unit: "جمدانة", currentStock: 0, minStock: 5, price: 0, costPrice: 0 },
      { id: crypto.randomUUID(), name: "مطهر", unit: "جمدانة", currentStock: 0, minStock: 5, price: 0, costPrice: 0 },
    ]);
  }
}

// ── Treasury helpers ───────────────────────────────────────────────────────

/**
 * الرصيد الحقيقي = مجموع كل الوارد − مجموع كل الصادر
 * لا نعتمد على balanceAfter لأنه يفشل عند إضافة حركات بتواريخ غير متسلسلة
 */
export async function getCurrentTreasuryBalance(): Promise<number> {
  const all = await db.treasury.toArray();
  return all.reduce((sum, e) => (e.type === "in" ? sum + e.amount : sum - e.amount), 0);
}

export async function addTreasuryEntry(
  entry: Omit<TreasuryEntry, "id" | "balanceAfter">,
): Promise<TreasuryEntry> {
  // نحسب الرصيد التراكمي الصحيح حتى تاريخ هذه الحركة (مرتّبة بالتاريخ)
  const allSorted = await db.treasury.orderBy("date").toArray();
  // نجمع كل السجلات التي تاريخها أقدم أو مساوٍ لتاريخ الحركة الجديدة
  let runningBalance = allSorted
    .filter((e) => e.date <= entry.date)
    .reduce((sum, e) => (e.type === "in" ? sum + e.amount : sum - e.amount), 0);
  // ثم نضيف الحركة الجديدة
  runningBalance = entry.type === "in"
    ? runningBalance + entry.amount
    : runningBalance - entry.amount;

  const full: TreasuryEntry = {
    id: crypto.randomUUID(),
    balanceAfter: runningBalance,
    ...entry,
  };
  await db.treasury.add(full);
  return full;
}

// ── Invoice number helper ──────────────────────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  const count = await db.sales.count();
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

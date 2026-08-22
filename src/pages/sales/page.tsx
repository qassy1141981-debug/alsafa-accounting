import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { db, type Sale, type SaleItem, addTreasuryEntry, getNextInvoiceNumber } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Plus, Trash2, Receipt, Printer, Pencil, FileDown, ClipboardList, MessageSquare, FileText, CheckCircle, XCircle, Clock, RefreshCw, Send } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";
import WeeklyOrdersTab from "./_components/WeeklyOrdersTab.tsx";
import { buildInvoiceMessage, openWhatsApp, openWhatsAppBusiness } from "@/lib/whatsapp.ts";
import {
  loadETAConfig,
  getETARecord,
  saveETARecord,
  loadAllETARecords,
  buildETAInvoicePayload,
  type ETAInvoiceRecord,
} from "@/lib/eta.ts";
import { cn } from "@/lib/utils.ts";

type FormItem = SaleItem;
const emptyItem = (): FormItem => ({ productId: "", productName: "", quantity: 1, unitPrice: 0, total: 0 });

const statusLabel: Record<Sale["paymentStatus"], string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
const statusColor: Record<Sale["paymentStatus"], string> = { paid: "text-green-600", partial: "text-orange-600", unpaid: "text-red-600" };

type FormState = {
  customerId: string;
  customerName: string;
  date: string;
  items: FormItem[];
  discount: number;
  paidAmount: number;
  notes: string;
};

const defaultForm = (): FormState => ({
  customerId: "",
  customerName: "",
  date: new Date().toISOString().slice(0, 10),
  items: [emptyItem()],
  discount: 0,
  paidAmount: 0,
  notes: "",
});

type MainTab = "invoices" | "weekly-orders";

export default function Sales() {
  const [mainTab, setMainTab] = useState<MainTab>("invoices");
  const [open, setOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [whatsappSale, setWhatsappSale] = useState<Sale | null>(null);
  const [whatsappMsg, setWhatsappMsg] = useState("");

  // ETA Integration
  const submitETAAction = useAction(api.eta.submitInvoice);
  const [etaRecords, setEtaRecords] = useState<ETAInvoiceRecord[]>(loadAllETARecords);
  const [etaLoading, setEtaLoading] = useState<string | null>(null);

  const reloadEtaRecords = useCallback(() => setEtaRecords(loadAllETARecords()), []);
  const getEtaRecord = useCallback(
    (saleId: string) => etaRecords.find((r) => r.saleId === saleId),
    [etaRecords]
  );

  const handleETASubmit = async (s: Sale) => {
    const config = loadETAConfig();
    if (!config) {
      toast.error("يجب إعداد بيانات ETA أولاً — اذهب إلى صفحة الفاتورة الإلكترونية");
      return;
    }
    const customer = (customers ?? []).find((c) => c.id === s.customerId);
    setEtaLoading(s.id);
    try {
      const payload = buildETAInvoicePayload({
        config,
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        date: s.date,
        customerName: s.customerName,
        customerAddress: customer?.address,
        items: s.items,
        totalAmount: s.totalAmount,
        discount: s.discount,
        netAmount: s.netAmount,
      });
      const result = await submitETAAction({
        environment: config.environment,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        invoicePayload: JSON.stringify(payload),
      });
      const record: ETAInvoiceRecord = {
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        status: result.success ? "submitted" : "invalid",
        submissionId: result.submissionId,
        uuid: result.uuid,
        longId: result.longId,
        hashKey: result.hashKey,
        submittedAt: new Date().toISOString(),
        errorMessage: result.errorMessage,
        etaResponse: result.rawResponse,
      };
      saveETARecord(record);
      reloadEtaRecords();
      if (result.success) {
        toast.success(`✅ تم إرسال الفاتورة ${s.invoiceNumber} لمصلحة الضرائب`);
      } else {
        toast.error(`فشل الإرسال: ${result.errorMessage}`);
      }
    } catch {
      toast.error("خطأ غير متوقع أثناء الإرسال لـ ETA");
    } finally {
      setEtaLoading(null);
    }
  };
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [form, setForm] = useState<FormState>(defaultForm());
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustForm, setNewCustForm] = useState({ name: "", phone: "" });

  const handleAddNewCustomer = async () => {
    if (!newCustForm.name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    const id = crypto.randomUUID();
    await db.customers.add({ id, name: newCustForm.name.trim(), phone: newCustForm.phone || undefined, balance: 0 });
    setForm({ ...form, customerId: id, customerName: newCustForm.name.trim() });
    setNewCustForm({ name: "", phone: "" });
    setNewCustOpen(false);
    toast.success("تمت إضافة العميل");
  };

  const sales = useLiveQuery(() => db.sales.orderBy("date").reverse().toArray(), []);
  const customers = useLiveQuery(() => db.customers.orderBy("name").toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), []);

  const filtered = sales?.filter((s) =>
    !search || s.customerName.includes(search) || s.invoiceNumber.includes(search),
  );

  const totalAmount = form.items.reduce((sum, i) => sum + i.total, 0);
  const netAmount = Math.max(0, totalAmount - form.discount);
  const remainingAmount = Math.max(0, netAmount - form.paidAmount);
  const paymentStatus: Sale["paymentStatus"] =
    form.paidAmount >= netAmount && netAmount > 0 ? "paid" : form.paidAmount > 0 ? "partial" : "unpaid";

  // التحقق من كفاية المخزون لكل صنف في الفاتورة الحالية
  const stockWarnings = form.items
    .filter((i) => i.productId && i.quantity > 0)
    .map((item) => {
      const prod = products?.find((p) => p.id === item.productId);
      if (!prod) return null;
      // عند التعديل: أرجع الكمية القديمة أولاً
      const oldQty = editingSale
        ? (editingSale.items.find((oi) => oi.productId === item.productId)?.quantity ?? 0)
        : 0;
      const available = prod.currentStock + oldQty;
      if (item.quantity > available) {
        return { name: prod.name, requested: item.quantity, available, unit: prod.unit };
      }
      return null;
    })
    .filter(Boolean) as { name: string; requested: number; available: number; unit: string }[];

  const updateItem = (idx: number, field: keyof FormItem, value: string | number) => {
    const items = [...form.items];
    const item = { ...items[idx], [field]: value };
    if (field === "productId") {
      const prod = products?.find((p) => p.id === String(value));
      item.productName = prod?.name ?? "";
      item.unitPrice = prod?.price ?? 0;
      item.total = item.quantity * item.unitPrice;
    }
    if (field === "quantity" || field === "unitPrice") {
      item.total = item.quantity * item.unitPrice;
    }
    items[idx] = item;
    setForm({ ...form, items });
  };

  // إلغاء الصفر عند التركيز على خانة رقمية
  const handleNumFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const addItem = () => setForm({ ...form, items: [...form.items, emptyItem()] });
  const removeItem = (idx: number) => {
    if (form.items.length === 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const openNew = () => {
    setEditingSale(null);
    setForm(defaultForm());
    setOpen(true);
  };

  const openEdit = (sale: Sale) => {
    setEditingSale(sale);
    setForm({
      customerId: sale.customerId ?? "",
      customerName: sale.customerName,
      date: sale.date.slice(0, 10),
      items: sale.items.map((i) => ({ ...i })),
      discount: sale.discount,
      paidAmount: sale.paidAmount,
      notes: sale.notes ?? "",
    });
    setOpen(true);
  };

  // ── حفظ فاتورة جديدة ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.customerName.trim()) { toast.error("اسم العميل مطلوب"); return; }
    if (form.items.some((i) => !i.productId || i.quantity <= 0)) { toast.error("يرجى تحديد المنتجات والكميات"); return; }

    // ── التحقق من المخزون ──
    if (stockWarnings.length > 0) {
      const msg = stockWarnings.map((w) => `• ${w.name}: مطلوب ${w.requested} ${w.unit}، المتاح ${w.available} ${w.unit}`).join("\n");
      toast.error(`رصيد المخزن لا يكفي:\n${msg}`, { duration: 6000 });
      return;
    }

    try {
      const invoiceNumber = await getNextInvoiceNumber();
      const sale: Sale = {
        id: crypto.randomUUID(),
        date: new Date(form.date).toISOString(),
        invoiceNumber,
        customerId: form.customerId || undefined,
        customerName: form.customerName,
        items: form.items,
        totalAmount,
        discount: form.discount,
        netAmount,
        paidAmount: form.paidAmount,
        remainingAmount,
        paymentStatus,
        notes: form.notes || undefined,
      };
      await db.sales.add(sale);

      // خصم من المخزون
      for (const item of form.items) {
        if (item.productId) {
          const prod = await db.products.get(item.productId);
          if (prod) await db.products.update(item.productId, { currentStock: Math.max(0, prod.currentStock - item.quantity) });
        }
      }

      // تحديث رصيد العميل
      if (form.customerId && remainingAmount > 0) {
        const customer = await db.customers.get(form.customerId);
        if (customer) await db.customers.update(form.customerId, { balance: customer.balance + remainingAmount });
      }

      // تسجيل في الخزنة
      if (form.paidAmount > 0) {
        await addTreasuryEntry({
          date: new Date(form.date).toISOString(),
          type: "in",
          category: "مبيعات",
          amount: form.paidAmount,
          description: `فاتورة مبيعات ${invoiceNumber} - ${form.customerName}`,
          reference: sale.id,
        });
      }

      toast.success(`تمت إضافة الفاتورة ${invoiceNumber}`);
      setOpen(false);
      setForm(defaultForm());
    } catch { toast.error("حدث خطأ أثناء الحفظ"); }
  };

  // ── تعديل فاتورة موجودة ───────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editingSale) return;
    if (!form.customerName.trim()) { toast.error("اسم العميل مطلوب"); return; }
    if (form.items.some((i) => !i.productId || i.quantity <= 0)) { toast.error("يرجى تحديد المنتجات والكميات"); return; }

    // ── التحقق من المخزون (عند التعديل) ──
    if (stockWarnings.length > 0) {
      const msg = stockWarnings.map((w) => `• ${w.name}: مطلوب ${w.requested} ${w.unit}، المتاح ${w.available} ${w.unit}`).join("\n");
      toast.error(`رصيد المخزن لا يكفي:\n${msg}`, { duration: 6000 });
      return;
    }

    try {
      const oldItems = editingSale.items;
      const newItems = form.items;

      // حساب الفرق في المخزون لكل منتج
      const stockDiff = new Map<string, number>(); // productId → فرق الكمية (+يعني إرجاع، - يعني خصم)

      // أرجع كميات الأصناف القديمة
      for (const old of oldItems) {
        if (old.productId) {
          stockDiff.set(old.productId, (stockDiff.get(old.productId) ?? 0) + old.quantity);
        }
      }
      // اخصم كميات الأصناف الجديدة
      for (const nw of newItems) {
        if (nw.productId) {
          stockDiff.set(nw.productId, (stockDiff.get(nw.productId) ?? 0) - nw.quantity);
        }
      }

      // طبّق الفرق على المخزون
      for (const [productId, diff] of stockDiff.entries()) {
        const prod = await db.products.get(productId);
        if (prod) {
          await db.products.update(productId, { currentStock: Math.max(0, prod.currentStock + diff) });
        }
      }

      // تحديث رصيد العميل: أرجع الرصيد القديم ثم سجّل الجديد
      if (editingSale.customerId) {
        const customer = await db.customers.get(editingSale.customerId);
        if (customer) {
          await db.customers.update(editingSale.customerId, {
            balance: Math.max(0, customer.balance - editingSale.remainingAmount),
          });
        }
      }
      if (form.customerId && remainingAmount > 0) {
        const customer = await db.customers.get(form.customerId);
        if (customer) await db.customers.update(form.customerId, { balance: customer.balance + remainingAmount });
      }

      // تحديث الفاتورة
      const updated: Sale = {
        ...editingSale,
        date: new Date(form.date).toISOString(),
        customerId: form.customerId || undefined,
        customerName: form.customerName,
        items: newItems,
        totalAmount,
        discount: form.discount,
        netAmount,
        paidAmount: form.paidAmount,
        remainingAmount,
        paymentStatus,
        notes: form.notes || undefined,
      };
      await db.sales.put(updated);

      // تحديث الخزنة: احذف السجل القديم وأضف الجديد إذا اختلف المدفوع
      const oldTreasury = await db.treasury.where("reference").equals(editingSale.id).first();
      if (oldTreasury) await db.treasury.delete(oldTreasury.id);
      if (form.paidAmount > 0) {
        await addTreasuryEntry({
          date: new Date(form.date).toISOString(),
          type: "in",
          category: "مبيعات",
          amount: form.paidAmount,
          description: `فاتورة مبيعات ${editingSale.invoiceNumber} - ${form.customerName}`,
          reference: editingSale.id,
        });
      }

      toast.success("تم تحديث الفاتورة بنجاح");
      setOpen(false);
      setEditingSale(null);
      setForm(defaultForm());
    } catch { toast.error("حدث خطأ أثناء التحديث"); }
  };

  // ── حذف فاتورة ────────────────────────────────────────────────────────────
  const handleDelete = async (sale: Sale) => {
    if (!confirm(`هل تريد حذف الفاتورة ${sale.invoiceNumber}؟ سيتم إرجاع الكميات للمخزون.`)) return;
    try {
      setDeletingId(sale.id);

      // إرجاع الكميات للمخزون
      for (const item of sale.items) {
        if (item.productId) {
          const prod = await db.products.get(item.productId);
          if (prod) await db.products.update(item.productId, { currentStock: prod.currentStock + item.quantity });
        }
      }

      // إرجاع رصيد العميل
      if (sale.customerId && sale.remainingAmount > 0) {
        const customer = await db.customers.get(sale.customerId);
        if (customer) {
          await db.customers.update(sale.customerId, {
            balance: Math.max(0, customer.balance - sale.remainingAmount),
          });
        }
      }

      // حذف سجل الخزنة المرتبط
      const tEntry = await db.treasury.where("reference").equals(sale.id).first();
      if (tEntry) await db.treasury.delete(tEntry.id);

      // حذف الفاتورة
      await db.sales.delete(sale.id);

      toast.success(`تم حذف الفاتورة ${sale.invoiceNumber} وإرجاع الكميات للمخزون`);
    } catch { toast.error("حدث خطأ أثناء الحذف"); }
    finally { setDeletingId(null); }
  };

  const buildInvoiceHTML = (s: Sale, forPdf = false) => {
    const statusAr = statusLabel[s.paymentStatus];
    const statusClr = s.paymentStatus === "paid" ? "#16a34a" : s.paymentStatus === "partial" ? "#ea580c" : "#dc2626";
    return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head>
  <meta charset="UTF-8">
  <title>فاتورة بيع ${s.invoiceNumber}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Cairo',sans-serif;background:#f0f4f8;color:#1a1a2e;font-size:13px;${forPdf ? "width:210mm;margin:0 auto;" : ""}}
    .page{background:#fff;max-width:800px;margin:${forPdf ? "0 auto" : "20px auto"};padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.10);border-radius:12px}

    /* ── رأس الفاتورة ── */
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1e2a4a;margin-bottom:24px}
    .company-info{display:flex;align-items:center;gap:14px}
    .company-logo{width:72px;height:72px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0}
    .logo-placeholder{width:72px;height:72px;background:#1e2a4a;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800}
    .company-name{font-size:20px;font-weight:800;color:#1e2a4a;margin-bottom:4px}
    .company-detail{font-size:12px;color:#64748b;line-height:1.8}
    .invoice-badge{text-align:left;direction:ltr}
    .invoice-title{font-size:28px;font-weight:800;color:#1e2a4a;letter-spacing:-0.5px}
    .invoice-num{font-size:15px;color:#3b82f6;font-weight:700;margin-top:4px}
    .invoice-date{font-size:12px;color:#64748b;margin-top:4px}

    /* ── بيانات العميل ── */
    .client-section{display:flex;justify-content:space-between;align-items:stretch;gap:16px;margin-bottom:24px}
    .client-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-right:4px solid #1e2a4a;border-radius:8px;padding:14px 16px}
    .status-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;text-align:center;min-width:130px;display:flex;flex-direction:column;justify-content:center;gap:6px}
    .box-label{font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
    .client-name{font-size:16px;font-weight:700;color:#1e2a4a}
    .status-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;color:${statusClr};background:${statusClr}18;border:1px solid ${statusClr}40}

    /* ── جدول الأصناف ── */
    .items-table{width:100%;border-collapse:collapse;margin-bottom:20px}
    .items-table thead tr{background:#1e2a4a;color:#fff}
    .items-table thead th{padding:10px 12px;text-align:right;font-size:12px;font-weight:600;letter-spacing:.3px}
    .items-table thead th:first-child{border-radius:0 6px 6px 0}
    .items-table thead th:last-child{border-radius:6px 0 0 6px;text-align:left}
    .items-table tbody tr{border-bottom:1px solid #f1f5f9;transition:background .15s}
    .items-table tbody tr:nth-child(even){background:#f8fafc}
    .items-table tbody td{padding:10px 12px;font-size:13px}
    .items-table tbody td:last-child{text-align:left;font-weight:600;color:#1e2a4a}
    .items-table tfoot tr{background:#eff6ff;font-weight:700}
    .items-table tfoot td{padding:10px 12px;border-top:2px solid #bfdbfe}

    /* ── ملخص الإجماليات ── */
    .totals-section{display:flex;justify-content:flex-start;margin-bottom:24px}
    .totals-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;min-width:260px}
    .totals-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px dashed #e2e8f0}
    .totals-row:last-child{border-bottom:none}
    .totals-row.net{font-size:16px;font-weight:800;color:#1e2a4a;padding-top:10px;margin-top:4px}
    .totals-row.paid{color:#16a34a;font-weight:700}
    .totals-row.remaining{color:#dc2626;font-weight:700}

    /* ── ملاحظات + توقيع ── */
    .bottom-section{display:flex;justify-content:space-between;gap:20px;margin-bottom:24px}
    .notes-box{flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px}
    .notes-title{font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px}
    .sign-box{min-width:180px;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 14px;text-align:center}
    .sign-line{margin-top:36px;border-top:1px solid #cbd5e1;padding-top:6px;font-size:11px;color:#94a3b8}

    /* ── تذييل ── */
    .footer{border-top:2px solid #1e2a4a;padding-top:14px;display:flex;justify-content:space-between;align-items:center}
    .footer-text{font-size:11px;color:#94a3b8}
    .footer-brand{font-size:11px;color:#1e2a4a;font-weight:700}

    @media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0;padding:20px}}
  </style>
</head><body>
<div class="page">

  <!-- رأس الفاتورة -->
  <div class="header">
    <div class="company-info">
      ${settings?.companyLogo
        ? `<img src="${settings.companyLogo}" alt="شعار" class="company-logo">`
        : `<div class="logo-placeholder">${(settings?.companyName ?? "ح").slice(0, 2)}</div>`}
      <div>
        <div class="company-name">${settings?.companyName ?? "الشركة"}</div>
        <div class="company-detail">
          ${settings?.companyAddress ? `📍 ${settings.companyAddress}<br>` : ""}
          ${settings?.companyPhone ? `📞 ${settings.companyPhone}<br>` : ""}
          ${settings?.email ? `✉️ ${settings.email}<br>` : ""}
          ${settings?.taxNumber ? `🔢 الرقم الضريبي: ${settings.taxNumber}` : ""}
        </div>
      </div>
    </div>
    <div class="invoice-badge">
      <div class="invoice-title">فاتورة بيع</div>
      <div class="invoice-num"># ${s.invoiceNumber}</div>
      <div class="invoice-date">📅 ${new Date(s.date).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
    </div>
  </div>

  <!-- بيانات العميل والحالة -->
  <div class="client-section">
    <div class="client-box">
      <div class="box-label">بيانات العميل</div>
      <div class="client-name">${s.customerName}</div>
    </div>
    <div class="status-box">
      <div class="box-label">حالة الدفع</div>
      <div class="status-badge">${statusAr}</div>
    </div>
  </div>

  <!-- جدول الأصناف -->
  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>المنتج / الصنف</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${s.items.map((item, i) => `
        <tr>
          <td style="color:#94a3b8;font-size:12px">${i + 1}</td>
          <td style="font-weight:600">${item.productName}</td>
          <td>${item.quantity.toLocaleString("ar-EG")}</td>
          <td>${item.unitPrice.toLocaleString("ar-EG")} ${currency}</td>
          <td>${item.total.toLocaleString("ar-EG")} ${currency}</td>
        </tr>`).join("")}
    </tbody>
  </table>

  <!-- الإجماليات -->
  <div class="totals-section">
    <div class="totals-card">
      <div class="totals-row"><span>المجموع الفرعي</span><span>${s.totalAmount.toLocaleString("ar-EG")} ${currency}</span></div>
      ${s.discount > 0 ? `<div class="totals-row" style="color:#ea580c"><span>الخصم</span><span>- ${s.discount.toLocaleString("ar-EG")} ${currency}</span></div>` : ""}
      <div class="totals-row net"><span>الإجمالي الصافي</span><span>${s.netAmount.toLocaleString("ar-EG")} ${currency}</span></div>
      <div class="totals-row paid"><span>المبلغ المدفوع</span><span>${s.paidAmount.toLocaleString("ar-EG")} ${currency}</span></div>
      <div class="totals-row remaining"><span>المبلغ المتبقي</span><span>${s.remainingAmount.toLocaleString("ar-EG")} ${currency}</span></div>
    </div>
  </div>

  <!-- ملاحظات وتوقيع -->
  <div class="bottom-section">
    ${s.notes ? `<div class="notes-box"><div class="notes-title">ملاحظات</div><div style="font-size:12px;color:#78350f">${s.notes}</div></div>` : `<div style="flex:1"></div>`}
    <div class="sign-box">
      <div style="font-size:11px;color:#94a3b8">توقيع المستلم</div>
      <div class="sign-line">الاسم والتوقيع</div>
    </div>
  </div>

  <!-- التذييل -->
  <div class="footer">
    <div class="footer-text">طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")}</div>
    <div class="footer-brand">${settings?.companyName ?? "النظام المحاسبي"} • شكراً لتعاملكم معنا</div>
  </div>

</div>
</body></html>`;
  };

  const printSale = (s: Sale) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildInvoiceHTML(s, false));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const openWhatsAppPreview = (s: Sale) => {
    const msg = buildInvoiceMessage({
      companyName: settings?.companyName ?? "النظام المحاسبي",
      customerName: s.customerName,
      invoiceNumber: s.invoiceNumber,
      date: s.date,
      items: s.items,
      totalAmount: s.totalAmount,
      discount: s.discount,
      netAmount: s.netAmount,
      paidAmount: s.paidAmount,
      remainingAmount: s.remainingAmount,
      currency,
    });
    setWhatsappSale(s);
    setWhatsappMsg(msg);
  };

  const exportPdf = (s: Sale) => {
    const html = buildInvoiceHTML(s, true);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        setTimeout(() => {
          win.print();
          URL.revokeObjectURL(url);
        }, 800);
      };
    }
  };

  // ── الواجهة ────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">فواتير المبيعات</h1>
        {mainTab === "invoices" && (
          <Button onClick={openNew} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
            <Plus className="w-4 h-4 ml-2" /> فاتورة بيع جديدة
          </Button>
        )}
      </div>

      {/* التبويبات الرئيسية */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setMainTab("invoices")}
          className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${mainTab === "invoices" ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Receipt className="w-4 h-4" /> الفواتير
        </button>
        <button
          onClick={() => setMainTab("weekly-orders")}
          className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${mainTab === "weekly-orders" ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <ClipboardList className="w-4 h-4" /> طلبيات الأسبوع
        </button>
      </div>

      {/* محتوى طلبيات الأسبوع */}
      {mainTab === "weekly-orders" && <WeeklyOrdersTab />}

      {/* محتوى الفواتير */}
      {mainTab === "invoices" && (<>
      <Input placeholder="بحث بالعميل أو رقم الفاتورة..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" dir="rtl" />

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
            <EmptyTitle>لا توجد فواتير مبيعات</EmptyTitle>
            <EmptyDescription>أضف أول فاتورة بيع</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openNew}>إضافة فاتورة</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">رقم الفاتورة</th>
                <th className="text-right p-3 font-semibold">التاريخ</th>
                <th className="text-right p-3 font-semibold">العميل</th>
                <th className="text-right p-3 font-semibold">الأصناف</th>
                <th className="text-right p-3 font-semibold">الصافي</th>
                <th className="text-right p-3 font-semibold">المدفوع</th>
                <th className="text-right p-3 font-semibold">المتبقي</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-center p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-bold text-blue-600">{s.invoiceNumber}</td>
                  <td className="p-3 text-muted-foreground">{new Date(s.date).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3 font-medium">{s.customerName}</td>
                  <td className="p-3 text-muted-foreground text-xs">{s.items.length} صنف</td>
                  <td className="p-3 font-bold">{s.netAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className="p-3 text-green-600">{s.paidAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className="p-3 text-red-600">{s.remainingAmount.toLocaleString("ar-EG")} {currency}</td>
                  <td className={`p-3 font-semibold ${statusColor[s.paymentStatus]}`}>{statusLabel[s.paymentStatus]}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* زر ETA */}
                      {(() => {
                        const rec = getEtaRecord(s.id);
                        const etaStatus = rec?.status ?? "unsent";
                        const isLoading = etaLoading === s.id;
                        const EtaIcon = etaStatus === "valid" ? CheckCircle
                          : etaStatus === "submitted" ? RefreshCw
                          : etaStatus === "invalid" ? XCircle
                          : etaStatus === "cancelled" ? XCircle
                          : FileText;
                        const etaColor = etaStatus === "valid"
                          ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                          : etaStatus === "invalid" || etaStatus === "cancelled"
                          ? "text-red-500 hover:text-red-700 hover:bg-red-50"
                          : etaStatus === "submitted"
                          ? "text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-100";
                        const etaTitle = etaStatus === "valid" ? "مُرسلة لـ ETA ✓"
                          : etaStatus === "submitted" ? "قيد المراجعة في ETA"
                          : etaStatus === "invalid" ? "إعادة إرسال لـ ETA"
                          : etaStatus === "cancelled" ? "ملغاة في ETA"
                          : "إرسال لمصلحة الضرائب (ETA)";
                        return (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={etaTitle}
                            disabled={isLoading || etaStatus === "valid" || etaStatus === "cancelled"}
                            onClick={() => handleETASubmit(s)}
                            className={cn("gap-1", etaColor)}
                          >
                            <EtaIcon className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                          </Button>
                        );
                      })()}
                      <Button size="sm" variant="ghost" title="إرسال عبر واتساب" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openWhatsAppPreview(s)}>
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="طباعة" onClick={() => printSale(s)}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="تصدير PDF" className="text-purple-600 hover:text-purple-700 hover:bg-purple-50" onClick={() => exportPdf(s)}>
                        <FileDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="تعديل" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="حذف" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deletingId === s.id} onClick={() => handleDelete(s)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog إضافة / تعديل */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditingSale(null); setForm(defaultForm()); } else { setOpen(v); } }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSale ? `تعديل الفاتورة ${editingSale.invoiceNumber}` : "فاتورة بيع جديدة"}</DialogTitle>
          </DialogHeader>

          {/* تحذير نقص المخزون */}
          {stockWarnings.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 space-y-1">
              <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                ⚠️ رصيد المخزن لا يكفي
              </p>
              {stockWarnings.map((w, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  • {w.name}: مطلوب <strong>{w.requested}</strong> {w.unit} — المتاح <strong>{w.available}</strong> {w.unit}
                </p>
              ))}
            </div>
          )}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>العميل</Label>
                  <button type="button" onClick={() => setNewCustOpen(true)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer">+ عميل جديد</button>
                </div>
                <Select value={form.customerId} onValueChange={(val) => {
                  const c = customers?.find((c) => c.id === val);
                  setForm({ ...form, customerId: val, customerName: c?.name ?? "" });
                }}>
                  <SelectTrigger dir="rtl"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>اسم العميل (يدوي) *</Label>
                <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value, customerId: "" })} placeholder="أو اكتب اسم العميل" dir="rtl" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="rtl" />
            </div>

            {/* الأصناف */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">الأصناف</Label>
                <Button size="sm" onClick={addItem} variant="secondary"><Plus className="w-3 h-3 ml-1" /> إضافة صنف</Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                {/* رؤوس الأعمدة */}
                <div className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 bg-muted/60 text-xs font-semibold text-muted-foreground">
                  <div className="col-span-4">المنتج / الصنف</div>
                  <div className="col-span-2 text-center">الكمية</div>
                  <div className="col-span-3 text-center">سعر البيع</div>
                  <div className="col-span-2 text-center">الإجمالي</div>
                  <div className="col-span-1" />
                </div>
                <div className="divide-y">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-2 p-2 bg-white dark:bg-card hover:bg-muted/10 transition-colors">
                      {/* سطر 1: اسم المنتج */}
                      <Select value={item.productId} onValueChange={(val) => updateItem(idx, "productId", val)}>
                        <SelectTrigger dir="rtl" className="h-10 text-sm font-medium border-2 focus:border-blue-500 w-full">
                          <SelectValue placeholder="اختر المنتج" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={p.id} disabled={p.currentStock <= 0}>
                              <span className={p.currentStock <= 0 ? "text-red-500" : ""}>
                                {p.name}
                                <span className={`text-xs mr-1 ${p.currentStock <= 0 ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                                  {p.currentStock <= 0 ? " (نفد المخزون)" : ` (متاح: ${p.currentStock} ${p.unit})`}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* سطر 2: الكمية + السعر + الإجمالي + حذف */}
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Input
                            type="number"
                            min={1}
                            placeholder="الكمية"
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value === "" ? 0 : Number(e.target.value))}
                            onFocus={handleNumFocus}
                            dir="rtl"
                            className="h-10 text-sm font-semibold text-center border-2 focus:border-blue-500"
                          />
                          <span className="text-[10px] text-muted-foreground block text-center mt-0.5">الكمية</span>
                        </div>
                        <div className="flex-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="سعر البيع"
                            value={item.unitPrice === 0 ? "" : item.unitPrice}
                            onChange={(e) => updateItem(idx, "unitPrice", e.target.value === "" ? 0 : Number(e.target.value))}
                            onFocus={handleNumFocus}
                            dir="rtl"
                            className="h-10 text-sm font-semibold text-center border-2 focus:border-blue-500"
                          />
                          <span className="text-[10px] text-muted-foreground block text-center mt-0.5">السعر</span>
                        </div>
                        <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 h-10 min-w-[64px]">
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300 leading-tight">
                            {item.total.toLocaleString("ar-EG")}
                          </span>
                          <span className="text-[10px] text-muted-foreground leading-tight">{currency}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0 hover:bg-red-50 shrink-0" onClick={() => removeItem(idx)} disabled={form.items.length === 1}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* مجموع الأصناف */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t text-sm">
                  <span className="text-muted-foreground font-medium">مجموع الأصناف ({form.items.length} صنف)</span>
                  <span className="font-bold text-foreground">
                    {totalAmount.toLocaleString("ar-EG")} {currency}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">الخصم</Label>
                <Input
                  type="number"
                  value={form.discount === 0 ? "" : form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value === "" ? 0 : Number(e.target.value) })}
                  onFocus={handleNumFocus}
                  dir="rtl"
                  className="h-10 text-sm font-semibold border-2 focus:border-blue-500"
                  placeholder="0"
                />
              </div>
              <div className="flex items-end pb-1">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 w-full text-center border-2 border-blue-200 dark:border-blue-800">
                  <span className="text-sm text-muted-foreground">الصافي: </span>
                  <span className="font-bold text-lg text-blue-700 dark:text-blue-300">{netAmount.toLocaleString("ar-EG")} {currency}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">المبلغ المدفوع</Label>
                <Input
                  type="number"
                  value={form.paidAmount === 0 ? "" : form.paidAmount}
                  onChange={(e) => setForm({ ...form, paidAmount: e.target.value === "" ? 0 : Number(e.target.value) })}
                  onFocus={handleNumFocus}
                  dir="rtl"
                  className="h-10 text-sm font-semibold border-2 focus:border-green-500"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-semibold">المتبقي</Label>
                <div className="h-10 flex items-center px-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-md font-bold text-red-600">
                  {remainingAmount.toLocaleString("ar-EG")} {currency}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="rtl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={editingSale ? handleUpdate : handleSave}
                className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"
              >
                {editingSale ? "حفظ التعديلات" : "حفظ الفاتورة"}
              </Button>
              <Button variant="secondary" onClick={() => { setOpen(false); setEditingSale(null); setForm(defaultForm()); }} className="flex-1">
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog معاينة واتساب */}
      <Dialog open={!!whatsappSale} onOpenChange={(v) => { if (!v) { setWhatsappSale(null); setWhatsappMsg(""); } }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600" />
              إرسال الفاتورة عبر واتساب
            </DialogTitle>
          </DialogHeader>
          {whatsappSale && (() => {
            const phone = customers?.find((c) => c.id === whatsappSale.customerId)?.phone ?? "";
            return (
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">معاينة الرسالة (يمكنك التعديل)</label>
                  <textarea
                    value={whatsappMsg}
                    onChange={(e) => setWhatsappMsg(e.target.value)}
                    rows={12}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-right font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">رقم هاتف العميل</label>
                  <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/40">
                    {phone ? (
                      <span dir="ltr" className="font-mono">{phone}</span>
                    ) : (
                      <span className="text-destructive text-xs">لا يوجد رقم هاتف — أضفه من صفحة العملاء</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={!phone}
                    onClick={() => { openWhatsApp(phone, whatsappMsg); }}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    واتساب عادي
                  </Button>
                  <Button
                    disabled={!phone}
                    onClick={() => { openWhatsAppBusiness(phone, whatsappMsg); }}
                    className="gap-2 bg-green-800 hover:bg-green-900 text-white cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    واتساب بيزنس
                  </Button>
                </div>
                <div className="border-t pt-3">
                  <Button
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={() => {
                      setWhatsappSale(null);
                      setWhatsappMsg("");
                      printSale(whatsappSale);
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    طباعة الفاتورة
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      </>)}

      {/* Dialog عميل جديد */}
      <Dialog open={newCustOpen} onOpenChange={setNewCustOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>اسم العميل *</Label>
              <Input value={newCustForm.name} onChange={(e) => setNewCustForm({ ...newCustForm, name: e.target.value })} dir="rtl" placeholder="اسم العميل" />
            </div>
            <div className="space-y-1">
              <Label>رقم الهاتف</Label>
              <Input value={newCustForm.phone} onChange={(e) => setNewCustForm({ ...newCustForm, phone: e.target.value })} dir="rtl" placeholder="اختياري" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleAddNewCustomer} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">إضافة</Button>
              <Button variant="secondary" onClick={() => setNewCustOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

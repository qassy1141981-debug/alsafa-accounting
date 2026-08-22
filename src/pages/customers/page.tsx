import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Customer, type Sale, type Collection, addTreasuryEntry } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Printer, DollarSign, FileText, AlertCircle } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

const emptyForm = (): Omit<Customer, "id"> => ({ name: "", phone: undefined, address: undefined, notes: undefined, balance: 0 });

export default function Customers() {
  const [open, setOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [statOpen, setStatOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectNotes, setCollectNotes] = useState("");
  const [search, setSearch] = useState("");
  const [statFrom, setStatFrom] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [statTo, setStatTo] = useState(new Date().toISOString().slice(0, 10));
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const customers = useLiveQuery(() => db.customers.orderBy("name").toArray(), []);
  const filtered = customers?.filter(
    (c) => !search || c.name.includes(search) || (c.phone?.includes(search) ?? false),
  );

  // بيانات العميل المحدد للكشف
  const selectedSales = useLiveQuery(async () => {
    if (!selected) return [];
    return db.sales.filter((s) => s.customerId === selected.id).toArray();
  }, [selected?.id]);

  const selectedCollections = useLiveQuery(async () => {
    if (!selected) return [];
    return db.collections.filter((c) => c.customerId === selected.id).toArray();
  }, [selected?.id]);

  // حساب الكشف حسب الفترة
  const from = new Date(statFrom).toISOString();
  const to = new Date(statTo + "T23:59:59").toISOString();

  const periodSales = selectedSales?.filter((s) => s.date >= from && s.date <= to) ?? [];
  const periodCollections = selectedCollections?.filter((c) => c.date >= from && c.date <= to) ?? [];

  // بناء حركات مدمجة مرتّبة بالتاريخ
  type Movement = {
    date: string;
    type: "invoice" | "payment";
    ref: string;
    debit: number;   // مديونية (فواتير)
    credit: number;  // دفعيات
    balance: number;
  };

  const buildMovements = (sales: Sale[], collections: Collection[]): Movement[] => {
    const moves: Omit<Movement, "balance">[] = [
      ...sales.map((s) => ({
        date: s.date,
        type: "invoice" as const,
        ref: s.invoiceNumber,
        debit: s.netAmount,
        credit: s.paidAmount,
      })),
      ...collections.map((c) => ({
        date: c.date,
        type: "payment" as const,
        ref: `تحصيل`,
        debit: 0,
        credit: c.amount,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    return moves.map((m) => {
      running += m.debit - m.credit;
      return { ...m, balance: running };
    });
  };

  const movements = buildMovements(periodSales, periodCollections);
  const totalDebit = movements.reduce((s, m) => s + m.debit, 0);
  const totalCredit = movements.reduce((s, m) => s + m.credit, 0);
  const netBalance = totalDebit - totalCredit;

  // ── العمليات ──────────────────────────────────────────────────────────────

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, address: c.address, notes: c.notes, balance: c.balance });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    try {
      if (editing) {
        await db.customers.update(editing.id, form);
        toast.success("تم التحديث");
      } else {
        await db.customers.add({ id: crypto.randomUUID(), ...form });
        toast.success("تمت الإضافة");
      }
      setOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذا العميل؟")) return;
    await db.customers.delete(id);
    toast.success("تم الحذف");
  };

  // تحصيل دفعة → يُخصم من المديونية ويُضاف للخزنة
  const handleCollect = async () => {
    if (!selected || collectAmount <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    try {
      const collection = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        customerId: selected.id,
        customerName: selected.name,
        amount: collectAmount,
        notes: collectNotes || undefined,
      };
      await db.collections.add(collection);
      // تحديث رصيد المديونية
      await db.customers.update(selected.id, {
        balance: Math.max(0, selected.balance - collectAmount),
      });
      // إضافة للخزنة فوراً
      await addTreasuryEntry({
        date: new Date().toISOString(),
        type: "in",
        category: "تحصيل",
        amount: collectAmount,
        description: `تحصيل من ${selected.name}${collectNotes ? ` — ${collectNotes}` : ""}`,
        reference: collection.id,
      });
      toast.success(`تم تسجيل تحصيل ${collectAmount.toLocaleString("ar-EG")} ${currency} وإضافته للخزنة`);
      setCollectOpen(false);
      setCollectAmount(0);
      setCollectNotes("");
    } catch { toast.error("حدث خطأ أثناء التسجيل"); }
  };

  // فتح كشف الحساب
  const openStatement = (c: Customer) => {
    setSelected(c);
    setStatOpen(true);
  };

  // طباعة كشف الحساب
  const printStatement = () => {
    if (!selected) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head>
  <meta charset="UTF-8"><title>كشف حساب - ${selected.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Cairo',sans-serif;background:#f0f4f8;color:#1a1a2e;font-size:13px}
    .page{background:#fff;max-width:800px;margin:20px auto;padding:36px;box-shadow:0 4px 20px rgba(0,0,0,.1);border-radius:12px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1e2a4a;margin-bottom:20px}
    .company-logo{width:64px;height:64px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0}
    .company-name{font-size:18px;font-weight:800;color:#1e2a4a}
    .company-detail{font-size:11px;color:#64748b;line-height:1.8;margin-top:3px}
    .title-block{text-align:left}
    .title-block h2{font-size:22px;font-weight:800;color:#1e2a4a}
    .client-card{background:#f8fafc;border:1px solid #e2e8f0;border-right:4px solid #1e2a4a;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
    .client-name{font-size:16px;font-weight:700;color:#1e2a4a}
    .period{font-size:12px;color:#64748b;margin-top:3px}
    .balance-badge{font-size:15px;font-weight:800;padding:6px 16px;border-radius:20px;background:${netBalance > 0 ? "#fee2e2" : "#dcfce7"};color:${netBalance > 0 ? "#dc2626" : "#16a34a"}}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    thead tr{background:#1e2a4a;color:#fff}
    thead th{padding:9px 12px;text-align:right;font-size:12px;font-weight:600}
    thead th:first-child{border-radius:0 6px 6px 0}
    thead th:last-child{border-radius:6px 0 0 6px}
    tbody tr{border-bottom:1px solid #f1f5f9}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody td{padding:9px 12px;font-size:12px}
    tfoot tr{background:#eff6ff;font-weight:700;border-top:2px solid #bfdbfe}
    tfoot td{padding:9px 12px;font-size:13px}
    .type-invoice{color:#1e2a4a;font-weight:600}
    .type-payment{color:#16a34a;font-weight:600}
    .debit{color:#dc2626;font-weight:600}
    .credit{color:#16a34a;font-weight:600}
    .bal-pos{color:#dc2626;font-weight:700}
    .bal-zero{color:#16a34a;font-weight:700}
    .summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
    .sum-card{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center}
    .sum-label{font-size:11px;color:#94a3b8;margin-bottom:4px}
    .sum-val{font-size:16px;font-weight:800}
    .footer{border-top:2px solid #1e2a4a;padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8}
    @media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0;padding:20px}}
  </style>
</head><body>
<div class="page">
  <div class="header">
    <div style="display:flex;gap:12px;align-items:center">
      ${settings?.companyLogo ? `<img src="${settings.companyLogo}" alt="شعار" class="company-logo">` : ""}
      <div>
        <div class="company-name">${settings?.companyName ?? "الشركة"}</div>
        <div class="company-detail">
          ${settings?.companyAddress ? `📍 ${settings.companyAddress}<br>` : ""}
          ${settings?.companyPhone ? `📞 ${settings.companyPhone}` : ""}
        </div>
      </div>
    </div>
    <div class="title-block">
      <h2>كشف حساب عميل</h2>
      <div style="font-size:12px;color:#64748b;margin-top:4px">من ${statFrom} إلى ${statTo}</div>
    </div>
  </div>

  <div class="client-card">
    <div>
      <div class="client-name">${selected.name}</div>
      ${selected.phone ? `<div class="period">📞 ${selected.phone}</div>` : ""}
      <div class="period">الفترة: ${statFrom} — ${statTo}</div>
    </div>
    <div class="balance-badge">
      ${netBalance > 0 ? "مديونية" : "رصيد دائن"}: ${Math.abs(netBalance).toLocaleString("ar-EG")} ${currency}
    </div>
  </div>

  <div class="summary">
    <div class="sum-card">
      <div class="sum-label">إجمالي الفواتير</div>
      <div class="sum-val" style="color:#1e2a4a">${totalDebit.toLocaleString("ar-EG")} ${currency}</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">إجمالي المدفوع</div>
      <div class="sum-val" style="color:#16a34a">${totalCredit.toLocaleString("ar-EG")} ${currency}</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">صافي المديونية</div>
      <div class="sum-val" style="color:${netBalance > 0 ? "#dc2626" : "#16a34a"}">${netBalance.toLocaleString("ar-EG")} ${currency}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>البيان</th>
        <th>مدين (عليه)</th>
        <th>دائن (له)</th>
        <th>الرصيد التراكمي</th>
      </tr>
    </thead>
    <tbody>
      ${movements.map((m) => `
        <tr>
          <td>${new Date(m.date).toLocaleDateString("ar-EG")}</td>
          <td class="${m.type === "invoice" ? "type-invoice" : "type-payment"}">
            ${m.type === "invoice" ? `فاتورة ${m.ref}` : "تحصيل دفعة"}
          </td>
          <td class="debit">${m.debit > 0 ? m.debit.toLocaleString("ar-EG") + " " + currency : "—"}</td>
          <td class="credit">${m.credit > 0 ? m.credit.toLocaleString("ar-EG") + " " + currency : "—"}</td>
          <td class="${m.balance > 0 ? "bal-pos" : "bal-zero"}">${m.balance.toLocaleString("ar-EG")} ${currency}</td>
        </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">الإجمالي</td>
        <td>${totalDebit.toLocaleString("ar-EG")} ${currency}</td>
        <td>${totalCredit.toLocaleString("ar-EG")} ${currency}</td>
        <td style="color:${netBalance > 0 ? "#dc2626" : "#16a34a"}">${netBalance.toLocaleString("ar-EG")} ${currency}</td>
      </tr>
    </tfoot>
  </table>

  ${movements.length === 0 ? `<p style="text-align:center;color:#94a3b8;padding:20px">لا توجد حركات في هذه الفترة</p>` : ""}

  <div class="footer">
    <span>طُبع بتاريخ: ${new Date().toLocaleDateString("ar-EG")}</span>
    <span>${settings?.companyName ?? "النظام المحاسبي"} • كشف حساب عميل</span>
  </div>
</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ── الواجهة ───────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">العملاء</h1>
        <Button onClick={openAdd} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
          <Plus className="w-4 h-4 ml-2" /> إضافة عميل
        </Button>
      </div>

      <Input
        placeholder="بحث بالاسم أو الهاتف..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        dir="rtl"
      />

      {/* ملخص المديونيات */}
      {customers && customers.some((c) => c.balance > 0) && (
        <Card className="border-0 shadow-sm bg-red-50 dark:bg-red-900/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                إجمالي المديونيات: {" "}
                {customers.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0).toLocaleString("ar-EG")} {currency}
              </span>
              <span className="text-xs text-muted-foreground mr-2">
                ({customers.filter((c) => c.balance > 0).length} عملاء لديهم رصيد متأخر)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!filtered || filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>لا يوجد عملاء</EmptyTitle>
            <EmptyDescription>أضف أول عميل للبدء</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openAdd}>إضافة عميل</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-right p-3 font-semibold">اسم العميل</th>
                <th className="text-right p-3 font-semibold">الهاتف</th>
                <th className="text-right p-3 font-semibold">المديونية</th>
                <th className="text-center p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <div className="font-medium">{c.name}</div>
                    {c.address && <div className="text-xs text-muted-foreground">{c.address}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="p-3">
                    {c.balance > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-bold text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {c.balance.toLocaleString("ar-EG")} {currency}
                      </span>
                    ) : (
                      <span className="text-green-600 text-xs font-semibold">لا توجد مديونية</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <Button size="sm" variant="ghost" title="تعديل" onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title={`تحصيل دفعة${c.balance > 0 ? ` (مديونية: ${c.balance.toLocaleString("ar-EG")} ${currency})` : ""}`}
                        onClick={() => { setSelected(c); setCollectOpen(true); }}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="كشف حساب"
                        onClick={() => openStatement(c)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="حذف"
                        onClick={() => handleDelete(c.id)}
                      >
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

      {/* Dialog إضافة / تعديل عميل */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editing ? "تعديل العميل" : "إضافة عميل"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>اسم العميل *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" placeholder="مثال: محمد أحمد" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الهاتف</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })} dir="rtl" placeholder="01xxxxxxxxx" />
              </div>
              <div className="space-y-1">
                <Label>رصيد مبدئي</Label>
                <Input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editing ? "حفظ" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog تحصيل دفعة */}
      <Dialog open={collectOpen} onOpenChange={(v) => { if (!v) { setCollectOpen(false); setCollectAmount(0); setCollectNotes(""); } }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>تحصيل دفعة — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {selected && selected.balance > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    المديونية الحالية: {selected.balance.toLocaleString("ar-EG")} {currency}
                  </p>
                  <p className="text-xs text-muted-foreground">سيتم خصم المبلغ المحصّل وإضافته للخزنة</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>المبلغ المحصّل *</Label>
              <Input
                type="number"
                min={1}
                value={collectAmount || ""}
                onChange={(e) => setCollectAmount(Number(e.target.value))}
                dir="rtl"
                placeholder="0"
                className="text-lg font-bold text-center"
              />
            </div>
            {selected && collectAmount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المديونية قبل</span>
                  <span className="font-bold text-red-600">{selected.balance.toLocaleString("ar-EG")} {currency}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">بعد التحصيل</span>
                  <span className="font-bold text-green-600">{Math.max(0, selected.balance - collectAmount).toLocaleString("ar-EG")} {currency}</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={collectNotes} onChange={(e) => setCollectNotes(e.target.value)} dir="rtl" placeholder="اختياري" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleCollect} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                <DollarSign className="w-4 h-4 ml-2" /> تسجيل وإضافة للخزنة
              </Button>
              <Button variant="secondary" onClick={() => setCollectOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog كشف الحساب */}
      <Dialog open={statOpen} onOpenChange={(v) => { if (!v) setStatOpen(false); }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1e2a4a]" />
              كشف حساب — {selected?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* فلتر الفترة */}
            <div className="flex items-center gap-3 flex-wrap bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">من:</Label>
                <Input type="date" value={statFrom} onChange={(e) => setStatFrom(e.target.value)} className="w-38 h-8" dir="rtl" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">إلى:</Label>
                <Input type="date" value={statTo} onChange={(e) => setStatTo(e.target.value)} className="w-38 h-8" dir="rtl" />
              </div>
              <Button onClick={printStatement} size="sm" className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white mr-auto">
                <Printer className="w-3.5 h-3.5 ml-2" /> طباعة
              </Button>
            </div>

            {/* ملخص */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-0 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">إجمالي الفواتير</p>
                  <p className="font-bold text-[#1e2a4a] dark:text-blue-300">{totalDebit.toLocaleString("ar-EG")} {currency}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-green-50 dark:bg-green-900/20 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">إجمالي المدفوع</p>
                  <p className="font-bold text-green-700 dark:text-green-400">{totalCredit.toLocaleString("ar-EG")} {currency}</p>
                </CardContent>
              </Card>
              <Card className={`border-0 shadow-sm ${netBalance > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{netBalance > 0 ? "المديونية" : "رصيد دائن"}</p>
                  <p className={`font-bold ${netBalance > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                    {Math.abs(netBalance).toLocaleString("ar-EG")} {currency}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* جدول الحركات */}
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e2a4a] text-white">
                    <th className="text-right p-3 font-semibold">التاريخ</th>
                    <th className="text-right p-3 font-semibold">البيان</th>
                    <th className="text-right p-3 font-semibold">مدين</th>
                    <th className="text-right p-3 font-semibold">دائن</th>
                    <th className="text-right p-3 font-semibold">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد حركات في هذه الفترة</td></tr>
                  ) : (
                    movements.map((m, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-muted-foreground text-xs">{new Date(m.date).toLocaleDateString("ar-EG")}</td>
                        <td className="p-3">
                          <span className={`font-medium ${m.type === "invoice" ? "text-[#1e2a4a] dark:text-blue-300" : "text-green-600"}`}>
                            {m.type === "invoice" ? `📄 فاتورة ${m.ref}` : "💵 تحصيل دفعة"}
                          </span>
                        </td>
                        <td className="p-3 text-red-600 font-semibold">
                          {m.debit > 0 ? `${m.debit.toLocaleString("ar-EG")} ${currency}` : "—"}
                        </td>
                        <td className="p-3 text-green-600 font-semibold">
                          {m.credit > 0 ? `${m.credit.toLocaleString("ar-EG")} ${currency}` : "—"}
                        </td>
                        <td className={`p-3 font-bold ${m.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                          {m.balance.toLocaleString("ar-EG")} {currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {movements.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/40 font-bold border-t-2">
                      <td className="p-3" colSpan={2}>الإجمالي</td>
                      <td className="p-3 text-red-600">{totalDebit.toLocaleString("ar-EG")} {currency}</td>
                      <td className="p-3 text-green-600">{totalCredit.toLocaleString("ar-EG")} {currency}</td>
                      <td className={`p-3 ${netBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {netBalance.toLocaleString("ar-EG")} {currency}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

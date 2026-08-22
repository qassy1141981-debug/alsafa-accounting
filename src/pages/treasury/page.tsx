import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, addTreasuryEntry } from "@/lib/db.ts";
import type { Partner, ProfitDistribution } from "@/lib/db.ts";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown, Vault, Trash2, Users, PieChart, ChevronDown, ChevronUp } from "lucide-react";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

const IN_CATEGORIES = ["مبيعات", "تحصيل", "قروض", "إيراد متنوع", "رأس مال"];
const OUT_CATEGORIES = ["مشتريات", "مصروفات", "رواتب", "إيجار", "فواتير", "توزيع أرباح", "مصروف متنوع"];

type TreasuryTab = "movements" | "partners";

export default function Treasury() {
  const [treasuryTab, setTreasuryTab] = useState<TreasuryTab>("movements");
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [distributionDialogOpen, setDistributionDialogOpen] = useState(false);
  const [expandedDist, setExpandedDist] = useState<string | null>(null);
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const [form, setForm] = useState({
    type: "in" as "in" | "out",
    category: "",
    amount: 0,
    description: "",
    date: new Date().toISOString().slice(0, 10),
    reference: "",
  });

  const [partnerForm, setPartnerForm] = useState({ name: "", sharePercent: 0, phone: "", notes: "" });

  const [distForm, setDistForm] = useState({
    fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const entries = useLiveQuery(() => db.treasury.orderBy("date").reverse().toArray(), []);
  const allEntries = useLiveQuery(() => db.treasury.toArray(), []);
  const partners = useLiveQuery(() => db.partners.toArray(), []);
  const distributions = useLiveQuery(() => db.profitDistributions.orderBy("date").reverse().toArray(), []);
  const allSales = useLiveQuery(() => db.sales.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const balance = (allEntries ?? []).reduce(
    (sum, e) => (e.type === "in" ? sum + e.amount : sum - e.amount),
    0,
  );

  const totalIn = (allEntries ?? []).filter((e) => e.type === "in").reduce((s, e) => s + e.amount, 0);
  const totalOut = (allEntries ?? []).filter((e) => e.type === "out").reduce((s, e) => s + e.amount, 0);

  const filtered = entries?.filter((e) => typeFilter === "all" || e.type === typeFilter);

  const entriesAsc = useLiveQuery(() => db.treasury.orderBy("date").toArray(), []);
  const runningMap = new Map<string, number>();
  if (entriesAsc) {
    let running = 0;
    for (const e of entriesAsc) {
      running += e.type === "in" ? e.amount : -e.amount;
      runningMap.set(e.id, running);
    }
  }

  const totalSharePercent = (partners ?? []).reduce((s, p) => s + p.sharePercent, 0);

  // حساب الربح للفترة المختارة للتوزيع
  const calcPeriodProfit = () => {
    const from = new Date(distForm.fromDate).toISOString();
    const to = new Date(distForm.toDate + "T23:59:59").toISOString();
    const productMap = new Map((products ?? []).map((p) => [p.id, p]));
    const periodSales = (allSales ?? []).filter((s) => s.date >= from && s.date <= to);
    let revenue = 0;
    let cost = 0;
    for (const sale of periodSales) {
      revenue += sale.netAmount;
      for (const item of sale.items) {
        cost += (productMap.get(item.productId)?.costPrice ?? 0) * item.quantity;
      }
    }
    return revenue - cost;
  };

  const handleSave = async () => {
    if (!form.category || form.amount <= 0 || !form.description.trim()) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة"); return;
    }
    try {
      await addTreasuryEntry({
        date: new Date(form.date).toISOString(),
        type: form.type,
        category: form.category,
        amount: form.amount,
        description: form.description,
        reference: form.reference || undefined,
      });
      toast.success("تمت الإضافة بنجاح");
      setOpen(false);
      setForm({ type: "in", category: "", amount: 0, description: "", date: new Date().toISOString().slice(0, 10), reference: "" });
    } catch { toast.error("حدث خطأ"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الحركة؟ سيتأثر الرصيد.")) return;
    await db.treasury.delete(id);
    toast.success("تم حذف الحركة");
  };

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim() || partnerForm.sharePercent <= 0) {
      toast.error("أدخل اسم الشريك والنسبة"); return;
    }
    const newTotal = totalSharePercent + partnerForm.sharePercent;
    if (newTotal > 100) {
      toast.error(`إجمالي النسب سيتجاوز 100% (الحالي: ${totalSharePercent}%)`); return;
    }
    const partner: Partner = {
      id: crypto.randomUUID(),
      name: partnerForm.name.trim(),
      sharePercent: partnerForm.sharePercent,
      phone: partnerForm.phone || undefined,
      notes: partnerForm.notes || undefined,
    };
    await db.partners.add(partner);
    toast.success("تم إضافة الشريك");
    setPartnerForm({ name: "", sharePercent: 0, phone: "", notes: "" });
    setPartnerDialogOpen(false);
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm("هل تريد حذف هذا الشريك؟")) return;
    await db.partners.delete(id);
    toast.success("تم حذف الشريك");
  };

  const handleDistribute = async () => {
    if ((partners ?? []).length === 0) {
      toast.error("لا يوجد شركاء مسجلون"); return;
    }
    if (totalSharePercent === 0) {
      toast.error("مجموع نسب الشركاء = 0"); return;
    }
    const profit = calcPeriodProfit();
    if (profit <= 0) {
      toast.error(`لا يوجد ربح في هذه الفترة (الربح: ${profit.toLocaleString("ar-EG")} ${currency})`); return;
    }

    // خصم 5% لزيادة رأس المال قبل التوزيع
    const capitalReserve = Math.round(profit * 0.05 * 100) / 100;
    const distributableProfit = Math.round((profit - capitalReserve) * 100) / 100;

    const items = (partners ?? []).map((p) => ({
      partnerId: p.id,
      partnerName: p.name,
      sharePercent: p.sharePercent,
      amount: Math.round((p.sharePercent / 100) * distributableProfit * 100) / 100,
    }));

    const totalDistributed = items.reduce((s, i) => s + i.amount, 0);

    const distribution: ProfitDistribution = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      fromDate: distForm.fromDate,
      toDate: distForm.toDate,
      totalProfit: profit,
      items,
      notes: distForm.notes || undefined,
    };

    await db.profitDistributions.add(distribution);

    // خصم من الخزينة
    await addTreasuryEntry({
      date: new Date().toISOString(),
      type: "out",
      category: "توزيع أرباح",
      amount: totalDistributed,
      description: `توزيع أرباح من ${distForm.fromDate} إلى ${distForm.toDate} — ربح: ${profit.toLocaleString("ar-EG")} ${currency} | احتياطي رأس المال (5%): ${capitalReserve.toLocaleString("ar-EG")} ${currency} | الموزع: ${distributableProfit.toLocaleString("ar-EG")} ${currency}`,
      reference: distribution.id,
    });

    toast.success(`تم التوزيع — خُصم ${totalDistributed.toLocaleString("ar-EG")} ${currency} | احتياطي رأس المال: ${capitalReserve.toLocaleString("ar-EG")} ${currency}`);
    setDistributionDialogOpen(false);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">الخزنة</h1>
        <div className="flex gap-2">
          {treasuryTab === "movements" && (
            <Button onClick={() => setOpen(true)} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
              <Plus className="w-4 h-4 ml-2" /> إضافة حركة
            </Button>
          )}
          {treasuryTab === "partners" && (
            <>
              <Button onClick={() => setPartnerDialogOpen(true)} variant="secondary">
                <Plus className="w-4 h-4 ml-2" /> شريك جديد
              </Button>
              <Button onClick={() => setDistributionDialogOpen(true)} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                <PieChart className="w-4 h-4 ml-2" /> توزيع الأرباح
              </Button>
            </>
          )}
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-md bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Vault className="w-9 h-9 text-blue-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
              <p className={`text-lg font-bold truncate ${balance >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                {balance.toLocaleString("ar-EG")} {currency}
              </p>
              <p className="text-xs text-muted-foreground">وارد − صادر</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-green-50 dark:bg-green-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-9 h-9 text-green-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">إجمالي الوارد</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300 truncate">{totalIn.toLocaleString("ar-EG")} {currency}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="w-9 h-9 text-red-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">إجمالي الصادر</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300 truncate">{totalOut.toLocaleString("ar-EG")} {currency}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setTreasuryTab("movements")} className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${treasuryTab === "movements" ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          حركات الخزنة
        </button>
        <button onClick={() => setTreasuryTab("partners")} className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1 ${treasuryTab === "partners" ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Users className="w-4 h-4" /> الشركاء وتوزيع الأرباح
          {(partners ?? []).length > 0 && (
            <span className="bg-[#1e2a4a] text-white text-xs rounded-full px-1.5 py-0.5">{(partners ?? []).length}</span>
          )}
        </button>
      </div>

      {/* تبويب حركات الخزنة */}
      {treasuryTab === "movements" && (
        <>
          <div className="flex gap-2">
            {(["all", "in", "out"] as const).map((t) => (
              <Button key={t} size="sm" variant={typeFilter === t ? "default" : "secondary"}
                onClick={() => setTypeFilter(t)}
                className={typeFilter === t ? "bg-[#1e2a4a] text-white" : ""}
              >
                {t === "all" ? "الكل" : t === "in" ? "وارد" : "صادر"}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-right p-3 font-semibold">التاريخ</th>
                  <th className="text-right p-3 font-semibold">النوع</th>
                  <th className="text-right p-3 font-semibold">الفئة</th>
                  <th className="text-right p-3 font-semibold">البيان</th>
                  <th className="text-right p-3 font-semibold">المبلغ</th>
                  <th className="text-right p-3 font-semibold">الرصيد التراكمي</th>
                  <th className="text-center p-3 font-semibold">حذف</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((e) => {
                  const running = runningMap.get(e.id);
                  return (
                    <tr key={e.id} className={`border-b hover:bg-muted/20 transition-colors ${e.category === "توزيع أرباح" ? "bg-purple-50/50 dark:bg-purple-900/10" : ""}`}>
                      <td className="p-3 text-muted-foreground text-xs">{new Date(e.date).toLocaleDateString("ar-EG")}</td>
                      <td className="p-3">
                        {e.type === "in"
                          ? <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><TrendingUp className="w-3 h-3" /> وارد</span>
                          : <span className="flex items-center gap-1 text-red-600 font-semibold text-xs"><TrendingDown className="w-3 h-3" /> صادر</span>}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{e.category}</td>
                      <td className="p-3 text-sm">{e.description}</td>
                      <td className={`p-3 font-bold ${e.type === "in" ? "text-green-600" : "text-red-600"}`}>
                        {e.type === "in" ? "+" : "−"}{e.amount.toLocaleString("ar-EG")} {currency}
                      </td>
                      <td className={`p-3 font-semibold ${(running ?? 0) >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                        {running !== undefined ? `${running.toLocaleString("ar-EG")} ${currency}` : "—"}
                      </td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                          onClick={() => handleDelete(e.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(!filtered || filtered.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">لا توجد حركات خزنة</div>
            )}
          </div>
        </>
      )}

      {/* تبويب الشركاء */}
      {treasuryTab === "partners" && (
        <div className="space-y-6">
          {/* بطاقة ملخص الشركاء */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-900/20">
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">عدد الشركاء</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{(partners ?? []).length}</p>
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-md ${totalSharePercent === 100 ? "bg-green-50 dark:bg-green-900/20" : totalSharePercent > 100 ? "bg-red-50 dark:bg-red-900/20" : "bg-orange-50 dark:bg-orange-900/20"}`}>
              <CardContent className="p-4 text-center">
                <PieChart className={`w-8 h-8 mx-auto mb-2 ${totalSharePercent === 100 ? "text-green-600" : totalSharePercent > 100 ? "text-red-600" : "text-orange-600"}`} />
                <p className="text-sm text-muted-foreground">إجمالي النسب الموزعة</p>
                <p className={`text-2xl font-bold ${totalSharePercent === 100 ? "text-green-700 dark:text-green-400" : totalSharePercent > 100 ? "text-red-700 dark:text-red-400" : "text-orange-700 dark:text-orange-400"}`}>
                  {totalSharePercent}%
                </p>
                <p className="text-xs text-muted-foreground">{totalSharePercent === 100 ? "✅ مكتمل" : totalSharePercent > 100 ? "⚠️ يتجاوز 100%!" : `متبقي ${100 - totalSharePercent}%`}</p>
              </CardContent>
            </Card>
          </div>

          {/* قائمة الشركاء */}
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">الشركاء المسجلون</CardTitle></CardHeader>
            <CardContent className="p-0 pb-2">
              {(partners ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">لا يوجد شركاء — أضف شريكاً جديداً</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right p-3">اسم الشريك</th>
                      <th className="text-right p-3">نسبة الربح</th>
                      <th className="text-right p-3">الهاتف</th>
                      <th className="text-right p-3">ملاحظات</th>
                      <th className="text-center p-3">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(partners ?? []).map((p) => (
                      <tr key={p.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 font-semibold">{p.name}</td>
                        <td className="p-3">
                          <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-3 py-1 rounded-full font-bold">{p.sharePercent}%</span>
                        </td>
                        <td className="p-3 text-muted-foreground">{p.phone ?? "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{p.notes ?? "—"}</td>
                        <td className="p-3 text-center">
                          <Button size="sm" variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                            onClick={() => handleDeletePartner(p.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* سجل توزيعات الأرباح */}
          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-sm">سجل توزيعات الأرباح</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(distributions ?? []).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">لا توجد توزيعات سابقة</div>
              ) : (
                (distributions ?? []).map((d) => (
                  <div key={d.id} className="border rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/20 cursor-pointer text-right"
                      onClick={() => setExpandedDist(expandedDist === d.id ? null : d.id)}
                    >
                      <div>
                        <p className="font-semibold text-sm">{d.fromDate} — {d.toDate}</p>
                        <p className="text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString("ar-EG")} | ربح: {d.totalProfit.toLocaleString("ar-EG")} {currency}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 px-3 py-1 rounded-full text-sm font-bold">
                          {d.items.reduce((s, i) => s + i.amount, 0).toLocaleString("ar-EG")} {currency}
                        </span>
                        {expandedDist === d.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {expandedDist === d.id && (
                      <div className="border-t bg-muted/20 p-4">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b">
                            <th className="text-right pb-2">الشريك</th>
                            <th className="text-right pb-2">النسبة</th>
                            <th className="text-right pb-2">المبلغ</th>
                          </tr></thead>
                          <tbody>
                            {d.items.map((item) => (
                              <tr key={item.partnerId} className="border-b last:border-0">
                                <td className="py-2 font-medium">{item.partnerName}</td>
                                <td className="py-2 text-purple-700 dark:text-purple-300">{item.sharePercent}%</td>
                                <td className="py-2 font-bold text-green-700 dark:text-green-400">{item.amount.toLocaleString("ar-EG")} {currency}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {d.notes && <p className="text-xs text-muted-foreground mt-2">ملاحظة: {d.notes}</p>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog إضافة حركة */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>إضافة حركة للخزنة</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">الرصيد الحالي</span>
              <span className={`font-bold text-lg ${balance >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                {balance.toLocaleString("ar-EG")} {currency}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>النوع *</Label>
                <Select value={form.type} onValueChange={(val: "in" | "out") => setForm({ ...form, type: val, category: "" })}>
                  <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="in">وارد (إيراد)</SelectItem>
                    <SelectItem value="out">صادر (مصروف)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>الفئة *</Label>
                <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                  <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {(form.type === "in" ? IN_CATEGORIES : OUT_CATEGORIES).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المبلغ *</Label>
                <Input type="number" min={1} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>البيان *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} dir="rtl" placeholder="وصف الحركة" />
            </div>
            <div className="space-y-1">
              <Label>مرجع (اختياري)</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} dir="rtl" />
            </div>
            {form.amount > 0 && (
              <div className={`rounded-lg p-3 text-sm flex justify-between items-center ${form.type === "in" ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                <span className="text-muted-foreground">الرصيد بعد الحركة</span>
                <span className={`font-bold ${form.type === "in" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {(form.type === "in" ? balance + form.amount : balance - form.amount).toLocaleString("ar-EG")} {currency}
                </span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">حفظ</Button>
              <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog إضافة شريك */}
      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>إضافة شريك جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground">النسب المُسجَّلة حتى الآن</p>
              <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{totalSharePercent}% من 100%</p>
              <p className="text-xs text-muted-foreground">متاح: {100 - totalSharePercent}%</p>
            </div>
            <div className="space-y-1">
              <Label>اسم الشريك *</Label>
              <Input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} dir="rtl" placeholder="اسم الشريك" />
            </div>
            <div className="space-y-1">
              <Label>نسبة الربح % *</Label>
              <Input type="number" min={1} max={100 - totalSharePercent} value={partnerForm.sharePercent || ""} onChange={(e) => setPartnerForm({ ...partnerForm, sharePercent: Number(e.target.value) })} dir="rtl" placeholder="مثال: 30" />
            </div>
            <div className="space-y-1">
              <Label>رقم الهاتف</Label>
              <Input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} dir="rtl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSavePartner} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">حفظ</Button>
              <Button variant="secondary" onClick={() => setPartnerDialogOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog توزيع الأرباح */}
      <Dialog open={distributionDialogOpen} onOpenChange={setDistributionDialogOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg">
          <DialogHeader><DialogTitle>توزيع الأرباح على الشركاء</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>من تاريخ</Label>
                <Input type="date" value={distForm.fromDate} onChange={(e) => setDistForm({ ...distForm, fromDate: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={distForm.toDate} onChange={(e) => setDistForm({ ...distForm, toDate: e.target.value })} dir="rtl" />
              </div>
            </div>

            {/* معاينة الأرباح */}
            {(() => {
              const profit = calcPeriodProfit();
              const capitalReserve = Math.round(profit * 0.05 * 100) / 100;
              const distributableProfit = Math.round((profit - capitalReserve) * 100) / 100;
              return (
                <div className={`rounded-xl p-4 ${profit > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                  <p className="text-sm text-muted-foreground mb-1">صافي ربح الفترة المحسوب</p>
                  <p className={`text-2xl font-bold ${profit > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {profit.toLocaleString("ar-EG")} {currency}
                  </p>
                  {profit > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">احتياطي رأس المال (5% ثابت)</span>
                        <span className="font-semibold text-orange-600">− {capitalReserve.toLocaleString("ar-EG")} {currency}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold border-t pt-1">
                        <span>الأرباح القابلة للتوزيع (95%)</span>
                        <span className="text-green-700 dark:text-green-400">{distributableProfit.toLocaleString("ar-EG")} {currency}</span>
                      </div>
                      {(partners ?? []).length > 0 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          <p className="text-xs text-muted-foreground font-semibold">توزيع على الشركاء:</p>
                          {(partners ?? []).map((p) => (
                            <div key={p.id} className="flex justify-between items-center text-sm">
                              <span className="font-medium">{p.name} ({p.sharePercent}%)</span>
                              <span className="font-bold text-green-700 dark:text-green-400">
                                {(Math.round((p.sharePercent / 100) * distributableProfit * 100) / 100).toLocaleString("ar-EG")} {currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              ⚠️ سيتم خصم إجمالي توزيع الأرباح من رصيد الخزنة فوراً.
            </div>

            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={distForm.notes} onChange={(e) => setDistForm({ ...distForm, notes: e.target.value })} dir="rtl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleDistribute} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
                <PieChart className="w-4 h-4 ml-2" /> تأكيد التوزيع والخصم من الخزنة
              </Button>
              <Button variant="secondary" onClick={() => setDistributionDialogOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

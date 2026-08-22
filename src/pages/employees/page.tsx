import { useState, Component } from "react";
import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Employee, type Attendance, type SalaryPayment, addTreasuryEntry } from "@/lib/db.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCheck, Calendar, DollarSign } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { useCompanySettings } from "@/hooks/use-company-settings.ts";

type Tab = "employees" | "attendance" | "salaries" | "advances";

// ─── Error Boundary لحماية الصفحة من أخطاء useLiveQuery ───────────────────
class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 space-y-4 text-center">
          <p className="text-destructive font-semibold">حدث خطأ في تحميل البيانات</p>
          <p className="text-sm text-muted-foreground">{this.state.error}</p>
          <button
            className="px-4 py-2 bg-[#1e2a4a] text-white rounded-lg text-sm cursor-pointer"
            onClick={() => window.location.reload()}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmployeesInner() {
  const [tab, setTab] = useState<Tab>("employees");
  const [empOpen, setEmpOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [salOpen, setSalOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const settings = useCompanySettings();
  const currency = settings?.currency ?? "ج.م";

  const today = new Date().toISOString().slice(0, 10);

  const [empForm, setEmpForm] = useState<Omit<Employee, "id">>({ name: "", nationalId: undefined, phone: undefined, address: undefined, position: undefined, baseSalary: 0, hireDate: today, status: "active", notes: undefined });
  const [attForm, setAttForm] = useState({ employeeId: "", date: today, status: "present" as Attendance["status"], hoursWorked: 8, overtime: 0, notes: "" });
  const [salForm, setSalForm] = useState({ employeeId: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), deductions: 0, bonuses: 0, notes: "" });
  const [advForm, setAdvForm] = useState({ employeeId: "", amount: 0, date: today, notes: "" });

  const employees = useLiveQuery(() => db.employees.orderBy("name").toArray(), []);
  const attendance = useLiveQuery(() => db.attendance.orderBy("date").reverse().limit(100).toArray(), []);
  const salaries = useLiveQuery(() => db.salaryPayments.toArray().then(arr => arr.sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 100)), []);
  // جلب السلف: مصروفات من نوع "سلفة"
  const advances = useLiveQuery(() => db.expenses.where("category").equals("سلفة").reverse().toArray(), []);

  const activeEmployees = employees?.filter((e) => e.status === "active");

  const selectedEmpSalary = employees?.find((e) => e.id === salForm.employeeId)?.baseSalary ?? 0;
  const netSalary = selectedEmpSalary + salForm.bonuses - salForm.deductions;

  const openEditEmp = (e: Employee) => {
    setEditingEmp(e);
    setEmpForm({ name: e.name, nationalId: e.nationalId, phone: e.phone, address: e.address, position: e.position, baseSalary: e.baseSalary, hireDate: e.hireDate, status: e.status, notes: e.notes });
    setEmpOpen(true);
  };

  const handleSaveEmp = async () => {
    if (!empForm.name.trim()) { toast.error("اسم الموظف مطلوب"); return; }
    try {
      if (editingEmp) {
        await db.employees.update(editingEmp.id, empForm);
        toast.success("تم التحديث");
      } else {
        await db.employees.add({ id: crypto.randomUUID(), ...empForm });
        toast.success("تمت الإضافة");
      }
      setEmpOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handleSaveAtt = async () => {
    if (!attForm.employeeId) { toast.error("حدد الموظف"); return; }
    const emp = employees?.find((e) => e.id === attForm.employeeId);
    try {
      await db.attendance.add({
        id: crypto.randomUUID(),
        employeeId: attForm.employeeId,
        employeeName: emp?.name ?? "",
        date: new Date(attForm.date).toISOString(),
        status: attForm.status,
        hoursWorked: attForm.hoursWorked || undefined,
        overtime: attForm.overtime || undefined,
        notes: attForm.notes || undefined,
      });
      toast.success("تم تسجيل الحضور");
      setAttOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handlePaySalary = async () => {
    if (!salForm.employeeId || netSalary <= 0) { toast.error("بيانات غير صحيحة"); return; }
    const emp = employees?.find((e) => e.id === salForm.employeeId);
    try {
      const payment: SalaryPayment = {
        id: crypto.randomUUID(),
        employeeId: salForm.employeeId,
        employeeName: emp?.name ?? "",
        month: salForm.month,
        year: salForm.year,
        baseSalary: selectedEmpSalary,
        deductions: salForm.deductions,
        bonuses: salForm.bonuses,
        netSalary,
        paidAt: new Date().toISOString(),
        notes: salForm.notes || undefined,
      };
      await db.salaryPayments.add(payment);
      await addTreasuryEntry({
        date: new Date().toISOString(),
        type: "out",
        category: "رواتب",
        amount: netSalary,
        description: `راتب ${emp?.name ?? ""} - ${salForm.month}/${salForm.year}`,
        reference: payment.id,
      });
      toast.success("تم صرف الراتب");
      setSalOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  const handlePayAdvance = async () => {
    if (!advForm.employeeId) { toast.error("حدد الموظف"); return; }
    if (!advForm.amount || advForm.amount <= 0) { toast.error("أدخل مبلغ السلفة"); return; }
    const emp = employees?.find((e) => e.id === advForm.employeeId);
    try {
      // حفظ السلفة كمصروف من نوع "سلفة"
      await db.expenses.add({
        id: crypto.randomUUID(),
        date: new Date(advForm.date).toISOString(),
        category: "سلفة",
        amount: advForm.amount,
        description: `سلفة - ${emp?.name ?? ""}`,
        reference: advForm.employeeId,
        notes: advForm.notes || undefined,
      });
      // خصم من الخزنة
      await addTreasuryEntry({
        date: new Date(advForm.date).toISOString(),
        type: "out",
        category: "سلف موظفين",
        amount: advForm.amount,
        description: `سلفة للموظف ${emp?.name ?? ""}`,
        reference: advForm.employeeId,
      });
      toast.success(`تم صرف سلفة ${advForm.amount.toLocaleString("ar-EG")} ${currency} للموظف ${emp?.name ?? ""}`);
      setAdvForm({ employeeId: "", amount: 0, date: today, notes: "" });
      setAdvOpen(false);
    } catch { toast.error("حدث خطأ"); }
  };

  // حساب إجمالي سلف الموظف غير المخصومة (مرتبطة بـ reference = employeeId)
  const getPendingAdvances = (employeeId: string) => {
    return (advances ?? [])
      .filter((a) => a.reference === employeeId)
      .reduce((sum, a) => sum + a.amount, 0);
  };
  const attStatusLabel: Record<Attendance["status"], string> = { present: "حاضر", absent: "غائب", late: "متأخر", vacation: "إجازة" };
  const attStatusColor: Record<Attendance["status"], string> = { present: "text-green-600", absent: "text-red-600", late: "text-orange-600", vacation: "text-blue-600" };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <h1 className="text-2xl font-bold">العمال والرواتب</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["employees", "attendance", "salaries", "advances"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${tab === t ? "border-[#1e2a4a] text-[#1e2a4a] dark:border-blue-300 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "employees" ? "الموظفون" : t === "attendance" ? "الحضور والغياب" : t === "salaries" ? "الرواتب" : "السلف"}
          </button>
        ))}
      </div>

      {/* Employees Tab */}
      {tab === "employees" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => { setEditingEmp(null); setEmpForm({ name: "", nationalId: undefined, phone: undefined, address: undefined, position: undefined, baseSalary: 0, hireDate: today, status: "active", notes: undefined }); setEmpOpen(true); }} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
              <Plus className="w-4 h-4 ml-2" /> إضافة موظف
            </Button>
          </div>
          {!employees || employees.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><UserCheck /></EmptyMedia>
                <EmptyTitle>لا يوجد موظفون</EmptyTitle>
                <EmptyDescription>أضف أول موظف</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button size="sm" onClick={() => setEmpOpen(true)}>إضافة موظف</Button></EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right p-3 font-semibold">الاسم</th>
                    <th className="text-right p-3 font-semibold">المنصب</th>
                    <th className="text-right p-3 font-semibold">الهاتف</th>
                    <th className="text-right p-3 font-semibold">الراتب الأساسي</th>
                    <th className="text-right p-3 font-semibold">تاريخ التعيين</th>
                    <th className="text-right p-3 font-semibold">الحالة</th>
                    <th className="text-right p-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/20">
                      <td className="p-3 font-medium">{e.name}</td>
                      <td className="p-3 text-muted-foreground">{e.position ?? "-"}</td>
                      <td className="p-3 text-muted-foreground">{e.phone ?? "-"}</td>
                      <td className="p-3 font-semibold">{e.baseSalary.toLocaleString("ar-EG")} {currency}</td>
                      <td className="p-3 text-muted-foreground">{new Date(e.hireDate).toLocaleDateString("ar-EG")}</td>
                      <td className="p-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${e.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{e.status === "active" ? "نشط" : "غير نشط"}</span></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditEmp(e)}><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => db.employees.delete(e.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Attendance Tab */}
      {tab === "attendance" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setAttOpen(true)} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"><Calendar className="w-4 h-4 ml-2" /> تسجيل حضور</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40"><th className="text-right p-3 font-semibold">التاريخ</th><th className="text-right p-3 font-semibold">الموظف</th><th className="text-right p-3 font-semibold">الحالة</th><th className="text-right p-3 font-semibold">ساعات</th><th className="text-right p-3 font-semibold">أوفرتايم</th></tr></thead>
              <tbody>
                {attendance?.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{new Date(a.date).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3 font-medium">{a.employeeName}</td>
                    <td className={`p-3 font-semibold ${attStatusColor[a.status]}`}>{attStatusLabel[a.status]}</td>
                    <td className="p-3">{a.hoursWorked ?? "-"}</td>
                    <td className="p-3">{a.overtime ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!attendance || attendance.length === 0) && <div className="text-center py-12 text-muted-foreground">لا توجد سجلات حضور</div>}
          </div>
        </>
      )}

      {/* Salaries Tab */}
      {tab === "salaries" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setSalOpen(true)} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"><DollarSign className="w-4 h-4 ml-2" /> صرف راتب</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40"><th className="text-right p-3 font-semibold">الموظف</th><th className="text-right p-3 font-semibold">الشهر/السنة</th><th className="text-right p-3 font-semibold">الراتب الأساسي</th><th className="text-right p-3 font-semibold">خصومات</th><th className="text-right p-3 font-semibold">حوافز</th><th className="text-right p-3 font-semibold">الصافي</th><th className="text-right p-3 font-semibold">تاريخ الصرف</th></tr></thead>
              <tbody>
                {salaries?.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 font-medium">{s.employeeName}</td>
                    <td className="p-3 text-muted-foreground">{s.month}/{s.year}</td>
                    <td className="p-3">{s.baseSalary.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 text-red-600">{s.deductions.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 text-green-600">{s.bonuses.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 font-bold">{s.netSalary.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 text-muted-foreground">{new Date(s.paidAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!salaries || salaries.length === 0) && <div className="text-center py-12 text-muted-foreground">لا توجد سجلات رواتب</div>}
          </div>
        </>
      )}

      {/* Advances Tab - السلف */}
      {tab === "advances" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => { setAdvForm({ employeeId: "", amount: 0, date: today, notes: "" }); setAdvOpen(true); }} className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">
              <Plus className="w-4 h-4 ml-2" /> صرف سلفة
            </Button>
          </div>

          {/* بطاقات ملخص السلف لكل موظف */}
          {activeEmployees && activeEmployees.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeEmployees.map((emp) => {
                const pending = getPendingAdvances(emp.id);
                if (pending === 0) return null;
                return (
                  <div key={emp.id} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
                    <p className="font-semibold text-sm">{emp.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{emp.position ?? "موظف"}</p>
                    <p className="text-orange-700 dark:text-orange-400 font-bold text-base mt-1">
                      {pending.toLocaleString("ar-EG")} {currency}
                    </p>
                    <p className="text-xs text-muted-foreground">إجمالي السلف</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-right p-3 font-semibold">التاريخ</th>
                  <th className="text-right p-3 font-semibold">الموظف</th>
                  <th className="text-right p-3 font-semibold">المبلغ</th>
                  <th className="text-right p-3 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {(advances ?? []).map((a) => (
                  <tr key={a.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{new Date(a.date).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3 font-medium">{a.description.replace("سلفة - ", "")}</td>
                    <td className="p-3 font-bold text-orange-700 dark:text-orange-400">{a.amount.toLocaleString("ar-EG")} {currency}</td>
                    <td className="p-3 text-muted-foreground text-xs">{a.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!advances || advances.length === 0) && <div className="text-center py-12 text-muted-foreground">لا توجد سلف مسجلة</div>}
          </div>
        </>
      )}

      {/* Employee Dialog */}
      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editingEmp ? "تعديل موظف" : "إضافة موظف"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>الاسم *</Label><Input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} dir="rtl" /></div>
              <div className="space-y-1"><Label>المنصب</Label><Input value={empForm.position ?? ""} onChange={(e) => setEmpForm({ ...empForm, position: e.target.value || undefined })} dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>الهاتف</Label><Input value={empForm.phone ?? ""} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value || undefined })} dir="rtl" /></div>
              <div className="space-y-1"><Label>الراتب الأساسي</Label><Input type="number" value={empForm.baseSalary === 0 ? "" : empForm.baseSalary} onChange={(e) => setEmpForm({ ...empForm, baseSalary: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>تاريخ التعيين</Label><Input type="date" value={empForm.hireDate} onChange={(e) => setEmpForm({ ...empForm, hireDate: e.target.value })} dir="rtl" /></div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <Select value={empForm.status} onValueChange={(val: Employee["status"]) => setEmpForm({ ...empForm, status: val })}>
                  <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl"><SelectItem value="active">نشط</SelectItem><SelectItem value="inactive">غير نشط</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveEmp} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">{editingEmp ? "حفظ" : "إضافة"}</Button>
              <Button variant="secondary" onClick={() => setEmpOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog open={attOpen} onOpenChange={setAttOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>تسجيل حضور</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>الموظف *</Label>
              <Select value={attForm.employeeId} onValueChange={(val) => setAttForm({ ...attForm, employeeId: val })}>
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent dir="rtl">{activeEmployees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} dir="rtl" /></div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <Select value={attForm.status} onValueChange={(val: Attendance["status"]) => setAttForm({ ...attForm, status: val })}>
                  <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl"><SelectItem value="present">حاضر</SelectItem><SelectItem value="absent">غائب</SelectItem><SelectItem value="late">متأخر</SelectItem><SelectItem value="vacation">إجازة</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>ساعات العمل</Label><Input type="number" value={attForm.hoursWorked === 0 ? "" : attForm.hoursWorked} onChange={(e) => setAttForm({ ...attForm, hoursWorked: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" /></div>
              <div className="space-y-1"><Label>أوفرتايم</Label><Input type="number" value={attForm.overtime === 0 ? "" : attForm.overtime} onChange={(e) => setAttForm({ ...attForm, overtime: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveAtt} className="flex-1 bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white">حفظ</Button>
              <Button variant="secondary" onClick={() => setAttOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Salary Dialog */}
      <Dialog open={salOpen} onOpenChange={setSalOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>صرف راتب</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>الموظف *</Label>
              <Select value={salForm.employeeId} onValueChange={(val) => {
                const pending = getPendingAdvances(val);
                setSalForm({ ...salForm, employeeId: val, deductions: pending });
              }}>
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent dir="rtl">{activeEmployees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} - {e.baseSalary.toLocaleString("ar-EG")} {currency}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {salForm.employeeId && getPendingAdvances(salForm.employeeId) > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-2 text-sm text-orange-700 dark:text-orange-400">
                ⚠️ يوجد سلف مستحقة: <strong>{getPendingAdvances(salForm.employeeId).toLocaleString("ar-EG")} {currency}</strong> — تمت إضافتها للخصومات تلقائياً
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>الشهر</Label><Input type="number" min={1} max={12} value={salForm.month} onChange={(e) => setSalForm({ ...salForm, month: Number(e.target.value) })} onFocus={(e) => e.target.select()} dir="rtl" className="h-10 border-2" /></div>
              <div className="space-y-1"><Label>السنة</Label><Input type="number" value={salForm.year} onChange={(e) => setSalForm({ ...salForm, year: Number(e.target.value) })} onFocus={(e) => e.target.select()} dir="rtl" className="h-10 border-2" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>خصومات</Label><Input type="number" value={salForm.deductions === 0 ? "" : salForm.deductions} onChange={(e) => setSalForm({ ...salForm, deductions: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" /></div>
              <div className="space-y-1"><Label>حوافز</Label><Input type="number" value={salForm.bonuses === 0 ? "" : salForm.bonuses} onChange={(e) => setSalForm({ ...salForm, bonuses: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" /></div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <span className="text-sm text-muted-foreground">صافي الراتب: </span>
              <span className="font-bold text-lg text-green-600">{netSalary.toLocaleString("ar-EG")} {currency}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handlePaySalary} className="flex-1 bg-green-600 hover:bg-green-700 text-white">صرف الراتب</Button>
              <Button variant="secondary" onClick={() => setSalOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Dialog - صرف سلفة */}
      <Dialog open={advOpen} onOpenChange={setAdvOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>صرف سلفة</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>الموظف *</Label>
              <Select value={advForm.employeeId} onValueChange={(val) => setAdvForm({ ...advForm, employeeId: val })}>
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent dir="rtl">{activeEmployees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المبلغ *</Label>
                <Input type="number" value={advForm.amount === 0 ? "" : advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value === "" ? 0 : Number(e.target.value) })} onFocus={(e) => e.target.select()} placeholder="0" dir="rtl" className="h-10 border-2" />
              </div>
              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={advForm.date} onChange={(e) => setAdvForm({ ...advForm, date: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={advForm.notes} onChange={(e) => setAdvForm({ ...advForm, notes: e.target.value })} dir="rtl" placeholder="اختياري" />
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center text-sm text-orange-700 dark:text-orange-400">
              سيتم خصم هذه السلفة تلقائياً عند صرف الراتب الشهري
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handlePayAdvance} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white">صرف السلفة</Button>
              <Button variant="secondary" onClick={() => setAdvOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Employees() {
  return (
    <PageErrorBoundary>
      <EmployeesInner />
    </PageErrorBoundary>
  );
}

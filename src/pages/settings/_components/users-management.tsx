import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type AppUser, type UserRole } from "@/lib/db.ts";
import { hashPassword, ROLE_LABELS, ROLE_COLORS } from "@/lib/auth.ts";
import { useLocalAuth } from "@/hooks/use-local-auth.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { UsersRound, UserPlus, Trash2, KeyRound, CheckCircle2, XCircle } from "lucide-react";

const ROLE_OPTIONS: UserRole[] = ["admin", "accountant", "warehouse", "sales_rep", "readonly"];

function formatDate(iso?: string): string {
  if (!iso) return "لم يسجّل الدخول";
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UsersManagement() {
  const { session } = useLocalAuth();
  const users = useLiveQuery(() => db.appUsers.toArray(), []);

  const [addOpen, setAddOpen] = useState(false);
  const [pwdUser, setPwdUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);

  // نموذج إضافة مستخدم
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    confirm: "",
    role: "accountant" as UserRole,
  });
  const [adding, setAdding] = useState(false);

  // نموذج تغيير كلمة المرور
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const adminCount = (users ?? []).filter((u) => u.role === "admin").length;

  const resetForm = () =>
    setForm({ name: "", username: "", password: "", confirm: "", role: "accountant" });

  const handleAdd = async () => {
    const name = form.name.trim();
    const uname = form.username.toLowerCase().trim();
    if (!name || !uname || !form.password) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    if (form.password.length < 4) {
      toast.error("كلمة المرور يجب ألا تقل عن 4 أحرف");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setAdding(true);
    try {
      const existing = await db.appUsers.where("username").equals(uname).first();
      if (existing) {
        toast.error("اسم المستخدم مستخدم بالفعل، اختر اسماً آخر");
        setAdding(false);
        return;
      }
      const user: AppUser = {
        id: crypto.randomUUID(),
        username: uname,
        name,
        passwordHash: await hashPassword(form.password),
        role: form.role,
        active: true,
        createdAt: new Date().toISOString(),
      };
      await db.appUsers.add(user);
      toast.success("تم إضافة المستخدم بنجاح");
      resetForm();
      setAddOpen(false);
    } catch {
      toast.error("حدث خطأ أثناء إضافة المستخدم");
    } finally {
      setAdding(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwdUser) return;
    if (!newPwd) {
      toast.error("أدخل كلمة المرور الجديدة");
      return;
    }
    if (newPwd.length < 4) {
      toast.error("كلمة المرور يجب ألا تقل عن 4 أحرف");
      return;
    }
    if (newPwd !== newPwdConfirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setChangingPwd(true);
    try {
      await db.appUsers.update(pwdUser.id, { passwordHash: await hashPassword(newPwd) });
      toast.success("تم تغيير كلمة المرور بنجاح");
      setPwdUser(null);
      setNewPwd("");
      setNewPwdConfirm("");
    } catch {
      toast.error("حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setChangingPwd(false);
    }
  };

  const handleToggleActive = async (user: AppUser) => {
    if (user.id === session?.userId) {
      toast.error("لا يمكنك تعطيل حسابك الحالي");
      return;
    }
    if (user.active && user.role === "admin" && adminCount <= 1) {
      toast.error("لا يمكن تعطيل آخر مدير في النظام");
      return;
    }
    await db.appUsers.update(user.id, { active: !user.active });
    toast.success(user.active ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    if (deleteUser.id === session?.userId) {
      toast.error("لا يمكنك حذف حسابك الحالي");
      setDeleteUser(null);
      return;
    }
    if (deleteUser.role === "admin" && adminCount <= 1) {
      toast.error("لا يمكن حذف آخر مدير في النظام");
      setDeleteUser(null);
      return;
    }
    await db.appUsers.delete(deleteUser.id);
    toast.success("تم حذف المستخدم");
    setDeleteUser(null);
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="w-5 h-5" /> إدارة المستخدمين
        </CardTitle>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white gap-1.5"
        >
          <UserPlus className="w-4 h-4" /> إضافة مستخدم
        </Button>
      </CardHeader>
      <CardContent>
        {!users ? (
          <p className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل...</p>
        ) : users.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>لا يوجد مستخدمون</EmptyTitle>
              <EmptyDescription>أضف أول مستخدم للنظام</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">اسم المستخدم</TableHead>
                  <TableHead className="text-right">الدور</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">آخر دخول</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name}
                      {user.id === session?.userId && (
                        <span className="text-xs text-muted-foreground mr-1">(أنت)</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {user.username}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          ROLE_COLORS[user.role],
                        )}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs cursor-pointer",
                          user.active ? "text-green-600" : "text-muted-foreground",
                        )}
                      >
                        {user.active ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> نشط
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> معطّل
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(user.lastLogin)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-blue-600"
                          title="تغيير كلمة المرور"
                          onClick={() => {
                            setPwdUser(user);
                            setNewPwd("");
                            setNewPwdConfirm("");
                          }}
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="حذف المستخدم"
                          disabled={
                            user.id === session?.userId ||
                            (user.role === "admin" && adminCount <= 1)
                          }
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Dialog: إضافة مستخدم */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إضافة مستخدم جديد</DialogTitle>
            <DialogDescription className="text-right">
              أدخل بيانات المستخدم وحدد دوره في النظام.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="محمد أحمد"
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="user1"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>كلمة المرور</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label>تأكيد كلمة المرور</Label>
                <Input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>الدور</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding}
              className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"
            >
              {adding ? "جارٍ الإضافة..." : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: تغيير كلمة المرور */}
      <Dialog open={!!pwdUser} onOpenChange={(o) => { if (!o) setPwdUser(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">تغيير كلمة المرور</DialogTitle>
            <DialogDescription className="text-right">
              تغيير كلمة مرور المستخدم: {pwdUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>تأكيد كلمة المرور</Label>
              <Input
                type="password"
                value={newPwdConfirm}
                onChange={(e) => setNewPwdConfirm(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPwdUser(null)}>
              إلغاء
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changingPwd}
              className="bg-[#1e2a4a] hover:bg-[#2d3f6b] text-white"
            >
              {changingPwd ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: تأكيد الحذف */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف المستخدم</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من حذف المستخدم "{deleteUser?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteUser(null)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

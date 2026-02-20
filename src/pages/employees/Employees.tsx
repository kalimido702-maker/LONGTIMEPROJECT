import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Wallet,
} from "lucide-react";
import {
  db,
  Employee,
  User,
  EmployeeAdvance,
  EmployeeDeduction,
  Role,
} from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

// حساب الأيام المتبقية حتى يوم صرف الراتب
const getDaysUntilSalary = (salaryDay: number): number => {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // تعيين تاريخ صرف الراتب في الشهر الحالي
  let nextSalaryDate = new Date(currentYear, currentMonth, salaryDay);

  // إذا كان تاريخ الصرف قد مضى، احسب للشهر القادم
  if (currentDay >= salaryDay) {
    nextSalaryDate = new Date(currentYear, currentMonth + 1, salaryDay);
  }

  const diffTime = nextSalaryDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// معالجة الخصومات لمرة واحدة (تحويلها تلقائياً لـ completed بعد الخصم)
const processOneTimeDeductions = async (deductions: EmployeeDeduction[]) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  for (const deduction of deductions) {
    if (deduction.type === "oneTime" && deduction.status === "active") {
      const startDate = new Date(deduction.startDate);
      const deductionMonth = startDate.getMonth();
      const deductionYear = startDate.getFullYear();

      // إذا مر شهر أو أكثر على تاريخ البداية، نحول الخصم لـ completed
      if (
        currentYear > deductionYear ||
        (currentYear === deductionYear && currentMonth > deductionMonth)
      ) {
        const updated: EmployeeDeduction = {
          ...deduction,
          status: "completed",
          updatedAt: new Date().toISOString(),
        };
        await db.update("employeeDeductions", updated);
        console.log(`Completed one-time deduction: ${deduction.id}`);
      }
    }
  }
};

const Employees = () => {
  const { can } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    nationalId: "",
    position: "",
    salary: 0,
    salaryDay: 1, // يوم صرف الراتب (1-31)
    deductions: 0, // الخصومات الشهرية الثابتة
    hireDate: "",
    active: true,
    role: "", // roleId from roles table
    notes: "",
    username: "",
    password: "",
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    const [employeesData, advancesData, deductionsData, rolesData] =
      await Promise.all([
        db.getAll<Employee>("employees"),
        db.getAll<EmployeeAdvance>("employeeAdvances"),
        db.getAll<EmployeeDeduction>("employeeDeductions"),
        db.getAll<Role>("roles"),
      ]);

    // معالجة الخصومات لمرة واحدة تلقائياً
    await processOneTimeDeductions(deductionsData);

    // إعادة تحميل الخصومات بعد المعالجة
    const updatedDeductions = await db.getAll<EmployeeDeduction>(
      "employeeDeductions"
    );

    console.log("Loaded employees:", employeesData.length);
    console.log("Loaded advances:", advancesData.length);
    console.log("Loaded deductions:", updatedDeductions.length);
    console.log("All deductions:", updatedDeductions);
    console.log("Loaded roles:", rolesData.length);

    setEmployees(employeesData);
    setAdvances(advancesData);
    setDeductions(updatedDeductions);
    setRoles(rolesData);
  };

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employee: Employee = {
        id: editingEmployee?.id || Date.now().toString(),
        ...formData,
        roleId: formData.role, // Save roleId
      };

      if (editingEmployee) {
        await db.update("employees", employee);

        // تحديث بيانات المستخدم إذا تم تغيير الصلاحيات
        const users = await db.getAll<User>("users");
        const userToUpdate = users.find(
          (u) =>
            u.username === editingEmployee.phone || u.id === editingEmployee.id
        );

        if (userToUpdate) {
          console.log(
            "[Employees] Updating user role from",
            userToUpdate.role,
            "to",
            formData.role
          );
          userToUpdate.role = formData.role;
          userToUpdate.roleId = formData.role; // Save roleId for custom roles
          userToUpdate.name = formData.name;
          if (formData.password) {
            userToUpdate.password = formData.password;
          }
          await db.update("users", userToUpdate);
        }

        toast({ title: "تم تحديث الموظف بنجاح" });
      } else {
        // التحقق من عدم وجود username مكرر
        const users = await db.getAll<User>("users");
        const existingUser = users.find(
          (u) => u.username === formData.username
        );

        if (existingUser) {
          toast({
            title: "اسم المستخدم موجود بالفعل",
            description: "الرجاء اختيار اسم مستخدم آخر",
            variant: "destructive",
          });
          return;
        }

        if (!formData.username || !formData.password) {
          toast({
            title: "بيانات تسجيل الدخول مطلوبة",
            description: "يجب إدخال اسم المستخدم وكلمة المرور",
            variant: "destructive",
          });
          return;
        }

        await db.add("employees", employee);

        // إنشاء حساب مستخدم للموظف
        const newUser: User = {
          id: employee.id,
          username: formData.username,
          password: formData.password,
          name: formData.name,
          role: formData.role, // backwards compatibility
          roleId: formData.role, // CRITICAL: this is the actual role ID
          active: formData.active,
          createdAt: new Date().toISOString(),
        };

        console.log(
          "[Employees] Creating new user with role:",
          formData.role,
          "roleId:",
          formData.role
        );
        await db.add("users", newUser);
        toast({
          title: "تم إضافة الموظف بنجاح",
          description: `تم إنشاء حساب المستخدم: ${formData.username}`,
        });
      }

      loadEmployees();
      resetForm();
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handlePaySalary = async (employee: Employee) => {
    if (
      !confirm(
        `هل تريد تأكيد صرف راتب ${employee.name}؟\n\nسيتم تحويل كل الخصومات لمرة واحدة إلى "مكتملة" وسيتم تحديث رصيد السُلف.`
      )
    ) {
      return;
    }

    try {
      // 1. تحويل الخصومات لمرة واحدة للموظف إلى completed
      const employeeOneTimeDeductions = deductions.filter(
        (d) =>
          d.employeeId === employee.id &&
          d.type === "oneTime" &&
          d.status === "active"
      );

      for (const deduction of employeeOneTimeDeductions) {
        const updated: EmployeeDeduction = {
          ...deduction,
          status: "completed",
          updatedAt: new Date().toISOString(),
        };
        await db.update("employeeDeductions", updated);
      }

      // 2. تحديث السُلف المعتمدة: خصم المبلغ الشهري من المتبقي
      const employeeApprovedAdvances = advances.filter(
        (adv) => adv.employeeId === employee.id && adv.status === "approved"
      );

      let updatedAdvancesCount = 0;
      let completedAdvancesCount = 0;
      const completedAdvanceDeductions: string[] = []; // لتخزين معرفات الخصومات التي يجب إلغائها

      for (const advance of employeeApprovedAdvances) {
        const deductionAmount = advance.deductionAmount || 0;
        if (deductionAmount > 0) {
          const currentPaid = advance.paidAmount || 0;
          const newPaid = currentPaid + deductionAmount;
          const remaining = advance.amount - newPaid;

          if (remaining <= 0) {
            // السُلفة تم سدادها بالكامل
            const updated: EmployeeAdvance = {
              ...advance,
              status: "paid",
              paidAmount: advance.amount,
              remainingAmount: 0,
              updatedAt: new Date().toISOString(),
            };
            await db.update("employeeAdvances", updated);
            completedAdvancesCount++;

            // إلغاء الخصم التلقائي المرتبط بهذه السلفة
            const relatedDeductions = deductions.filter(
              (d) =>
                d.employeeId === employee.id &&
                d.status === "active" &&
                d.notes?.includes(advance.id)
            );
            completedAdvanceDeductions.push(
              ...relatedDeductions.map((d) => d.id)
            );
          } else {
            // لا زال هناك رصيد متبقي
            const updated: EmployeeAdvance = {
              ...advance,
              paidAmount: newPaid,
              remainingAmount: remaining,
              updatedAt: new Date().toISOString(),
            };
            await db.update("employeeAdvances", updated);
            updatedAdvancesCount++;
          }
        }
      }

      // 3. إلغاء الخصومات التلقائية للسُلف المكتملة
      for (const deductionId of completedAdvanceDeductions) {
        const deduction = deductions.find((d) => d.id === deductionId);
        if (deduction) {
          const updated: EmployeeDeduction = {
            ...deduction,
            status: "completed",
            updatedAt: new Date().toISOString(),
          };
          await db.update("employeeDeductions", updated);
        }
      }

      let message = `تم صرف راتب ${employee.name}`;
      if (employeeOneTimeDeductions.length > 0) {
        message += `\n✓ تم معالجة ${employeeOneTimeDeductions.length} خصم لمرة واحدة`;
      }
      if (updatedAdvancesCount > 0) {
        message += `\n✓ تم تحديث ${updatedAdvancesCount} سُلفة`;
      }
      if (completedAdvancesCount > 0) {
        message += `\n✓ تم إتمام سداد ${completedAdvancesCount} سُلفة بالكامل`;
      }

      toast({
        title: "تم صرف الراتب بنجاح",
        description: message,
      });

      loadEmployees();
    } catch (error) {
      console.error("Error paying salary:", error);
      toast({
        title: "خطأ في صرف الراتب",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (employee: Employee) => {
    setEditingEmployee(employee);

    // جلب بيانات المستخدم
    const users = await db.getAll<User>("users");
    const user = users.find((u) => u.id === employee.id);

    setFormData({
      name: employee.name,
      phone: employee.phone,
      nationalId: employee.nationalId,
      position: employee.position,
      salary: employee.salary,
      salaryDay: employee.salaryDay || 1,
      deductions: employee.deductions || 0,
      hireDate: employee.hireDate,
      active: employee.active,
      role: employee.roleId || employee.role || "", // Use roleId first, fallback to old role
      notes: employee.notes || "",
      username: user?.username || "",
      password: "", // دائماً فارغة عند التعديل
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الموظف؟")) {
      await db.delete("employees", id);
      toast({ title: "تم حذف الموظف بنجاح" });
      loadEmployees();
    }
  };

  const resetForm = () => {
    // الحصول على الدور الافتراضي
    const defaultRole = roles.find((r) => r.isDefault);

    setFormData({
      name: "",
      phone: "",
      nationalId: "",
      position: "",
      salary: 0,
      salaryDay: 1,
      deductions: 0,
      hireDate: "",
      active: true,
      role: defaultRole?.id || "",
      notes: "",
      username: "",
      password: "",
    });
    setEditingEmployee(null);
    setDialogOpen(false);
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.phone.includes(searchTerm) ||
      e.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pagination = usePagination(filteredEmployees, { resetDeps: [searchTerm] });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">إدارة الموظفين</h1>
          {can("employees", "create") && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة موظف
            </Button>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث عن موظف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagination.paginatedItems.map((employee) => {
            const daysUntilSalary = getDaysUntilSalary(employee.salaryDay || 1);
            const fixedDeductions = Number(employee.deductions || 0);

            // حساب خصومات السلف الشهرية للموظف
            const advanceDeductions = advances
              .filter(
                (a) => a.employeeId === employee.id && a.status === "approved"
              )
              .reduce((sum, a) => sum + Number(a.amount || 0), 0);

            // حساب الخصومات النشطة للموظف من جدول employeeDeductions
            // الخصومات الثابتة: فقط active
            // الخصومات لمرة واحدة: active أو completed في نفس الشهر (يعني لسه ما اتصرفش راتب)
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();

            const employeeActiveDeductions = deductions.filter((d) => {
              if (d.employeeId !== employee.id) return false;

              // الخصومات الثابتة: لازم تكون active
              if (d.type === "fixed") {
                return d.status === "active";
              }

              // الخصومات لمرة واحدة: active أو completed في نفس شهر البداية
              if (d.type === "oneTime") {
                if (d.status === "active") return true;

                // لو completed، نشوف هل في نفس الشهر؟
                if (d.status === "completed") {
                  const startDate = new Date(d.startDate);
                  const deductionMonth = startDate.getMonth();
                  const deductionYear = startDate.getFullYear();

                  // لو completed في نفس شهر البداية، يتخصم
                  return (
                    deductionYear === currentYear &&
                    deductionMonth === currentMonth
                  );
                }
              }

              return false;
            });

            console.log(
              `Deductions for ${employee.name}:`,
              employeeActiveDeductions
            );

            const activeDeductions = employeeActiveDeductions.reduce(
              (sum, d) => sum + Number(d.amount || 0),
              0
            );

            console.log(
              `${employee.name} - Fixed: ${fixedDeductions}, Advances: ${advanceDeductions}, Active: ${activeDeductions}`
            );

            const totalDeductions =
              fixedDeductions + advanceDeductions + activeDeductions;
            const netSalary = Number(employee.salary || 0) - totalDeductions;

            return (
              <Card key={employee.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{employee.name}</h3>
                      <Badge
                        variant={employee.active ? "default" : "secondary"}
                      >
                        {employee.active ? (
                          <>
                            <UserCheck className="h-3 w-3 ml-1" />
                            نشط
                          </>
                        ) : (
                          <>
                            <UserX className="h-3 w-3 ml-1" />
                            غير نشط
                          </>
                        )}
                      </Badge>
                      {(employee.role || employee.roleId) && (
                        <Badge variant="outline">
                          {(() => {
                            // إذا كان هناك roleId، ابحث عن الدور
                            if (employee.roleId) {
                              const role = roles.find(
                                (r) => r.id === employee.roleId
                              );
                              return role ? role.name : "غير محدد";
                            }
                            // Fallback للأدوار القديمة
                            if (employee.role === "admin") return "مدير نظام";
                            if (employee.role === "manager") return "مدير";
                            if (employee.role === "cashier") return "كاشير";
                            if (employee.role === "accountant") return "محاسب";
                            // إذا كان roleId محفوظ في role (الحالة الحالية)
                            const role = roles.find(
                              (r) => r.id === employee.role
                            );
                            return role ? role.name : employee.role;
                          })()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {employee.position}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      📱 {employee.phone}
                    </p>

                    {/* معلومات الراتب */}
                    <div className="mt-3 space-y-1 bg-muted/50 p-2 rounded">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          الراتب الإجمالي:
                        </span>
                        <span className="font-semibold text-primary">
                          {Number(employee.salary || 0).toFixed(2)} {currency}
                        </span>
                      </div>
                      {fixedDeductions > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            خصومات ثابتة:
                          </span>
                          <span className="font-semibold text-red-500">
                            - {fixedDeductions.toFixed(2)} {currency}
                          </span>
                        </div>
                      )}
                      {advanceDeductions > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            خصم السُلف:
                          </span>
                          <span className="font-semibold text-orange-500">
                            - {advanceDeductions.toFixed(2)} {currency}
                          </span>
                        </div>
                      )}
                      {activeDeductions > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              خصومات إضافية:
                            </span>
                            <span className="font-semibold text-purple-500">
                              - {activeDeductions.toFixed(2)} {currency}
                            </span>
                          </div>
                          {/* تفاصيل الخصومات النشطة */}
                          {employeeActiveDeductions.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between text-xs text-muted-foreground pr-2"
                            >
                              <span>
                                • {d.reason}
                                {d.type === "oneTime" && " (مرة واحدة)"}
                              </span>
                              <span>- {Number(d.amount || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {totalDeductions > 0 && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t">
                          <span className="text-muted-foreground">
                            إجمالي الخصومات:
                          </span>
                          <span className="font-semibold text-red-600">
                            - {totalDeductions.toFixed(2)} {currency}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm pt-1 border-t">
                        <span className="text-muted-foreground font-semibold">
                          الصافي:
                        </span>
                        <span className="font-bold text-green-600">
                          {netSalary.toFixed(2)} {currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t">
                        <span className="text-muted-foreground">
                          يوم الصرف:
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {employee.salaryDay || 1} من كل شهر
                        </Badge>
                      </div>
                      <div className="text-center mt-1">
                        <Badge
                          variant={
                            daysUntilSalary <= 3 ? "destructive" : "default"
                          }
                          className="text-xs"
                        >
                          ⏰ باقي {daysUntilSalary} يوم على الراتب
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    تاريخ التعيين:{" "}
                    {new Date(employee.hireDate).toLocaleDateString("ar-EG")}
                  </span>
                  <div className="flex gap-2">
                    {can("employees", "edit") &&
                      employeeActiveDeductions.some(
                        (d) => d.type === "oneTime"
                      ) && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1 bg-green-600 hover:bg-green-700"
                          onClick={() => handlePaySalary(employee)}
                        >
                          <Wallet className="h-3 w-3" />
                          صرف راتب
                        </Button>
                      )}
                    {can("employees", "edit") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(employee)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                    {can("employees", "delete") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(employee.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <DataPagination {...pagination} entityName="موظف" />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            dir="rtl"
            className="max-w-3xl max-h-[90vh] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingEmployee ? "تعديل بيانات موظف" : "إضافة موظف جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {/* القسم الأول: المعلومات الشخصية */}
                <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <div className="w-1 h-5 bg-primary rounded"></div>
                    المعلومات الشخصية
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>الاسم الكامل *</Label>
                      <Input
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="أدخل الاسم الكامل"
                      />
                    </div>
                    <div>
                      <Label>رقم الهاتف *</Label>
                      <Input
                        required
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="01xxxxxxxxx"
                      />
                    </div>
                    <div>
                      <Label>الرقم القومي *</Label>
                      <Input
                        required
                        value={formData.nationalId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            nationalId: e.target.value,
                          })
                        }
                        placeholder="14 رقم"
                      />
                    </div>
                    <div>
                      <Label>الوظيفة *</Label>
                      <Input
                        required
                        value={formData.position}
                        onChange={(e) =>
                          setFormData({ ...formData, position: e.target.value })
                        }
                        placeholder="المسمى الوظيفي"
                      />
                    </div>
                  </div>
                </div>

                {/* القسم الثاني: بيانات تسجيل الدخول */}
                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <div className="w-1 h-5 bg-blue-500 rounded"></div>
                    بيانات تسجيل الدخول
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>اسم المستخدم {!editingEmployee && "*"}</Label>
                      <Input
                        required={!editingEmployee}
                        value={formData.username}
                        onChange={(e) =>
                          setFormData({ ...formData, username: e.target.value })
                        }
                        placeholder="username"
                        disabled={!!editingEmployee}
                        className={
                          editingEmployee ? "bg-muted cursor-not-allowed" : ""
                        }
                      />
                      {editingEmployee && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ⚠️ لا يمكن تغيير اسم المستخدم
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>كلمة المرور {!editingEmployee && "*"}</Label>
                      <Input
                        type="password"
                        required={!editingEmployee}
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        placeholder={
                          editingEmployee
                            ? "اتركها فارغة لعدم التغيير"
                            : "أدخل كلمة المرور"
                        }
                      />
                      {editingEmployee && (
                        <p className="text-xs text-muted-foreground mt-1">
                          💡 اتركها فارغة للإبقاء على كلمة المرور الحالية
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <Label>الدور الوظيفي (الصلاحيات) *</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) =>
                          setFormData({ ...formData, role: value })
                        }
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الدور الوظيفي" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              لا توجد أدوار. يرجى إضافة أدوار من صفحة الصلاحيات
                            </div>
                          ) : (
                            roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-3 h-3 rounded-full ${role.color}`}
                                  />
                                  <span className="font-medium">
                                    {role.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({role.nameEn})
                                  </span>
                                  {role.isDefault && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      افتراضي
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {formData.role && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {(() => {
                            const selectedRole = roles.find(
                              (r) => r.id === formData.role
                            );
                            if (selectedRole) {
                              return `📋 ${
                                selectedRole.description || "لا يوجد وصف"
                              }`;
                            }
                            return "";
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* القسم الثالث: البيانات المالية والإدارية */}
                <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <div className="w-1 h-5 bg-green-500 rounded"></div>
                    البيانات المالية والإدارية
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>الراتب الشهري *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={formData.salary}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            salary: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>يوم صرف الراتب *</Label>
                      <Select
                        value={formData.salaryDay.toString()}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            salaryDay: parseInt(value),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر يوم الصرف" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(
                            (day) => (
                              <SelectItem key={day} value={day.toString()}>
                                اليوم {day} من كل شهر
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>الخصومات الشهرية الثابتة</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.deductions}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            deductions: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        💡 الخصومات التأمينات، القروض، إلخ
                      </p>
                    </div>
                    <div>
                      <Label>تاريخ التعيين *</Label>
                      <Input
                        type="date"
                        required
                        value={formData.hireDate}
                        onChange={(e) =>
                          setFormData({ ...formData, hireDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2 bg-background p-3 rounded border">
                      <input
                        type="checkbox"
                        id="active"
                        checked={formData.active}
                        onChange={(e) =>
                          setFormData({ ...formData, active: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      <Label htmlFor="active" className="cursor-pointer">
                        ✅ الموظف نشط ويمكنه تسجيل الدخول
                      </Label>
                    </div>
                  </div>
                </div>

                {/* القسم الرابع: ملاحظات إضافية */}
                <div className="bg-muted/30 p-4 rounded-lg space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <div className="w-1 h-5 bg-gray-500 rounded"></div>
                    ملاحظات إضافية
                  </h3>
                  <div>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      placeholder="أي ملاحظات أو معلومات إضافية عن الموظف..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
                <Button type="submit" className="gap-2">
                  {editingEmployee ? "حفظ التعديلات" : "إضافة الموظف"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Employees;

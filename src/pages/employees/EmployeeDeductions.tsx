import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Calendar, DollarSign } from "lucide-react";
import { db, EmployeeDeduction, Employee } from "@/shared/lib/indexedDB";
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

const EmployeeDeductions = () => {
  const { can, user } = useAuth();
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeduction, setEditingDeduction] =
    useState<EmployeeDeduction | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const { toast } = useToast();
  const { getSetting } = useSettingsContext();
  const currency = getSetting("currency") || "EGP";

  const [formData, setFormData] = useState({
    employeeId: "",
    amount: 0,
    type: "fixed" as "fixed" | "oneTime",
    reason: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    status: "active" as "active" | "completed" | "cancelled",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [deductionsData, employeesData] = await Promise.all([
      db.getAll<EmployeeDeduction>("employeeDeductions"),
      db.getAll<Employee>("employees"),
    ]);
    console.log("All employees:", employeesData);
    const activeEmployees = employeesData.filter((e) => e.active);
    console.log("Active employees:", activeEmployees);
    setDeductions(deductionsData);
    setEmployees(activeEmployees);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: "خطأ",
        description: "يجب تسجيل الدخول أولاً",
        variant: "destructive",
      });
      return;
    }

    const employee = employees.find((emp) => emp.id === formData.employeeId);
    if (!employee) {
      toast({
        title: "خطأ",
        description: "يجب اختيار موظف",
        variant: "destructive",
      });
      return;
    }

    try {
      const deduction: EmployeeDeduction = {
        id: editingDeduction?.id || Date.now().toString(),
        employeeId: formData.employeeId,
        employeeName: employee.name,
        amount: formData.amount,
        type: formData.type,
        reason: formData.reason,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        status: formData.status,
        userId: user.id,
        userName: user.name,
        notes: formData.notes,
        createdAt: editingDeduction?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingDeduction) {
        await db.update("employeeDeductions", deduction);
        toast({ title: "تم تحديث الخصم بنجاح" });
      } else {
        await db.add("employeeDeductions", deduction);
        toast({ title: "تم إضافة الخصم بنجاح" });
      }

      resetForm();
      loadData();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ البيانات",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (deduction: EmployeeDeduction) => {
    setEditingDeduction(deduction);
    setFormData({
      employeeId: deduction.employeeId,
      amount: deduction.amount,
      type: deduction.type,
      reason: deduction.reason,
      startDate: deduction.startDate,
      endDate: deduction.endDate || "",
      status: deduction.status,
      notes: deduction.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الخصم؟")) {
      await db.delete("employeeDeductions", id);
      toast({ title: "تم حذف الخصم بنجاح" });
      loadData();
    }
  };

  const handleStatusChange = async (
    deduction: EmployeeDeduction,
    newStatus: "active" | "completed" | "cancelled"
  ) => {
    const updated: EmployeeDeduction = {
      ...deduction,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    await db.update("employeeDeductions", updated);
    toast({ title: "تم تحديث حالة الخصم" });
    loadData();
  };

  const resetForm = () => {
    setFormData({
      employeeId: "",
      amount: 0,
      type: "fixed",
      reason: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      status: "active",
      notes: "",
    });
    setEditingDeduction(null);
    setDialogOpen(false);
  };

  const filteredDeductions = deductions.filter((deduction) => {
    const matchesSearch =
      deduction.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deduction.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEmployee =
      selectedEmployee === "all" || deduction.employeeId === selectedEmployee;
    const matchesStatus =
      selectedStatus === "all" || deduction.status === selectedStatus;

    return matchesSearch && matchesEmployee && matchesStatus;
  });

  // حساب الإحصائيات
  const stats = {
    activeDeductions: deductions.filter((d) => d.status === "active").length,
    totalActiveAmount: deductions
      .filter((d) => d.status === "active")
      .reduce((sum, d) => sum + d.amount, 0),
    completedDeductions: deductions.filter((d) => d.status === "completed")
      .length,
    cancelledDeductions: deductions.filter((d) => d.status === "cancelled")
      .length,
  };

  // حساب الخصومات لكل موظف
  const employeeDeductionsMap = new Map<string, number>();
  deductions
    .filter((d) => d.status === "active")
    .forEach((deduction) => {
      const current = employeeDeductionsMap.get(deduction.employeeId) || 0;
      employeeDeductionsMap.set(
        deduction.employeeId,
        current + deduction.amount
      );
    });

  if (!can("employees", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <p className="text-destructive font-semibold">
              ⚠️ ليس لديك صلاحية لعرض هذه الصفحة
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">خصومات الموظفين</h1>
          {can("employees", "create") && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة خصم
            </Button>
          )}
        </div>

        {/* بطاقات الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">خصومات نشطة</p>
                <p className="text-2xl font-bold">{stats.activeDeductions}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-full">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  إجمالي المبالغ النشطة
                </p>
                <p className="text-2xl font-bold">
                  {stats.totalActiveAmount.toFixed(2)} {currency}
                </p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-full">
                <DollarSign className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">خصومات مكتملة</p>
                <p className="text-2xl font-bold">
                  {stats.completedDeductions}
                </p>
              </div>
              <div className="p-3 bg-gray-500/10 rounded-full">
                <DollarSign className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">خصومات ملغية</p>
                <p className="text-2xl font-bold">
                  {stats.cancelledDeductions}
                </p>
              </div>
              <div className="p-3 bg-red-500/10 rounded-full">
                <DollarSign className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </Card>
        </div>

        {/* الفلترة والبحث */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث في الخصومات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger>
              <SelectValue placeholder="كل الموظفين" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموظفين</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* قائمة الخصومات */}
        <div className="grid grid-cols-1 gap-4">
          {filteredDeductions.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              لا توجد خصومات
            </Card>
          ) : (
            filteredDeductions.map((deduction) => (
              <Card key={deduction.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">
                        {deduction.employeeName}
                      </h3>
                      <Badge
                        variant={
                          deduction.status === "active"
                            ? "default"
                            : deduction.status === "completed"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {deduction.status === "active" && "نشط"}
                        {deduction.status === "completed" && "مكتمل"}
                        {deduction.status === "cancelled" && "ملغي"}
                      </Badge>
                      <Badge variant="outline">
                        {deduction.type === "fixed"
                          ? "خصم ثابت"
                          : "خصم لمرة واحدة"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">السبب: </span>
                        <span className="font-semibold">
                          {deduction.reason}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">المبلغ: </span>
                        <span className="font-bold text-red-500">
                          {deduction.amount.toFixed(2)} {currency}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          تاريخ البداية:{" "}
                        </span>
                        <span>
                          {new Date(deduction.startDate).toLocaleDateString(
                            "ar-EG"
                          )}
                        </span>
                      </div>
                      {deduction.endDate && (
                        <div>
                          <span className="text-muted-foreground">
                            تاريخ النهاية:{" "}
                          </span>
                          <span>
                            {new Date(deduction.endDate).toLocaleDateString(
                              "ar-EG"
                            )}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">
                          أضيف بواسطة:{" "}
                        </span>
                        <span>{deduction.userName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          تاريخ الإنشاء:{" "}
                        </span>
                        <span>
                          {new Date(deduction.createdAt).toLocaleDateString(
                            "ar-EG"
                          )}
                        </span>
                      </div>
                    </div>

                    {deduction.notes && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                        <span className="text-muted-foreground">ملاحظات: </span>
                        {deduction.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {can("employees", "edit") &&
                      deduction.status === "active" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(deduction)}
                          >
                            <Edit className="h-3 w-3 ml-1" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              handleStatusChange(deduction, "completed")
                            }
                          >
                            إكمال
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              handleStatusChange(deduction, "cancelled")
                            }
                          >
                            إلغاء
                          </Button>
                        </>
                      )}
                    {can("employees", "delete") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(deduction.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* نموذج إضافة/تعديل الخصم */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingDeduction ? "تعديل الخصم" : "إضافة خصم جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <Label>الموظف *</Label>
                  <Select
                    value={formData.employeeId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, employeeId: value })
                    }
                    disabled={!!editingDeduction}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.length === 0 ? (
                        <SelectItem value="no-employees" disabled>
                          لا يوجد موظفين نشطين
                        </SelectItem>
                      ) : (
                        employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.name} - {emp.position}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {employees.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      ⚠️ يجب إضافة موظفين نشطين أولاً
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>نوع الخصم *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: "fixed" | "oneTime") =>
                        setFormData({ ...formData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">خصم ثابت (شهري)</SelectItem>
                        <SelectItem value="oneTime">خصم لمرة واحدة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>المبلغ *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <Label>السبب *</Label>
                  <Input
                    required
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="مثال: تأمينات، غياب، خصم إداري..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ البداية *</Label>
                    <Input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) =>
                        setFormData({ ...formData, startDate: e.target.value })
                      }
                    />
                  </div>

                  {formData.type === "fixed" && (
                    <div>
                      <Label>تاريخ النهاية (اختياري)</Label>
                      <Input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) =>
                          setFormData({ ...formData, endDate: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label>الحالة *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(
                      value: "active" | "completed" | "cancelled"
                    ) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">نشط</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>ملاحظات</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="أي ملاحظات إضافية..."
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter className="mt-6 gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
                <Button type="submit">
                  {editingDeduction ? "حفظ التعديلات" : "إضافة الخصم"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EmployeeDeductions;

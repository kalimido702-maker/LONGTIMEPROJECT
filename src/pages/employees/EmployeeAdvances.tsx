import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Search,
} from "lucide-react";
import {
  db,
  EmployeeAdvance,
  Employee,
  EmployeeDeduction,
} from "@/shared/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const EmployeeAdvances = () => {
  const { can, user } = useAuth();
  const { toast } = useToast();
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: "",
    amount: "",
    reason: "",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [advs, emps] = await Promise.all([
        db.getAll<EmployeeAdvance>("employeeAdvances"),
        db.getAll<Employee>("employees"),
      ]);
      console.log("All employees:", emps);
      const activeEmployees = emps.filter((emp) => emp.active);
      console.log("Active employees:", activeEmployees);
      setAdvances(advs);
      setEmployees(activeEmployees);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "خطأ في تحميل البيانات",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employeeId || !formData.amount || !formData.reason) {
      toast({
        title: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    try {
      const employee = employees.find((emp) => emp.id === formData.employeeId);
      if (!employee) {
        toast({
          title: "الموظف غير موجود",
          variant: "destructive",
        });
        return;
      }

      const amount = parseFloat(formData.amount);

      const newAdvance: EmployeeAdvance = {
        id: Date.now().toString(),
        employeeId: formData.employeeId,
        employeeName: employee.name,
        amount,
        reason: formData.reason,
        status: "pending",
        paidAmount: 0,
        remainingAmount: amount,
        userId: user?.id || "",
        userName: user?.name || "",
        notes: formData.notes,
        createdAt: new Date().toISOString(),
      };

      await db.add("employeeAdvances", newAdvance);
      await loadData();

      toast({
        title: "تم إضافة السُلفة بنجاح",
      });

      setDialogOpen(false);
      setFormData({
        employeeId: "",
        amount: "",
        reason: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving advance:", error);
      toast({
        title: "خطأ في حفظ السُلفة",
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (advance: EmployeeAdvance) => {
    if (!can("employeeAdvances", "approve")) {
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية لاعتماد السُلف",
        variant: "destructive",
      });
      return;
    }

    try {
      // تحديث حالة السلفة إلى معتمدة
      const updatedAdvance: EmployeeAdvance = {
        ...advance,
        status: "approved",
        approvedBy: user?.name || "",
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.update("employeeAdvances", updatedAdvance);
      await loadData();

      toast({
        title: "تم اعتماد السُلفة",
        description: "السُلفة معتمدة ومتاحة للخصم من الراتب",
      });
    } catch (error) {
      console.error("Error approving advance:", error);
      toast({
        title: "خطأ في اعتماد السُلفة",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (advance: EmployeeAdvance) => {
    if (!can("employeeAdvances", "approve")) {
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية لرفض السُلف",
        variant: "destructive",
      });
      return;
    }

    try {
      const updatedAdvance: EmployeeAdvance = {
        ...advance,
        status: "rejected",
        approvedBy: user?.name || "",
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.update("employeeAdvances", updatedAdvance);
      await loadData();

      toast({
        title: "تم رفض السُلفة",
      });
    } catch (error) {
      console.error("Error rejecting advance:", error);
      toast({
        title: "خطأ في رفض السُلفة",
        variant: "destructive",
      });
    }
  };

  const filteredAdvances = advances.filter(
    (adv) =>
      adv.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adv.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Clock className="h-3 w-3" />
            قيد الانتظار
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="h-3 w-3" />
            معتمدة
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="h-3 w-3" />
            مرفوضة
          </span>
        );
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <CheckCircle className="h-3 w-3" />
            مسددة
          </span>
        );
      default:
        return null;
    }
  };

  if (!can("employeeAdvances", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية لعرض سُلف الموظفين
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            سُلف الموظفين
          </h1>
          {can("employeeAdvances", "create") && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              سُلفة جديدة
            </Button>
          )}
        </div>

        {/* Search */}
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="البحث في السُلف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">قيد الانتظار</p>
            <p className="text-2xl font-bold text-yellow-600">
              {advances.filter((a) => a.status === "pending").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">معتمدة</p>
            <p className="text-2xl font-bold text-green-600">
              {advances.filter((a) => a.status === "approved").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">مرفوضة</p>
            <p className="text-2xl font-bold text-red-600">
              {advances.filter((a) => a.status === "rejected").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">إجمالي المبالغ</p>
            <p className="text-2xl font-bold">
              {advances
                .filter((a) => a.status === "approved")
                .reduce((sum, a) => sum + a.amount, 0)
                .toFixed(2)}{" "}
              ج.م
            </p>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الموظف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>السبب</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAdvances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground">لا توجد سُلف</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdvances.map((advance) => (
                  <TableRow key={advance.id}>
                    <TableCell className="font-medium">
                      {advance.employeeName}
                    </TableCell>
                    <TableCell className="font-bold">
                      {advance.amount.toFixed(2)} ج.م
                    </TableCell>
                    <TableCell>{advance.reason}</TableCell>
                    <TableCell>{getStatusBadge(advance.status)}</TableCell>
                    <TableCell>
                      {advance.remainingAmount
                        ? `${advance.remainingAmount.toFixed(2)} ج.م`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {new Date(advance.createdAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>
                      {advance.status === "pending" &&
                        can("employeeAdvances", "approve") && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => handleApprove(advance)}
                            >
                              <CheckCircle className="h-3 w-3" />
                              اعتماد
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-red-600 hover:text-red-700"
                              onClick={() => handleReject(advance)}
                            >
                              <XCircle className="h-3 w-3" />
                              رفض
                            </Button>
                          </div>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Add Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>سُلفة جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>الموظف *</Label>
                <Select
                  value={formData.employeeId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, employeeId: value })
                  }
                  required
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
                    ⚠️ يجب إضافة موظفين نشطين أولاً من صفحة الموظفين
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>المبلغ (ج.م) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  placeholder="مثال: 1000"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>السبب *</Label>
                <Input
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  placeholder="مثال: ظروف طارئة، عملية جراحية، ..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="ملاحظات إضافية (اختياري)"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button type="submit">إضافة</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EmployeeAdvances;

import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, ExpenseItem, ExpenseCategory } from "@/shared/lib/indexedDB";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, RotateCcw, Trash2, CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ExcelExportButton } from "@/components/common/ExcelExportButton";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

// مصروف متكرر شهرياً
interface RecurringExpense {
  id: string;
  description: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  dayOfMonth: number; // 1-28
  active: boolean;
  createdAt: string;
  lastGeneratedMonth?: string; // "YYYY-MM" آخر شهر تم توليد مصروف فيه
}

const RECURRING_KEY = "pos-recurring-expenses";

const getRecurringExpenses = (): RecurringExpense[] => {
  try {
    const saved = localStorage.getItem(RECURRING_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveRecurringExpenses = (list: RecurringExpense[]) => {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(list));
};

// توليد المصاريف المتكررة تلقائياً للشهر الحالي
const processRecurringExpenses = async (userId: string, userName: string) => {
  const list = getRecurringExpenses();
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let generated = 0;

  for (const item of list) {
    if (!item.active) continue;
    if (item.lastGeneratedMonth === currentMonthKey) continue;

    // نتحقق هل اليوم >= يوم الاستحقاق؟
    if (now.getDate() < item.dayOfMonth) continue;

    // الحصول على وردية نشطة
    const shifts = await db.getAll<any>("shifts");
    const currentShift = shifts.find((s: any) => s.status === "active");
    if (!currentShift) continue; // يجب أن تكون فيه وردية مفتوحة

    const newExpense: ExpenseItem = {
      id: `recurring_${item.id}_${currentMonthKey}`,
      amount: item.amount,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      description: `${item.description} (متكرر شهري)`,
      userId,
      userName,
      shiftId: currentShift.id,
      notes: `مصروف متكرر - ${now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}`,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.add("expenseItems", newExpense);
      item.lastGeneratedMonth = currentMonthKey;
      generated++;
    } catch (error) {
      console.error(`Error generating recurring expense ${item.id}:`, error);
    }
  }

  if (generated > 0) {
    saveRecurringExpenses(list);
    console.log(`✅ Generated ${generated} recurring expenses for ${currentMonthKey}`);
  }

  return generated;
};

const Expenses = () => {
  const { can, user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    categoryId: "",
    description: "",
    notes: "",
  });

  // Filters
  const [filters, setFilters] = useState({
    categoryId: "",
    dateFrom: "",
    dateTo: "",
  });

  // Recurring expenses state
  const [recurringList, setRecurringList] = useState<RecurringExpense[]>([]);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    description: "",
    amount: "",
    categoryId: "",
    dayOfMonth: "1",
  });

  useEffect(() => {
    loadData();
    loadRecurring();
  }, []);

  useEffect(() => {
    filterExpenses();
  }, [expenses, filters]);

  const loadData = async () => {
    try {
      await db.init();
      const [expensesData, categoriesData] = await Promise.all([
        db.getAll<ExpenseItem>("expenseItems").catch(() => []),
        db.getAll<ExpenseCategory>("expenseCategories").catch(() => []),
      ]);

      setExpenses(
        (expensesData || []).sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
      );
      setCategories((categoriesData || []).filter((c) => c?.active));
    } catch (error) {
      console.error("❌ [Expenses] Error loading data:", error);
    }
  };

  const loadRecurring = async () => {
    setRecurringList(getRecurringExpenses());
    // معالجة المصاريف المتكررة تلقائياً
    const generated = await processRecurringExpenses(user?.id || "", user?.username || "");
    if (generated > 0) {
      toast({ title: `تم إنشاء ${generated} مصروف متكرر تلقائياً` });
      await loadData();
    }
  };

  const handleAddRecurring = () => {
    const amount = parseFloat(recurringForm.amount);
    if (!amount || amount <= 0 || !recurringForm.categoryId || !recurringForm.description.trim()) {
      toast({ title: "الرجاء ملء جميع الحقول", variant: "destructive" });
      return;
    }

    const category = categories.find((c) => c.id === recurringForm.categoryId);
    if (!category) return;

    const newRecurring: RecurringExpense = {
      id: Date.now().toString(),
      description: recurringForm.description.trim(),
      amount,
      categoryId: category.id,
      categoryName: category.name,
      dayOfMonth: parseInt(recurringForm.dayOfMonth) || 1,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [...recurringList, newRecurring];
    saveRecurringExpenses(updated);
    setRecurringList(updated);
    setRecurringForm({ description: "", amount: "", categoryId: "", dayOfMonth: "1" });
    setShowRecurringDialog(false);
    toast({ title: "تم إضافة المصروف المتكرر" });
  };

  const handleToggleRecurring = (id: string) => {
    const updated = recurringList.map((r) =>
      r.id === id ? { ...r, active: !r.active } : r
    );
    saveRecurringExpenses(updated);
    setRecurringList(updated);
  };

  const handleDeleteRecurring = (id: string) => {
    if (!confirm("هل تريد حذف هذا المصروف المتكرر؟")) return;
    const updated = recurringList.filter((r) => r.id !== id);
    saveRecurringExpenses(updated);
    setRecurringList(updated);
    toast({ title: "تم حذف المصروف المتكرر" });
  };

  const filterExpenses = () => {
    let filtered = [...expenses];

    if (filters.categoryId && filters.categoryId !== "all") {
      filtered = filtered.filter((e) => e.categoryId === filters.categoryId);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((e) => new Date(e.createdAt) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => new Date(e.createdAt) <= toDate);
    }

    setFilteredExpenses(filtered);
  };

  const pagination = usePagination(filteredExpenses, {
    resetDeps: [filters],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({ title: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!formData.categoryId) {
      toast({ title: "الرجاء اختيار الفئة", variant: "destructive" });
      return;
    }

    if (!formData.description.trim()) {
      toast({ title: "الرجاء إدخال وصف المصروف", variant: "destructive" });
      return;
    }

    try {
      const category = categories.find((c) => c.id === formData.categoryId);
      if (!category) {
        toast({ title: "الفئة غير موجودة", variant: "destructive" });
        return;
      }

      // Get current active shift - CRITICAL: must exist!
      const shifts = await db.getAll<any>("shifts");
      const currentShift = shifts.find((s) => s.status === "active");
      console.log("currentShift", currentShift);

      if (!currentShift) {
        toast({
          title: "يجب فتح وردية أولاً",
          description: "لا يمكن إضافة مصروف بدون وردية مفتوحة",
          variant: "destructive",
        });
        return;
      }

      const newExpense: ExpenseItem = {
        id: Date.now().toString(),
        amount: parseFloat(formData.amount),
        categoryId: category.id,
        categoryName: category.name,
        description: formData.description.trim(),
        userId: user?.id || "",
        userName: user?.username || "",
        shiftId: currentShift.id,
        notes: formData.notes.trim(),
        createdAt: new Date().toISOString(),
      };

      await db.add("expenseItems", newExpense);
      toast({ title: "تم إضافة المصروف بنجاح" });
      await loadData();
      resetForm();
      setShowDialog(false);
    } catch (error) {
      console.error("Error saving expense:", error);
      toast({ title: "حدث خطأ أثناء حفظ المصروف", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      amount: "",
      categoryId: "",
      description: "",
      notes: "",
    });
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    resetForm();
  };

  const getTotalAmount = () => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  };

  const getCategoryBreakdown = () => {
    const breakdown = new Map<
      string,
      { name: string; total: number; count: number }
    >();

    filteredExpenses.forEach((expense) => {
      const existing = breakdown.get(expense.categoryId);
      if (existing) {
        existing.total += expense.amount;
        existing.count += 1;
      } else {
        breakdown.set(expense.categoryId, {
          name: expense.categoryName,
          total: expense.amount,
          count: 1,
        });
      }
    });

    return Array.from(breakdown.values()).sort((a, b) => b.total - a.total);
  };

  if (!can("expenses", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <div className="text-center text-red-600">
            ليس لديك صلاحية لعرض هذه الصفحة
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">المصروفات</h1>
          {can("expenses", "create") && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="ml-2 h-4 w-4" />
              مصروف جديد
            </Button>
          )}
          <ExcelExportButton
            data={filteredExpenses}
            columns={[
              { header: "التاريخ", key: "createdAt", width: 18, formatter: (val) => new Date(val).toLocaleString("ar-EG") },
              { header: "المبلغ", key: "amount", width: 12 },
              { header: "الفئة", key: "categoryName", width: 15 },
              { header: "الوصف", key: "description", width: 25 },
              { header: "المستخدم", key: "userName", width: 15 },
              { header: "ملاحظات", key: "notes", width: 25 },
            ]}
            filename={`المصروفات_${new Date().toLocaleDateString("ar-EG")}`}
            sheetName="المصروفات"
          />
        </div>

        {/* Filters */}
        <div className="mb-6 bg-muted p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4" />
            <span className="font-semibold">تصفية</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select
                value={filters.categoryId}
                onValueChange={(value) =>
                  setFilters({ ...filters, categoryId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع الفئات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفئات</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950 dark:border-red-800">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-red-800 dark:text-red-200">
                إجمالي المصروفات:
              </span>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                {getTotalAmount().toFixed(2)} ج.م
              </span>
            </div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">
              عدد المصروفات: {filteredExpenses.length}
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="p-4 bg-muted border rounded-lg">
          <div className="font-semibold mb-2">التوزيع حسب الفئة:</div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {getCategoryBreakdown().map((item) => (
              <div key={item.name} className="flex justify-between text-sm">
                <span>
                  {item.name} ({item.count})
                </span>
                <span className="font-semibold">
                  {item.total.toFixed(2)} ج.م
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recurring Expenses Section */}
        {can("expenses", "create") && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-blue-800 dark:text-blue-200">
                  مصروفات متكررة شهرياً
                </span>
                <Badge variant="secondary">{recurringList.filter((r) => r.active).length} نشط</Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRecurringDialog(true)}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                إضافة
              </Button>
            </div>

            {recurringList.length > 0 ? (
              <div className="space-y-2">
                {recurringList.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded border ${
                      item.active
                        ? "bg-white dark:bg-background border-blue-100 dark:border-blue-800"
                        : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={item.active}
                        onCheckedChange={() => handleToggleRecurring(item.id)}
                      />
                      <div>
                        <span className="font-medium">{item.description}</span>
                        <span className="text-sm text-muted-foreground mr-2">
                          ({item.categoryName})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-red-600">
                        {item.amount.toFixed(2)} ج.م
                      </span>
                      <Badge variant="outline" className="text-xs">
                        يوم {item.dayOfMonth}
                      </Badge>
                      {item.lastGeneratedMonth && (
                        <Badge variant="secondary" className="text-xs">
                          آخر: {item.lastGeneratedMonth}
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500"
                        onClick={() => handleDeleteRecurring(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">
                لا توجد مصروفات متكررة — أضف إيجار أو اشتراكات ثابتة
              </p>
            )}
          </div>
        )}

        {/* Expenses Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ والوقت</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الفئة</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-gray-500 py-8"
                  >
                    لا توجد مصروفات
                  </TableCell>
                </TableRow>
              ) : (
                pagination.paginatedItems.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      {expense.createdAt ? new Date(expense.createdAt).toLocaleString("ar-EG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }) : "-"}
                    </TableCell>
                    <TableCell className="font-bold text-red-600">
                      {(Number(expense.amount) || 0).toFixed(2)} ج.م
                    </TableCell>
                    <TableCell>
                      <span className="inline-block px-2 py-1 bg-muted rounded text-sm">
                        {expense.categoryName}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {expense.description}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {expense.userName}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {expense.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DataPagination {...pagination} entityName="مصروف" />

        {/* Add Dialog */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>مصروف جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">المبلغ *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">الفئة *</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, categoryId: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectItem value="no-categories" disabled>
                        لا توجد فئات نشطة
                      </SelectItem>
                    ) : (
                      categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">الوصف *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="وصف المصروف"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="ملاحظات اختيارية..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  إلغاء
                </Button>
                <Button type="submit">إضافة المصروف</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {/* Add Recurring Expense Dialog */}
        <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                إضافة مصروف متكرر شهرياً
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>الوصف *</Label>
                <Input
                  value={recurringForm.description}
                  onChange={(e) =>
                    setRecurringForm({ ...recurringForm, description: e.target.value })
                  }
                  placeholder="مثال: إيجار المحل"
                />
              </div>

              <div className="space-y-2">
                <Label>المبلغ الشهري *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={recurringForm.amount}
                  onChange={(e) =>
                    setRecurringForm({ ...recurringForm, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>الفئة *</Label>
                <Select
                  value={recurringForm.categoryId}
                  onValueChange={(value) =>
                    setRecurringForm({ ...recurringForm, categoryId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>يوم الاستحقاق من كل شهر</Label>
                <Select
                  value={recurringForm.dayOfMonth}
                  onValueChange={(value) =>
                    setRecurringForm({ ...recurringForm, dayOfMonth: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        اليوم {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  سيتم إنشاء المصروف تلقائياً عند فتح الصفحة بعد هذا اليوم
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRecurringDialog(false)}
                >
                  إلغاء
                </Button>
                <Button onClick={handleAddRecurring}>إضافة</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Expenses;

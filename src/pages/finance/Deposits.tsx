import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, Deposit, DepositSource } from "@/shared/lib/indexedDB";
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
import { Plus, Filter } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const Deposits = () => {
  const { can, user } = useAuth();
  const { toast } = useToast();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filteredDeposits, setFilteredDeposits] = useState<Deposit[]>([]);
  const [sources, setSources] = useState<DepositSource[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    sourceId: "",
    notes: "",
  });

  // Filters
  const [filters, setFilters] = useState({
    sourceId: "",
    dateFrom: "",
    dateTo: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterDeposits();
  }, [deposits, filters]);

  const loadData = async () => {
    await db.init();
    const [depositsData, sourcesData] = await Promise.all([
      db.getAll<Deposit>("deposits"),
      db.getAll<DepositSource>("depositSources"),
    ]);

    setDeposits(
      depositsData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    setSources(sourcesData.filter((s) => s.active));
  };

  const filterDeposits = () => {
    let filtered = [...deposits];

    if (filters.sourceId && filters.sourceId !== "all") {
      filtered = filtered.filter((d) => d.sourceId === filters.sourceId);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((d) => new Date(d.createdAt) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((d) => new Date(d.createdAt) <= toDate);
    }

    setFilteredDeposits(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({ title: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!formData.sourceId) {
      toast({ title: "الرجاء اختيار المصدر", variant: "destructive" });
      return;
    }

    try {
      const source = sources.find((s) => s.id === formData.sourceId);
      if (!source) {
        toast({ title: "المصدر غير موجود", variant: "destructive" });
        return;
      }

      // Get current active shift - CRITICAL: must exist!
      const shifts = await db.getAll<any>("shifts");
      const currentShift = shifts.find((s) => s.status === "active");

      if (!currentShift) {
        toast({
          title: "يجب فتح وردية أولاً",
          description: "لا يمكن إضافة إيداع بدون وردية مفتوحة",
          variant: "destructive",
        });
        return;
      }

      const newDeposit: Deposit = {
        id: Date.now().toString(),
        amount: parseFloat(formData.amount),
        sourceId: source.id,
        sourceName: source.name,
        userId: user?.id || "",
        userName: user?.username || "",
        shiftId: currentShift.id,
        notes: formData.notes.trim(),
        createdAt: new Date().toISOString(),
      };

      await db.add("deposits", newDeposit);
      toast({ title: "تم إضافة الإيداع بنجاح" });
      await loadData();
      resetForm();
      setShowDialog(false);
    } catch (error) {
      console.error("Error saving deposit:", error);
      toast({ title: "حدث خطأ أثناء حفظ الإيداع", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      amount: "",
      sourceId: "",
      notes: "",
    });
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    resetForm();
  };

  const getTotalAmount = () => {
    return filteredDeposits.reduce((sum, d) => sum + d.amount, 0);
  };

  if (!can("deposits", "view")) {
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
          <h1 className="text-3xl font-bold">الإيداعات</h1>
          {can("deposits", "create") && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="ml-2 h-4 w-4" />
              إيداع جديد
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 bg-muted p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4" />
            <span className="font-semibold">تصفية</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>المصدر</Label>
              <Select
                value={filters.sourceId}
                onValueChange={(value) =>
                  setFilters({ ...filters, sourceId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع المصادر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المصادر</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
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
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950 dark:border-green-800">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-green-800 dark:text-green-200">
              إجمالي الإيداعات:
            </span>
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
              {getTotalAmount().toFixed(2)} ج.م
            </span>
          </div>
          <div className="text-sm text-green-700 dark:text-green-300 mt-1">
            عدد الإيداعات: {filteredDeposits.length}
          </div>
        </div>

        {/* Deposits Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ والوقت</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">المصدر</TableHead>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">الملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeposits.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-gray-500 py-8"
                  >
                    لا توجد إيداعات
                  </TableCell>
                </TableRow>
              ) : (
                filteredDeposits.map((deposit) => (
                  <TableRow key={deposit.id}>
                    <TableCell>
                      {new Date(deposit.createdAt).toLocaleString("ar-EG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="font-bold text-green-600">
                      {deposit.amount.toFixed(2)} ج.م
                    </TableCell>
                    <TableCell>{deposit.sourceName}</TableCell>
                    <TableCell className="text-gray-600">
                      {deposit.userName}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {deposit.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add Dialog */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إيداع جديد</DialogTitle>
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
                <Label htmlFor="sourceId">المصدر *</Label>
                <Select
                  value={formData.sourceId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, sourceId: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المصدر" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.length === 0 ? (
                      <SelectItem value="no-sources" disabled>
                        لا توجد مصادر نشطة
                      </SelectItem>
                    ) : (
                      sources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
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
                <Button type="submit">إضافة الإيداع</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Deposits;

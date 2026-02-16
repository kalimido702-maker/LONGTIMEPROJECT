import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, Invoice, Customer, PaymentMethod, SalesRep } from "@/shared/lib/indexedDB";
import { toast } from "sonner";
import {
  CreditCard,
  AlertCircle,
  DollarSign,
  Search,
  User,
  Calendar,
  Filter,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { exportToExcel } from "@/lib/reportExport";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Credit() {
  const { can } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isCustomerPaymentDialogOpen, setIsCustomerPaymentDialogOpen] =
    useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState<string>("all");
  const [filterSupervisorId, setFilterSupervisorId] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [supervisors, setSupervisors] = useState<SalesRep[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const { getBalance, refresh: refreshBalances } = useCustomerBalances([customers]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const allInvoices = await db.getAll<Invoice>("invoices");
    const creditInvoices = allInvoices.filter(
      (inv) => inv.paymentType === "credit"
    );
    setInvoices(creditInvoices);

    const allCustomers = await db.getAll<Customer>("customers");
    setCustomers(allCustomers);

    // Load payment methods
    const methods = await db.getAll<PaymentMethod>("paymentMethods");
    setPaymentMethods(methods.filter((m) => m.isActive));

    // Load sales reps and supervisors
    const allReps = await db.getAll<SalesRep>("salesReps");
    setSalesReps(allReps);
    const supervisorReps = allReps.filter((r: any) => r.role === "supervisor" || r.isSupervisor);
    setSupervisors(supervisorReps);
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount("");
    const cashMethod = paymentMethods.find((m) => m.type === "cash");
    setSelectedPaymentMethodId(cashMethod?.id || paymentMethods[0]?.id || "");
    setIsPaymentDialogOpen(true);
  };

  const handlePayment = async () => {
    if (!selectedInvoice) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }

    if (amount > selectedInvoice.remainingAmount) {
      toast.error("المبلغ المدخل أكبر من المبلغ المتبقي");
      return;
    }

    if (!selectedPaymentMethodId) {
      toast.error("الرجاء اختيار طريقة الدفع");
      return;
    }

    try {
      const updatedInvoice: Invoice = {
        ...selectedInvoice,
        paidAmount: selectedInvoice.paidAmount + amount,
        remainingAmount: selectedInvoice.remainingAmount - amount,
        paymentStatus:
          selectedInvoice.remainingAmount - amount <= 0 ? "paid" : "partial",
      };

      await db.update("invoices", updatedInvoice);

      // Update customer balance
      if (selectedInvoice.customerId) {
        const customer = await db.get<Customer>(
          "customers",
          selectedInvoice.customerId
        );
        if (customer) {
          customer.currentBalance -= amount;
          await db.update("customers", customer);
        }
      }

      // Create payment record for tracking
      const selectedMethod = paymentMethods.find(
        (m) => m.id === selectedPaymentMethodId
      );
      const paymentRecord = {
        id: `credit_payment_${Date.now()}`,
        invoiceId: selectedInvoice.id,
        customerId: selectedInvoice.customerId,
        amount: amount,
        paymentMethodId: selectedPaymentMethodId,
        paymentMethodName: selectedMethod?.name || "غير محدد",
        paymentType: "credit_payment",
        shiftId: undefined,
        createdAt: new Date().toISOString(),
      };
      await db.add("payments", paymentRecord);

      toast.success("تم تسجيل الدفعة بنجاح");
      loadData();
      setIsPaymentDialogOpen(false);
      setSelectedInvoice(null);
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("حدث خطأ أثناء تسجيل الدفعة");
    }
  };

  // دفع من رصيد العميل الإجمالي
  const openCustomerPaymentDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPaymentAmount("");
    const cashMethod = paymentMethods.find((m) => m.type === "cash");
    setSelectedPaymentMethodId(cashMethod?.id || paymentMethods[0]?.id || "");
    setIsCustomerPaymentDialogOpen(true);
  };

  const handleCustomerPayment = async () => {
    if (!selectedCustomer) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }

    if (amount > getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0)) {
      toast.error("المبلغ المدخل أكبر من رصيد العميل");
      return;
    }

    if (!selectedPaymentMethodId) {
      toast.error("الرجاء اختيار طريقة الدفع");
      return;
    }

    try {
      // جلب جميع فواتير العميل الآجلة
      const customerInvoices = invoices
        .filter(
          (inv) =>
            inv.customerId === selectedCustomer.id && inv.remainingAmount > 0
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ); // الأقدم أولاً

      let remainingPayment = amount;

      // توزيع المبلغ على الفواتير من الأقدم للأحدث
      for (const invoice of customerInvoices) {
        if (remainingPayment <= 0) break;

        const paymentForThisInvoice = Math.min(
          remainingPayment,
          invoice.remainingAmount
        );

        const updatedInvoice: Invoice = {
          ...invoice,
          paidAmount: invoice.paidAmount + paymentForThisInvoice,
          remainingAmount: invoice.remainingAmount - paymentForThisInvoice,
          paymentStatus:
            invoice.remainingAmount - paymentForThisInvoice <= 0.01
              ? "paid"
              : "partial",
        };

        await db.update("invoices", updatedInvoice);
        remainingPayment -= paymentForThisInvoice;
      }

      // تحديث رصيد العميل
      const updatedCustomer: Customer = {
        ...selectedCustomer,
        currentBalance: selectedCustomer.currentBalance - amount,
      };
      await db.update("customers", updatedCustomer);

      // Create payment record for tracking
      const selectedMethod = paymentMethods.find(
        (m) => m.id === selectedPaymentMethodId
      );
      const paymentRecord = {
        id: `credit_payment_${Date.now()}`,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount: amount,
        paymentMethodId: selectedPaymentMethodId,
        paymentMethodName: selectedMethod?.name || "غير محدد",
        paymentType: "credit_payment",
        shiftId: undefined,
        createdAt: new Date().toISOString(),
      };
      await db.add("payments", paymentRecord);

      toast.success(`تم تسجيل دفعة بقيمة ${amount.toFixed(2)} جنيه`);
      loadData();
      setIsCustomerPaymentDialogOpen(false);
      setSelectedCustomer(null);
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("حدث خطأ أثناء تسجيل الدفعة");
    }
  };

  const getTotalCredit = () => {
    // استخدام الرصيد المحسوب الفعلي بدل الرصيد المخزن
    return customers.reduce((sum, c) => sum + Math.max(0, getBalance(c.id, Number(c.currentBalance) || 0)), 0);
  };

  const getOverdueInvoices = () => {
    const today = new Date();
    return invoices.filter(
      (inv) =>
        inv.dueDate && new Date(inv.dueDate) < today && inv.remainingAmount > 0
    );
  };

  const getCustomerName = (customerId?: string) => {
    if (!customerId) return "غير محدد";
    const customer = customers.find((c) => c.id === customerId);
    return customer?.name || "غير محدد";
  };

  const getDaysOverdue = (dueDate?: string) => {
    if (!dueDate) return 0;
    const today = new Date();
    const due = new Date(dueDate);
    const diff = Math.floor(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff > 0 ? diff : 0;
  };

  // الحصول على قائمة العملاء الذين لديهم ديون
  const getCustomersWithDebts = () => {
    // استخدام الرصيد المحسوب الفعلي
    return customers
      .filter((c) => getBalance(c.id, Number(c.currentBalance) || 0) > 0)
      .map((customer) => {
        const customerInvoices = invoices.filter(
          (inv) => inv.customerId === customer.id && inv.remainingAmount > 0
        );
        return {
          customer,
          totalDebt: getBalance(customer.id, Number(customer.currentBalance) || 0),
          invoiceCount: customerInvoices.length,
        };
      });
  };

  // تصفية الفواتير حسب البحث والعميل والمشرف والتاريخ
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      searchTerm === "" ||
      invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCustomerName(invoice.customerId)
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesCustomer =
      filterCustomerId === "all" || invoice.customerId === filterCustomerId;

    // Supervisor filter
    let matchesSupervisor = true;
    if (filterSupervisorId && filterSupervisorId !== "all") {
      const supervisorRepIds = salesReps
        .filter(r => r.supervisorId === filterSupervisorId)
        .map(r => r.id);
      const customer = customers.find(c => c.id === invoice.customerId);
      matchesSupervisor = !!(customer?.salesRepId && supervisorRepIds.includes(customer.salesRepId));
    }

    // Date range filter
    let matchesDate = true;
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && new Date(invoice.createdAt) >= fromDate;
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(invoice.createdAt) <= toDate;
    }

    return matchesSearch && matchesCustomer && matchesSupervisor && matchesDate;
  });

  // Excel export
  const handleExportToExcel = () => {
    if (filteredInvoices.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    exportToExcel({
      title: "تقرير المبيعات الآجلة",
      fileName: `تقرير_الآجل_${filterDateFrom || 'all'}_${filterDateTo || 'all'}`,
      data: filteredInvoices.map((inv) => ({
        customerName: getCustomerName(inv.customerId),
        date: new Date(inv.createdAt).toLocaleDateString("ar-EG"),
        total: Math.round(inv.total),
        paid: Math.round(inv.paidAmount),
        remaining: Math.round(inv.remainingAmount),
        invoiceNumber: inv.invoiceNumber || inv.id,
        status: inv.paymentStatus === "paid" ? "مكتمل" : inv.paymentStatus === "partial" ? "جزئي" : "غير مدفوع",
      })),
      columns: [
        { header: "اسم العميل", dataKey: "customerName" },
        { header: "التاريخ", dataKey: "date" },
        { header: "الإجمالي", dataKey: "total" },
        { header: "المدفوع", dataKey: "paid" },
        { header: "المتبقي", dataKey: "remaining" },
        { header: "رقم الفاتورة", dataKey: "invoiceNumber" },
        { header: "الحالة", dataKey: "status" },
      ],
      summary: [
        { label: "إجمالي الفواتير", value: filteredInvoices.length },
        { label: "إجمالي الديون", value: filteredInvoices.reduce((sum, inv) => sum + inv.remainingAmount, 0) },
      ],
    });

    toast.success("تم تصدير البيانات بنجاح");
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("credit", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض المبيعات الآجلة
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">إدارة المبيعات الآجلة</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي الديون</p>
                  <p className="text-2xl font-bold">
                    {getTotalCredit().toFixed(2)} جنيه
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-primary" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    الفواتير المتأخرة
                  </p>
                  <p className="text-2xl font-bold text-destructive">
                    {getOverdueInvoices().length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </Card>
          </div>

          {/* قائمة العملاء الذين لديهم ديون */}
          <Card className="mb-6">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <User className="h-5 w-5" />
                العملاء الذين لديهم ديون
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getCustomersWithDebts().map(
                  ({ customer, totalDebt, invoiceCount }) => (
                    <Card
                      key={customer.id}
                      className="p-4 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">
                            {customer.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {customer.phone}
                          </p>
                        </div>
                        <Badge variant="destructive">
                          {invoiceCount}{" "}
                          {invoiceCount === 1 ? "فاتورة" : "فواتير"}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            إجمالي الدين:
                          </span>
                          <span className="font-bold text-destructive">
                            {Number(totalDebt || 0).toFixed(2)} جنيه
                          </span>
                        </div>
                        {can("credit", "edit") && (
                          <Button
                            size="sm"
                            onClick={() => openCustomerPaymentDialog(customer)}
                            className="w-full"
                          >
                            تسديد من رصيد العميل
                          </Button>
                        )}
                      </div>
                    </Card>
                  )
                )}
                {getCustomersWithDebts().length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    لا يوجد عملاء لديهم ديون
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* البحث والتصفية */}
          <Card className="mb-6 p-4">
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                />
              </div>
              <Button
                variant={showAdvancedFilters ? "default" : "outline"}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                فلتر متقدم
              </Button>
            </div>
            {showAdvancedFilters && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">فلاتر متقدمة</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterCustomerId("all");
                      setFilterSupervisorId("all");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                      setSearchTerm("");
                    }}
                  >
                    <X className="h-4 w-4 ml-1" />
                    مسح الفلاتر
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label>العميل</Label>
                    <Select
                      value={filterCustomerId}
                      onValueChange={setFilterCustomerId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="جميع العملاء" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع العملاء</SelectItem>
                        {customers
                          .filter((c) =>
                            invoices.some((inv) => inv.customerId === c.id)
                          )
                          .map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>المشرف</Label>
                    <Select
                      value={filterSupervisorId}
                      onValueChange={setFilterSupervisorId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="جميع المشرفين" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع المشرفين</SelectItem>
                        {supervisors.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>
                            {sup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      من تاريخ
                    </Label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      إلى تاريخ
                    </Label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>تصدير</Label>
                    <Button
                      variant="outline"
                      onClick={handleExportToExcel}
                      className="w-full gap-2"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      تصدير Excel
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Badge variant="secondary" className="text-sm px-3">
                    {filteredInvoices.length} فاتورة
                  </Badge>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>تاريخ الاستحقاق</TableHead>
                  <TableHead>المبلغ الإجمالي</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const daysOverdue = getDaysOverdue(invoice.dueDate);
                  const isOverdue =
                    daysOverdue > 0 && invoice.remainingAmount > 0;

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.id}
                      </TableCell>
                      <TableCell>
                        {getCustomerName(invoice.customerId)}
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.createdAt).toLocaleDateString(
                          "ar-EG"
                        )}
                      </TableCell>
                      <TableCell>
                        {invoice.dueDate ? (
                          <span
                            className={
                              isOverdue ? "text-destructive font-semibold" : ""
                            }
                          >
                            {new Date(invoice.dueDate).toLocaleDateString(
                              "ar-EG"
                            )}
                            {isOverdue && ` (متأخر ${daysOverdue} يوم)`}
                          </span>
                        ) : (
                          "غير محدد"
                        )}
                      </TableCell>
                      <TableCell>{Number(invoice.total || 0).toFixed(2)} جنيه</TableCell>
                      <TableCell>
                        {Number(invoice.paidAmount || 0).toFixed(2)} جنيه
                      </TableCell>
                      <TableCell className="text-destructive font-semibold">
                        {Number(invoice.remainingAmount || 0).toFixed(2)} جنيه
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invoice.paymentStatus === "paid"
                              ? "default"
                              : invoice.paymentStatus === "partial"
                                ? "secondary"
                                : isOverdue
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {invoice.paymentStatus === "paid"
                            ? "مكتمل"
                            : invoice.paymentStatus === "partial"
                              ? "جزئي"
                              : isOverdue
                                ? "متأخر"
                                : "غير مدفوع"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {can("credit", "edit") && (
                          <Button
                            size="sm"
                            onClick={() => openPaymentDialog(invoice)}
                            disabled={invoice.paymentStatus === "paid"}
                          >
                            تسديد
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredInvoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-8"
                    >
                      {searchTerm || filterCustomerId !== "all"
                        ? "لا توجد نتائج تطابق البحث"
                        : "لا توجد فواتير آجلة"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Dialog
            open={isPaymentDialogOpen}
            onOpenChange={setIsPaymentDialogOpen}
          >
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>تسديد دفعة من فاتورة محددة</DialogTitle>
              </DialogHeader>
              {selectedInvoice && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        رقم الفاتورة
                      </p>
                      <p className="font-semibold">{selectedInvoice.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">العميل</p>
                      <p className="font-semibold">
                        {getCustomerName(selectedInvoice.customerId)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        المبلغ المتبقي
                      </p>
                      <p className="font-semibold text-destructive">
                        {Number(selectedInvoice.remainingAmount || 0).toFixed(2)} جنيه
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        المبلغ المدفوع
                      </p>
                      <p className="font-semibold">
                        {Number(selectedInvoice.paidAmount || 0).toFixed(2)} جنيه
                      </p>
                    </div>
                  </div>

                  {/* اختيار طريقة الدفع */}
                  <div className="space-y-2">
                    <Label>طريقة الدفع</Label>
                    <Select
                      value={selectedPaymentMethodId}
                      onValueChange={setSelectedPaymentMethodId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طريقة الدفع" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">مبلغ الدفعة</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      placeholder="أدخل المبلغ"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      min="0"
                      max={selectedInvoice.remainingAmount}
                      step="0.01"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setIsPaymentDialogOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button onClick={handlePayment}>تسديد</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Dialog لدفع من رصيد العميل */}
          <Dialog
            open={isCustomerPaymentDialogOpen}
            onOpenChange={setIsCustomerPaymentDialogOpen}
          >
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  تسديد من رصيد العميل
                </DialogTitle>
              </DialogHeader>
              {selectedCustomer && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">
                      معلومات العميل
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">الاسم:</span>
                        <span className="font-semibold">
                          {selectedCustomer.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">الهاتف:</span>
                        <span className="font-semibold">
                          {selectedCustomer.phone}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">الرصيد المستحق:</span>
                        <span className="font-semibold text-destructive">
                          {getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0).toFixed(2)} جنيه
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="text-amber-900">
                      <strong>ملاحظة:</strong> سيتم توزيع المبلغ تلقائياً على
                      جميع فواتير العميل بدءاً من الأقدم إلى الأحدث.
                    </p>
                  </div>

                  {/* اختيار طريقة الدفع */}
                  <div className="space-y-2">
                    <Label>طريقة الدفع</Label>
                    <Select
                      value={selectedPaymentMethodId}
                      onValueChange={setSelectedPaymentMethodId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طريقة الدفع" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-payment-amount">مبلغ الدفعة</Label>
                    <Input
                      id="customer-payment-amount"
                      type="number"
                      placeholder="أدخل المبلغ"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      min="0"
                      max={getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0)}
                      step="0.01"
                    />
                    <p className="text-xs text-muted-foreground">
                      الحد الأقصى: {getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0).toFixed(2)}{" "}
                      جنيه
                    </p>
                  </div>

                  {paymentAmount && parseFloat(paymentAmount) > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm text-green-900">
                        المبلغ المتبقي بعد الدفع:{" "}
                        <strong>
                          {(
                            getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0) -
                            parseFloat(paymentAmount)
                          ).toFixed(2)}{" "}
                          جنيه
                        </strong>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setIsCustomerPaymentDialogOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button onClick={handleCustomerPayment}>
                      تسديد من رصيد العميل
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

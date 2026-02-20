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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POSHeader } from "@/components/POS/POSHeader";
import {
  db,
  Invoice,
  InstallmentPayment,
  Customer,
  PaymentMethod,
} from "@/shared/lib/indexedDB";
import { toast } from "sonner";
import { Calendar, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

export default function Installments() {
  const { can } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null>(null);

  useEffect(() => {
    loadInstallments();
  }, []);

  const loadInstallments = async () => {
    const allInvoices = await db.getAll<Invoice>("invoices");
    const installmentInvoices = allInvoices.filter(
      (inv) => inv.paymentType === "installment" && inv.installmentPlan
    );
    setInvoices(installmentInvoices);

    // Load payment methods
    const methods = await db.getAll<PaymentMethod>("paymentMethods");
    setPaymentMethods(methods.filter((m) => m.isActive));
  };

  const handlePayInstallment = async (
    invoice: Invoice,
    installmentId: string
  ) => {
    if (!invoice.installmentPlan) return;

    if (!selectedPaymentMethodId) {
      toast.error("الرجاء اختيار طريقة الدفع أولاً");
      return;
    }

    try {
      const updatedPlan = { ...invoice.installmentPlan };
      const paymentIndex = updatedPlan.payments.findIndex(
        (p) => p.id === installmentId
      );

      if (paymentIndex === -1) return;

      const installmentAmount = updatedPlan.payments[paymentIndex].amount;

      updatedPlan.payments[paymentIndex] = {
        ...updatedPlan.payments[paymentIndex],
        paid: true,
        paidDate: new Date().toISOString(),
      };

      const paidAmount = updatedPlan.payments
        .filter((p) => p.paid)
        .reduce((sum, p) => sum + p.amount, 0);

      const updatedInvoice: Invoice = {
        ...invoice,
        installmentPlan: updatedPlan,
        paidAmount,
        remainingAmount: invoice.total - paidAmount,
        paymentStatus: paidAmount >= invoice.total ? "paid" : "partial",
      };

      await db.update("invoices", updatedInvoice);

      // Update customer balance
      if (invoice.customerId) {
        const customer = await db.get<Customer>("customers", invoice.customerId);
        if (customer) {
          customer.currentBalance -= installmentAmount;
          await db.update("customers", customer);
        }
      }

      // Create payment record for tracking
      const selectedMethod = paymentMethods.find(
        (m) => m.id === selectedPaymentMethodId
      );
      const paymentRecord = {
        id: `installment_payment_${Date.now()}`,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        amount: installmentAmount,
        paymentMethodId: selectedPaymentMethodId,
        paymentMethodName: selectedMethod?.name || "غير محدد",
        paymentType: "installment_payment",
        shiftId: undefined,
        createdAt: new Date().toISOString(),
      };
      await db.add("payments", paymentRecord);

      toast.success("تم تسجيل دفعة التقسيط بنجاح");
      loadInstallments();
      setSelectedInvoice(null);
      setIsPaymentDialogOpen(false);
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("حدث خطأ أثناء تسجيل الدفعة");
    }
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const cashMethod = paymentMethods.find((m) => m.type === "cash");
    setSelectedPaymentMethodId(cashMethod?.id || paymentMethods[0]?.id || "");
    setIsPaymentDialogOpen(true);
  };

  const getTotalPending = () => {
    return invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);
  };

  const getTotalOverdue = () => {
    const today = new Date();
    return invoices.reduce((sum, inv) => {
      if (!inv.installmentPlan) return sum;
      const overduePayments = inv.installmentPlan.payments.filter(
        (p) => !p.paid && new Date(p.dueDate) < today
      );
      return sum + overduePayments.reduce((s, p) => s + p.amount, 0);
    }, 0);
  };

  const pagination = usePagination(invoices);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("installments", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">ليس لديك صلاحية عرض التقسيط</p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">إدارة التقسيط</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    إجمالي المتبقي
                  </p>
                  <p className="text-2xl font-bold">
                    {Number(getTotalPending() || 0).toFixed(2)} ر.س
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-primary" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">المتأخرات</p>
                  <p className="text-2xl font-bold text-destructive">
                    {Number(getTotalOverdue() || 0).toFixed(2)} ر.س
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
            </Card>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>المبلغ الإجمالي</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead>عدد الأقساط</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{invoice.customerName || "غير محدد"}</TableCell>
                    <TableCell>{Number(invoice.total || 0).toFixed(2)} ر.س</TableCell>
                    <TableCell>{Number(invoice.paidAmount || 0).toFixed(2)} ر.س</TableCell>
                    <TableCell className="text-destructive font-semibold">
                      {Number(invoice.remainingAmount || 0).toFixed(2)} ر.س
                    </TableCell>
                    <TableCell>
                      {
                        invoice.installmentPlan?.payments.filter((p) => p.paid)
                          .length
                      }{" "}
                      / {invoice.installmentPlan?.numberOfInstallments}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.paymentStatus === "paid"
                            ? "default"
                            : invoice.paymentStatus === "partial"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {invoice.paymentStatus === "paid"
                          ? "مكتمل"
                          : invoice.paymentStatus === "partial"
                            ? "جزئي"
                            : "غير مدفوع"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => openPaymentDialog(invoice)}
                        disabled={invoice.paymentStatus === "paid"}
                      >
                        عرض الأقساط
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      لا توجد فواتير تقسيط
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <DataPagination {...pagination} entityName="قسط" />

          <Dialog
            open={isPaymentDialogOpen}
            onOpenChange={setIsPaymentDialogOpen}
          >
            <DialogContent className="max-w-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle>تفاصيل أقساط الفاتورة</DialogTitle>
              </DialogHeader>
              {selectedInvoice && selectedInvoice.installmentPlan && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        رقم الفاتورة
                      </p>
                      <p className="font-semibold">
                        {selectedInvoice.id.slice(0, 8)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">العميل</p>
                      <p className="font-semibold">
                        {selectedInvoice.customerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        المبلغ الإجمالي
                      </p>
                      <p className="font-semibold">
                        {Number(selectedInvoice.total || 0).toFixed(2)} ر.س
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        نسبة الفائدة
                      </p>
                      <p className="font-semibold">
                        {selectedInvoice.installmentPlan.interestRate}%
                      </p>
                    </div>
                  </div>

                  {/* اختيار طريقة الدفع */}
                  <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <Label className="font-semibold">طريقة الدفع لتسديد القسط</Label>
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

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>القسط</TableHead>
                        <TableHead>تاريخ الاستحقاق</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.installmentPlan.payments.map(
                        (payment, index) => {
                          const isOverdue =
                            !payment.paid &&
                            new Date(payment.dueDate) < new Date();
                          return (
                            <TableRow key={payment.id}>
                              <TableCell>القسط {index + 1}</TableCell>
                              <TableCell>
                                {new Date(payment.dueDate).toLocaleDateString(
                                  "ar-SA"
                                )}
                              </TableCell>
                              <TableCell>
                                {Number(payment.amount || 0).toFixed(2)} ر.س
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    payment.paid
                                      ? "default"
                                      : isOverdue
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {payment.paid
                                    ? "مدفوع"
                                    : isOverdue
                                      ? "متأخر"
                                      : "معلق"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {!payment.paid ? (
                                  can("installments", "edit") && (
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handlePayInstallment(
                                          selectedInvoice,
                                          payment.id
                                        )
                                      }
                                    >
                                      تسديد
                                    </Button>
                                  )
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {payment.paidDate &&
                                      new Date(
                                        payment.paidDate
                                      ).toLocaleDateString("ar-SA")}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

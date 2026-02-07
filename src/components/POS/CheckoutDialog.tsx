import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  db,
  Customer,
  Invoice,
  InvoiceItem,
  Product,
  Shift,
  PaymentMethod,
} from "@/shared/lib/indexedDB";
import { InstallmentPlan, InstallmentPayment } from "@/domain/entities/Invoice";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Calendar, CreditCard, Wallet, Banknote } from "lucide-react";
import { useSettingsContext } from "@/contexts/SettingsContext";

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
  onCheckoutComplete: () => void;
}

export const CheckoutDialog = ({
  open,
  onOpenChange,
  items,
  onCheckoutComplete,
}: CheckoutDialogProps) => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<
    Array<{ id: string; amount: number }>
  >([]);
  const [paymentType, setPaymentType] = useState<
    "cash" | "credit" | "installment"
  >("cash");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "wallet"
  >("cash");
  const [creditDays, setCreditDays] = useState(30);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [interestRate, setInterestRate] = useState(0);

  const { getSetting } = useSettingsContext();

  // قراءة الإعدادات
  const taxRate = parseFloat(getSetting("taxRate") || "14") / 100;
  const currency = getSetting("currency") || "EGP";

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  useEffect(() => {
    loadCustomers();
    loadPaymentMethods();
  }, []);

  const loadCustomers = async () => {
    const data = await db.getAll<Customer>("customers");
    setCustomers(data);
  };

  const loadPaymentMethods = async () => {
    const data = await db.getAll<PaymentMethod>("paymentMethods");
    const active = data.filter((pm) => pm.isActive);
    setPaymentMethods(active);

    // Set default payment method (cash)
    const defaultMethod = active.find((pm) => pm.type === "cash");
    if (defaultMethod && paymentType === "cash") {
      setSelectedPaymentMethods([{ id: defaultMethod.id, amount: total }]);
    }
  };

  const calculateInstallments = (): InstallmentPayment[] => {
    const totalWithInterest = total * (1 + interestRate / 100);
    const installmentAmount = totalWithInterest / installmentCount;
    const payments: InstallmentPayment[] = [];

    for (let i = 0; i < installmentCount; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      payments.push({
        id: `${Date.now()}-${i}`,
        dueDate: dueDate.toISOString(),
        amount: installmentAmount,
        paid: false,
      });
    }
    return payments;
  };

  const handleCheckout = async () => {
    if (!user) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }

    if (paymentType !== "cash" && !selectedCustomerId) {
      toast.error("يرجى اختيار العميل");
      return;
    }

    try {
      const selectedCustomer = customers.find(
        (c) => c.id === selectedCustomerId
      );

      // التحقق من حد الائتمان
      if (paymentType !== "cash" && selectedCustomer) {
        if (
          selectedCustomer.currentBalance + total >
          selectedCustomer.creditLimit
        ) {
          toast.error("تجاوز حد الائتمان للعميل");
          return;
        }
      }

      const invoiceItems: InvoiceItem[] = items.map((item) => ({
        productId: item.id,
        productName: item.nameAr,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        unitId: item.unitId || "",
        unitName: item.unitName || "قطعة",
        conversionFactor: item.conversionFactor || 1,
        priceTypeId: item.priceTypeId || "",
        priceTypeName:
          paymentMethods.find((pm) => pm.id === item.priceTypeId)?.name ||
          "سعر البيع",
        returnedQuantity: 0, // تهيئة الكمية المرتجعة بصفر
        warehouseId: item.warehouseId,
        productUnitId: item.productUnitId,
        selectedUnitName: item.selectedUnitName,
      }));

      let installmentPlan: InstallmentPlan | undefined;
      if (paymentType === "installment") {
        installmentPlan = {
          numberOfInstallments: installmentCount,
          installmentAmount:
            (total * (1 + interestRate / 100)) / installmentCount,
          interestRate,
          startDate: new Date().toISOString(),
          payments: calculateInstallments(),
        };
      }

      const dueDate =
        paymentType === "credit"
          ? new Date(
            Date.now() + creditDays * 24 * 60 * 60 * 1000
          ).toISOString()
          : undefined;

      // التحقق من إجمالي المبالغ المدفوعة
      const totalPaid = selectedPaymentMethods.reduce(
        (sum, pm) => sum + pm.amount,
        0
      );

      if (paymentType === "cash" && Math.abs(totalPaid - total) > 0.01) {
        toast.error("مجموع المبالغ المدفوعة يجب أن يساوي الإجمالي");
        return;
      }

      // تحديث الوردية الحالية
      const allShifts = await db.getAll<Shift>("shifts");
      const currentShift = allShifts.find((s) => s.status === "active");

      // إنشاء paymentMethodIds و paymentMethodAmounts
      const paymentMethodIds = selectedPaymentMethods.map((pm) => pm.id);
      const paymentMethodAmounts: Record<string, number> = {};
      selectedPaymentMethods.forEach((pm) => {
        paymentMethodAmounts[pm.id] = pm.amount;
      });

      // الحصول على آخر رقم فاتورة (يبدأ من 113)
      const allInvoices = await db.getAll<Invoice>("invoices");
      const lastInvoiceNumber =
        allInvoices.length > 0
          ? Math.max(
            ...allInvoices.map((inv: any) => {
              const numStr = inv.invoiceNumber || inv.id;
              const num = parseInt(numStr);
              return isNaN(num) ? 112 : num;
            })
          )
          : 112;
      const newInvoiceNumber = (lastInvoiceNumber + 1).toString();

      const invoice: Invoice = {
        id: newInvoiceNumber,
        invoiceNumber: newInvoiceNumber, // رقم الفاتورة المتسلسل
        customerId: selectedCustomerId || undefined,
        customerName: selectedCustomer?.name,
        items: invoiceItems,
        subtotal,
        tax,
        total,
        paymentType,
        paymentStatus: paymentType === "cash" ? "paid" : "unpaid",
        paidAmount: paymentType === "cash" ? total : 0,
        remainingAmount: paymentType === "cash" ? 0 : total,
        userId: user.id,
        userName: user.username,
        createdAt: new Date().toISOString(),
        dueDate,
        installmentPlan,
        shiftId: currentShift?.id, // ربط الفاتورة بالوردية
        paymentMethodIds,
        paymentMethodAmounts,
      };

      await db.add("invoices", invoice);

      // تحديث رصيد العميل
      if (selectedCustomer && paymentType !== "cash") {
        const updatedCustomer: Customer = {
          ...selectedCustomer,
          currentBalance: selectedCustomer.currentBalance + total,
          loyaltyPoints:
            selectedCustomer.loyaltyPoints + Math.floor(total / 10),
        };
        await db.update("customers", updatedCustomer);
      }

      // تحديث المخزون
      for (const item of items) {
        const product = await db.get<Product>("products", item.id);
        if (product) {
          const updatedProduct: Product = {
            ...product,
            stock: product.stock - item.quantity,
          };
          await db.update("products", updatedProduct);
        }
      }

      // تحديث الوردية الحالية (استخدام نفس currentShift من الأعلى)
      if (currentShift) {
        // حساب المبالغ حسب طريقة الدفع
        let cashAmount = 0;
        let cardAmount = 0;
        let walletAmount = 0;

        for (const pm of selectedPaymentMethods) {
          const method = paymentMethods.find((m) => m.id === pm.id);
          if (method?.type === "cash") {
            cashAmount += pm.amount;
          } else if (
            method?.type === "visa" ||
            method?.type === "bank_transfer"
          ) {
            cardAmount += pm.amount;
          } else if (method?.type === "wallet") {
            walletAmount += pm.amount;
          }
        }

        const updatedShift: Shift = {
          ...currentShift,
          sales: {
            totalInvoices: currentShift.sales.totalInvoices + 1,
            totalAmount: currentShift.sales.totalAmount + total,
            cashSales: currentShift.sales.cashSales + cashAmount,
            cardSales: currentShift.sales.cardSales + cardAmount,
            walletSales: currentShift.sales.walletSales + walletAmount,
            returns: currentShift.sales.returns,
          },
        };
        await db.update("shifts", updatedShift);
      }

      toast.success("تم إتمام عملية البيع بنجاح!", {
        description: `رقم الفاتورة: ${invoice.id}`,
      });

      onCheckoutComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("حدث خطأ أثناء إتمام العملية");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">إتمام عملية البيع</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Summary */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>المجموع الفرعي:</span>
              <span className="font-bold">
                {subtotal.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span>الضريبة ({taxRate * 100}%):</span>
              <span className="font-bold">
                {tax.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex justify-between text-lg border-t pt-2">
              <span className="font-bold">الإجمالي:</span>
              <span className="font-bold text-primary">
                {total.toFixed(2)} {currency}
              </span>
            </div>
          </div>

          {/* Payment Type */}
          <div className="space-y-3">
            <Label>نوع الدفع</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(v: any) => setPaymentType(v)}
            >
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="cash" id="cash" />
                <Label
                  htmlFor="cash"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Banknote className="h-4 w-4" />
                  نقدي
                </Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="credit" id="credit" />
                <Label
                  htmlFor="credit"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Calendar className="h-4 w-4" />
                  آجل
                </Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="installment" id="installment" />
                <Label
                  htmlFor="installment"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" />
                  تقسيط
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Payment Methods - Multiple Selection for Cash */}
          {paymentType === "cash" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>طرق الدفع</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const remaining =
                      total -
                      selectedPaymentMethods.reduce(
                        (sum, pm) => sum + pm.amount,
                        0
                      );
                    if (remaining > 0 && paymentMethods.length > 0) {
                      setSelectedPaymentMethods([
                        ...selectedPaymentMethods,
                        { id: paymentMethods[0].id, amount: remaining },
                      ]);
                    }
                  }}
                >
                  + إضافة طريقة دفع
                </Button>
              </div>

              {selectedPaymentMethods.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  يرجى إضافة طريقة دفع واحدة على الأقل
                </p>
              )}

              {selectedPaymentMethods.map((selected, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <Select
                      value={selected.id}
                      onValueChange={(newId) => {
                        const updated = [...selectedPaymentMethods];
                        updated[index].id = newId;
                        setSelectedPaymentMethods(updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طريقة الدفع" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>
                            <div className="flex items-center gap-2">
                              {pm.type === "cash" && (
                                <Banknote className="h-4 w-4" />
                              )}
                              {pm.type === "wallet" && (
                                <Wallet className="h-4 w-4" />
                              )}
                              {pm.type === "visa" && (
                                <CreditCard className="h-4 w-4" />
                              )}
                              {pm.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      placeholder="المبلغ"
                      value={selected.amount}
                      onChange={(e) => {
                        const updated = [...selectedPaymentMethods];
                        updated[index].amount = parseFloat(e.target.value) || 0;
                        setSelectedPaymentMethods(updated);
                      }}
                      min={0}
                      step={0.01}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      setSelectedPaymentMethods(
                        selectedPaymentMethods.filter((_, i) => i !== index)
                      );
                    }}
                  >
                    <Banknote className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Display Total Paid vs Total Required */}
              {selectedPaymentMethods.length > 0 && (
                <div className="bg-primary/10 p-3 rounded-lg space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>المبلغ المدفوع:</span>
                    <span className="font-semibold">
                      {selectedPaymentMethods
                        .reduce((sum, pm) => sum + pm.amount, 0)
                        .toFixed(2)}{" "}
                      {currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>المطلوب:</span>
                    <span className="font-semibold">
                      {total.toFixed(2)} {currency}
                    </span>
                  </div>
                  {Math.abs(
                    selectedPaymentMethods.reduce(
                      (sum, pm) => sum + pm.amount,
                      0
                    ) - total
                  ) > 0.01 && (
                      <div className="flex justify-between text-sm text-destructive font-bold">
                        <span>الفرق:</span>
                        <span>
                          {(
                            selectedPaymentMethods.reduce(
                              (sum, pm) => sum + pm.amount,
                              0
                            ) - total
                          ).toFixed(2)}{" "}
                          {currency}
                        </span>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Customer Selection */}
          {paymentType !== "cash" && (
            <div className="space-y-2">
              <Label>اختر العميل *</Label>
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر عميل" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} - {customer.phone}
                      {customer.creditLimit > 0 && (
                        <span className="text-xs text-muted-foreground mr-2">
                          (حد الائتمان: {customer.creditLimit} {currency})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Credit Options */}
          {paymentType === "credit" && (
            <div className="space-y-2">
              <Label>مدة السداد (بالأيام)</Label>
              <Input
                type="number"
                value={creditDays}
                onChange={(e) => setCreditDays(parseInt(e.target.value))}
                min={1}
              />
            </div>
          )}

          {/* Installment Options */}
          {paymentType === "installment" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عدد الأقساط</Label>
                <Select
                  value={installmentCount.toString()}
                  onValueChange={(v) => setInstallmentCount(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 6, 9, 12, 18, 24].map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} قسط
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نسبة الفائدة (%)</Label>
                <Input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(parseFloat(e.target.value))}
                  min={0}
                  step={0.1}
                />
              </div>
            </div>
          )}

          {paymentType === "installment" && (
            <div className="bg-primary/10 p-4 rounded-lg">
              <p className="text-sm">
                قيمة القسط الشهري:{" "}
                <span className="font-bold text-primary">
                  {(
                    (total * (1 + interestRate / 100)) /
                    installmentCount
                  ).toFixed(2)}{" "}
                  {currency}
                </span>
              </p>
              <p className="text-sm mt-1">
                الإجمالي مع الفائدة:{" "}
                <span className="font-bold">
                  {(total * (1 + interestRate / 100)).toFixed(2)} {currency}
                </span>
              </p>
            </div>
          )}

          {/* Payment Method (for cash only) */}
          {paymentType === "cash" && (
            <div className="space-y-3">
              <Label>طريقة الدفع</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v: any) => setPaymentMethod(v)}
              >
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="cash" id="method-cash" />
                  <Label htmlFor="method-cash" className="cursor-pointer">
                    نقدي
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="card" id="method-card" />
                  <Label htmlFor="method-card" className="cursor-pointer">
                    بطاقة ائتمانية
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="wallet" id="method-wallet" />
                  <Label htmlFor="method-wallet" className="cursor-pointer">
                    محفظة إلكترونية
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleCheckout} className="flex-1" size="lg">
              إتمام البيع
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              size="lg"
            >
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

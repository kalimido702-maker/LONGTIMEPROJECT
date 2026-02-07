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
import { Search, RotateCcw, FileText, Calendar, Printer } from "lucide-react";
import {
  db,
  Invoice,
  SalesReturn,
  SalesReturnItem,
  Product,
  Shift,
  Customer,
} from "@/shared/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { pdfService } from "@/lib/printing/pdfService";

const SalesReturns = () => {
  const { user, can } = useAuth();
  const { getSetting } = useSettingsContext();
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<SalesReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "credit" | "balance"
  >("cash");
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  // Search filters for returns list
  const [returnsSearchQuery, setReturnsSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await db.init();
    const allReturns = await db.getAll<SalesReturn>("salesReturns");
    const sortedReturns = allReturns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setSalesReturns(sortedReturns);

    const allInvoices = await db.getAll<Invoice>("invoices");
    // ترتيب الفواتير من الأحدث إلى الأقدم
    const sortedInvoices = allInvoices.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setInvoices(sortedInvoices);
  };

  const handleSelectInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);

    // الحصول على جميع الفواتير للعميل للبحث عن آخر سعر شراء
    let customerInvoices: Invoice[] = [];
    if (invoice.customerId) {
      const allInvoices = await db.getAll<Invoice>("invoices");
      customerInvoices = allInvoices
        .filter(inv => inv.customerId === invoice.customerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // دالة للحصول على آخر سعر شراء للمنتج من فواتير العميل
    const getLastPurchasePrice = (productId: string): number | null => {
      for (const inv of customerInvoices) {
        const item = inv.items.find(i => i.productId === productId);
        if (item) {
          return item.price;
        }
      }
      return null;
    };

    // تحويل عناصر الفاتورة لعناصر مرتجع مع استخدام آخر سعر شراء
    const items: SalesReturnItem[] = invoice.items.map((item) => {
      // استخدام آخر سعر شراء للعميل إذا وجد، وإلا السعر الأصلي
      const lastPrice = invoice.customerId ? getLastPurchasePrice(item.productId) : null;
      const needsPriceReview = invoice.customerId && lastPrice === null;
      const priceToUse = lastPrice ?? item.price;

      return {
        productId: item.productId,
        productName: item.productName,
        quantity: 0, // سيحدد المستخدم الكمية
        price: priceToUse,
        total: 0,
        reason: "",
        needsPriceReview, // Flag for products not in customer history
      } as SalesReturnItem & { needsPriceReview?: boolean };
    });
    setReturnItems(items);

    // تحميل رصيد العميل إذا كان موجوداً
    if (invoice.customerId) {
      const customer = await db.get<Customer>("customers", invoice.customerId);
      if (customer) {
        setCustomerBalance(customer.currentBalance);
      }
    } else {
      setCustomerBalance(null);
    }

    setIsCreateDialogOpen(true);
  };

  const updateReturnQuantity = (index: number, quantity: number) => {
    const updatedItems = [...returnItems];
    const invoiceItem = selectedInvoice?.items[index];
    if (!invoiceItem) return;

    const maxQuantity = invoiceItem.quantity;
    const alreadyReturned = invoiceItem.returnedQuantity || 0;
    const availableToReturn = maxQuantity - alreadyReturned;

    if (quantity > availableToReturn) {
      toast.error(`الحد الأقصى للكمية المتاحة للإرجاع: ${availableToReturn}`);
      return;
    }

    updatedItems[index].quantity = quantity;
    updatedItems[index].total = quantity * updatedItems[index].price;
    setReturnItems(updatedItems);
  };

  const handleCreateReturn = async () => {
    if (!selectedInvoice || !reason) {
      toast.error("يرجى إدخال سبب الإرجاع");
      return;
    }

    // التحقق من أن طريقة الاسترجاع مناسبة للعميل
    if (
      !selectedInvoice.customerId &&
      (refundMethod === "credit" || refundMethod === "balance")
    ) {
      toast.error(
        "لا يمكن استخدام طرق الرصيد مع فاتورة نقدية. يرجى اختيار 'نقداً'"
      );
      return;
    }

    // تصفية العناصر التي تم إرجاعها فقط
    const itemsToReturn = returnItems.filter((item) => item.quantity > 0);

    if (itemsToReturn.length === 0) {
      toast.error("يرجى اختيار المنتجات المراد إرجاعها");
      return;
    }

    const subtotal = itemsToReturn.reduce((sum, item) => sum + item.total, 0);
    // أخذ معدل الضريبة من الإعدادات
    const taxRate = parseFloat(getSetting("taxRate") || "0") / 100;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // التحقق من رصيد العميل إذا كانت الطريقة "خصم من رصيد العميل"
    if (refundMethod === "balance" && selectedInvoice.customerId) {
      const customer = await db.get<Customer>(
        "customers",
        selectedInvoice.customerId
      );
      if (customer && customer.currentBalance < total) {
        toast.error(
          `رصيد العميل (${formatCurrency(
            customer.currentBalance
          )}) غير كافٍ. المبلغ المطلوب: ${formatCurrency(total)}`
        );
        return;
      }
    }

    // الحصول على الوردية الحالية - CRITICAL: must exist!
    const allShifts = await db.getAll<Shift>("shifts");
    const currentShift = allShifts.find((s) => s.status === "active");

    if (!currentShift) {
      toast.error("يجب فتح وردية أولاً لعمل مرتجع مبيعات");
      return;
    }

    const newReturn: SalesReturn = {
      id: `return_${Date.now()}`,
      originalInvoiceId: selectedInvoice.id,
      customerId: selectedInvoice.customerId,
      customerName: selectedInvoice.customerName,
      items: itemsToReturn,
      subtotal,
      tax,
      total,
      reason,
      userId: user?.id || "",
      userName: user?.username || "",
      createdAt: new Date().toISOString(),
      refundMethod,
      refundStatus: "pending",
      deliveryStatus: "delivered", // Default to delivered
      shiftId: currentShift.id,
    };

    try {
      await db.add("salesReturns", newReturn);

      // تحديث الفاتورة الأصلية - إضافة الكمية المرتجعة
      const updatedInvoice = { ...selectedInvoice };
      updatedInvoice.items = updatedInvoice.items.map((item, index) => {
        const returnedItem = itemsToReturn.find(
          (r) => r.productId === item.productId
        );
        if (returnedItem) {
          return {
            ...item,
            returnedQuantity:
              (item.returnedQuantity || 0) + returnedItem.quantity,
          };
        }
        return item;
      });
      await db.update("invoices", updatedInvoice);

      // إرجاع المنتجات للمخزون
      for (const item of itemsToReturn) {
        const product = await db.get<Product>("products", item.productId);
        if (product) {
          product.stock += item.quantity;
          await db.update("products", product);
        }
      }

      // تحديث الوردية - خصم قيمة المرتجع
      if (currentShift) {
        const updatedShift: Shift = {
          ...currentShift,
          sales: {
            ...currentShift.sales,
            returns: currentShift.sales.returns + total,
            totalAmount: currentShift.sales.totalAmount - total,
          },
        };
        await db.update("shifts", updatedShift);
      }

      // معالجة طريقة الاسترجاع
      if (selectedInvoice.customerId) {
        const customer = await db.get<Customer>(
          "customers",
          selectedInvoice.customerId
        );

        if (customer) {
          if (refundMethod === "credit") {
            // إضافة المبلغ إلى رصيد العميل
            customer.currentBalance += total;
            await db.update("customers", customer);
            toast.success(
              `تم إضافة ${formatCurrency(
                total
              )} إلى رصيد العميل (الرصيد الجديد: ${formatCurrency(
                customer.currentBalance
              )})`
            );
          } else if (refundMethod === "balance") {
            // خصم المبلغ من رصيد العميل
            customer.currentBalance -= total;
            await db.update("customers", customer);
            toast.success(
              `تم خصم ${formatCurrency(
                total
              )} من رصيد العميل (الرصيد المتبقي: ${formatCurrency(
                customer.currentBalance
              )})`
            );
          }
        }
      }

      // تحديث حالة المرجع إلى مكتمل
      newReturn.refundStatus = "completed";
      await db.update("salesReturns", newReturn);

      toast.success("تم إنشاء فاتورة المرتجع بنجاح");
      setIsCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error("حدث خطأ أثناء إنشاء المرتجع");
      console.error(error);
    }
  };

  const resetForm = () => {
    setSelectedInvoice(null);
    setReturnItems([]);
    setReason("");
    setRefundMethod("cash");
    setCustomerBalance(null);
  };

  const filteredInvoices = invoices.filter(
    (invoice) =>
      invoice.id.includes(searchQuery) ||
      invoice.customerName?.includes(searchQuery) ||
      invoice.customerId?.includes(searchQuery)
  );

  const formatCurrency = (amount: number) => {
    const currency = getSetting("currency") || "EGP";
    return Math.round(amount) + " " + currency;
  };

  // طباعة فاتورة المرتجع
  const handlePrintReturn = async (returnDoc: SalesReturn) => {
    const storeName = getSetting("storeName") || "المتجر";
    const storeAddress = getSetting("storeAddress");
    const storePhone = getSetting("storePhone");
    const storeLogo = getSetting("storeLogo");
    const currency = getSetting("currency") || "EGP";

    await pdfService.downloadInvoicePDF(
      {
        invoiceNumber: returnDoc.id,
        date: new Date(returnDoc.createdAt).toLocaleDateString("ar-EG"),
        customerName: returnDoc.customerName || "عميل",
        items: returnDoc.items.map((item, index) => ({
          name: item.productName,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          productCode: item.productId.substring(0, 8),
        })),
        subtotal: returnDoc.subtotal,
        tax: returnDoc.tax,
        total: returnDoc.total,
        isReturn: true,
        salesRepName: returnDoc.userName,
      },
      {
        storeName,
        storeAddress,
        storePhone,
        currency,
        storeLogo,
        showQRCode: true,
      }
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("ar-EG");
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("returns", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض مرتجع المبيعات
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <RotateCcw className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">سجل المرتجعات</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              لإنشاء مرتجع جديد، انتقل إلى سجل الفواتير واضغط على زر "مرتجع"
            </p>
          </div>

          {/* قائمة المرتجعات */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">سجل المرتجعات</h2>

            {/* فلاتر البحث */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالمنتج أو رقم المرتجع أو العميل..."
                    value={returnsSearchQuery}
                    onChange={(e) => setReturnsSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">من:</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">إلى:</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              {(returnsSearchQuery || dateFrom || dateTo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReturnsSearchQuery("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  مسح الفلاتر
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {(() => {
                // Filter returns based on search and date
                const filteredReturns = salesReturns.filter((returnDoc) => {
                  // Text search: search in products, return ID, customer name
                  const searchLower = returnsSearchQuery.toLowerCase();
                  const matchesSearch = !returnsSearchQuery ||
                    returnDoc.id.toLowerCase().includes(searchLower) ||
                    returnDoc.customerName?.toLowerCase().includes(searchLower) ||
                    returnDoc.items.some((item) =>
                      item.productName.toLowerCase().includes(searchLower)
                    );

                  // Date filter
                  const returnDate = new Date(returnDoc.createdAt);
                  const fromDate = dateFrom ? new Date(dateFrom) : null;
                  const toDate = dateTo ? new Date(dateTo + "T23:59:59") : null;

                  const matchesDate =
                    (!fromDate || returnDate >= fromDate) &&
                    (!toDate || returnDate <= toDate);

                  return matchesSearch && matchesDate;
                });

                if (filteredReturns.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      {salesReturns.length === 0
                        ? "لا توجد مرتجعات حتى الآن"
                        : "لا توجد نتائج مطابقة للبحث"
                      }
                    </div>
                  );
                }

                return filteredReturns.map((returnDoc) => (
                  <Card key={returnDoc.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4" />
                          <span className="font-bold">{returnDoc.id}</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${returnDoc.refundStatus === "completed"
                              ? "bg-green-100 text-green-800"
                              : returnDoc.refundStatus === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                              }`}
                          >
                            {returnDoc.refundStatus === "completed"
                              ? "مكتمل"
                              : returnDoc.refundStatus === "pending"
                                ? "قيد الانتظار"
                                : "مرفوض"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          الفاتورة الأصلية: {returnDoc.originalInvoiceId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          العميل: {returnDoc.customerName || "غير محدد"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          السبب: {returnDoc.reason}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          التاريخ: {formatDate(returnDoc.createdAt)}
                        </p>
                      </div>
                      <div className="text-left space-y-2">
                        <p className="text-2xl font-bold text-red-600">
                          {formatCurrency(returnDoc.total)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          عدد المنتجات: {returnDoc.items.length}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintReturn(returnDoc);
                          }}
                          className="gap-2"
                        >
                          <Printer className="h-4 w-4" />
                          طباعة
                        </Button>
                      </div>
                    </div>
                  </Card>
                ));
              })()}
            </div>
          </Card>

          {/* Dialog إنشاء مرتجع */}
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogContent
              className="max-w-4xl max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              <DialogHeader>
                <DialogTitle>إنشاء فاتورة مرتجع</DialogTitle>
              </DialogHeader>

              {!selectedInvoice ? (
                <div className="space-y-4 py-4">
                  <div className="relative">
                    <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ابحث عن فاتورة..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredInvoices.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        لا توجد فواتير مطابقة للبحث
                      </div>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const hasReturns = (invoice.items || []).some(
                          (item) => (item.returnedQuantity || 0) > 0
                        );
                        const fullyReturned = (invoice.items || [])?.length > 0 && (invoice.items || []).every(
                          (item) =>
                            (item.returnedQuantity || 0) >= item.quantity
                        );

                        return (
                          <Card
                            key={invoice.id}
                            className={`p-3 cursor-pointer hover:bg-muted transition-colors ${fullyReturned
                              ? "bg-red-50 dark:bg-red-950/20 border-red-200"
                              : hasReturns
                                ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200"
                                : ""
                              }`}
                            onClick={() => handleSelectInvoice(invoice)}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold">{invoice.id}</p>
                                  {fullyReturned && (
                                    <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded">
                                      مرتجعة بالكامل
                                    </span>
                                  )}
                                  {hasReturns && !fullyReturned && (
                                    <span className="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded">
                                      مرتجعة جزئياً
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {invoice.customerName || "عميل نقدي"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(invoice.createdAt)} -{" "}
                                  {invoice.userName}
                                </p>
                              </div>
                              <div className="text-left">
                                <p className="font-bold">
                                  {formatCurrency(invoice.total)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {(invoice.items || []).length} منتج
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {invoice.paymentStatus === "paid"
                                    ? "مدفوعة"
                                    : invoice.paymentStatus === "partial"
                                      ? "مدفوعة جزئياً"
                                      : "غير مدفوعة"}
                                </p>
                              </div>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="p-3 bg-muted rounded-md">
                    <p className="font-bold">الفاتورة: {selectedInvoice.id}</p>
                    <p className="text-sm text-muted-foreground">
                      العميل: {selectedInvoice.customerName || "عميل نقدي"}
                    </p>
                  </div>

                  <div>
                    <Label>المنتجات</Label>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المنتج</TableHead>
                          <TableHead>الكمية الأصلية</TableHead>
                          <TableHead>المرتجع سابقاً</TableHead>
                          <TableHead>المتاح للإرجاع</TableHead>
                          <TableHead>الكمية المرتجعة</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returnItems.map((item, index) => {
                          const invoiceItem = selectedInvoice.items[index];
                          const originalQty = invoiceItem?.quantity || 0;
                          const returnedQty =
                            invoiceItem?.returnedQuantity || 0;
                          const availableQty = originalQty - returnedQty;
                          const isFullyReturned = availableQty === 0;

                          return (
                            <TableRow
                              key={index}
                              className={
                                isFullyReturned
                                  ? "bg-red-50 dark:bg-red-950/20"
                                  : ""
                              }
                            >
                              <TableCell className="font-medium">
                                {item.productName}
                                {isFullyReturned && (
                                  <span className="mr-2 text-xs bg-red-500 text-white px-2 py-1 rounded">
                                    مرتجع بالكامل
                                  </span>
                                )}
                                {(item as any).needsPriceReview && (
                                  <span className="mr-2 text-xs bg-orange-500 text-white px-2 py-1 rounded">
                                    ⚠️ السعر يحتاج مراجعة
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{originalQty}</TableCell>
                              <TableCell>
                                {returnedQty > 0 ? (
                                  <span className="text-red-600 font-semibold">
                                    {returnedQty}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={
                                    availableQty > 0
                                      ? "text-green-600 font-semibold"
                                      : "text-red-600"
                                  }
                                >
                                  {availableQty}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max={availableQty}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateReturnQuantity(
                                      index,
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-20"
                                  disabled={isFullyReturned}
                                />
                              </TableCell>
                              <TableCell>
                                {formatCurrency(item.price)}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(item.total)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <Label>سبب الإرجاع</Label>
                    <Textarea
                      placeholder="اكتب سبب الإرجاع..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label>طريقة الاسترجاع</Label>
                    <select
                      className="w-full mt-2 p-2 border rounded-md"
                      value={refundMethod}
                      onChange={(e) =>
                        setRefundMethod(
                          e.target.value as "cash" | "credit" | "balance"
                        )
                      }
                    >
                      <option value="cash">
                        نقداً - استرجاع المبلغ للعميل
                      </option>
                      <option value="credit">
                        رصيد للعميل - إضافة المبلغ إلى رصيد العميل
                      </option>
                      <option value="balance">
                        خصم من رصيد العميل - خصم المبلغ من رصيد العميل الحالي
                      </option>
                    </select>
                    {refundMethod === "credit" && (
                      <p className="text-xs text-blue-600 mt-1">
                        💡 سيتم إضافة المبلغ إلى رصيد العميل ليستخدمه في مشتريات
                        قادمة
                      </p>
                    )}
                    {refundMethod === "balance" && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⚠️ سيتم خصم المبلغ من رصيد العميل الحالي (يجب أن يكون
                        الرصيد كافياً)
                      </p>
                    )}
                    {refundMethod === "cash" && (
                      <p className="text-xs text-green-600 mt-1">
                        💵 سيتم إرجاع المبلغ نقداً للعميل
                      </p>
                    )}
                    {selectedInvoice.customerId && (
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
                        <p className="text-sm font-medium">
                          العميل: {selectedInvoice.customerName}
                        </p>
                        {customerBalance !== null && (
                          <p className="text-sm">
                            الرصيد الحالي:{" "}
                            <span
                              className={
                                customerBalance >= 0
                                  ? "text-green-600 font-bold"
                                  : "text-red-600 font-bold"
                              }
                            >
                              {formatCurrency(customerBalance)}
                            </span>
                          </p>
                        )}
                        {refundMethod === "balance" &&
                          customerBalance !== null && (
                            <p className="text-xs text-muted-foreground mt-1">
                              الرصيد بعد الخصم:{" "}
                              <span
                                className={
                                  customerBalance -
                                    returnItems.reduce(
                                      (sum, item) => sum + item.total,
                                      0
                                    ) >=
                                    0
                                    ? "text-green-600"
                                    : "text-red-600 font-bold"
                                }
                              >
                                {formatCurrency(
                                  customerBalance -
                                  returnItems.reduce(
                                    (sum, item) => sum + item.total,
                                    0
                                  )
                                )}
                              </span>
                            </p>
                          )}
                        {refundMethod === "credit" &&
                          customerBalance !== null && (
                            <p className="text-xs text-muted-foreground mt-1">
                              الرصيد بعد الإضافة:{" "}
                              <span className="text-green-600 font-bold">
                                {formatCurrency(
                                  customerBalance +
                                  returnItems.reduce(
                                    (sum, item) => sum + item.total,
                                    0
                                  )
                                )}
                              </span>
                            </p>
                          )}
                      </div>
                    )}
                    {!selectedInvoice.customerId && refundMethod !== "cash" && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ هذه الفاتورة لعميل نقدي. يجب اختيار "نقداً" كطريقة
                        استرجاع
                      </p>
                    )}
                  </div>

                  <div className="p-4 bg-muted rounded-md space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        المجموع الفرعي:
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(
                          returnItems.reduce((sum, item) => sum + item.total, 0)
                        )}
                      </span>
                    </div>
                    {(() => {
                      const subtotal = returnItems.reduce(
                        (sum, item) => sum + item.total,
                        0
                      );
                      const taxRate =
                        parseFloat(getSetting("taxRate") || "0") / 100;
                      const tax = subtotal * taxRate;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              الضريبة ({(taxRate * 100).toFixed(0)}%):
                            </span>
                            <span className="font-semibold">
                              {formatCurrency(tax)}
                            </span>
                          </div>
                          <div className="pt-2 border-t">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">
                                الإجمالي النهائي:
                              </span>
                              <span className="text-2xl font-bold text-red-600">
                                {formatCurrency(subtotal + tax)}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    resetForm();
                  }}
                >
                  إلغاء
                </Button>
                {selectedInvoice && (
                  <Button onClick={handleCreateReturn}>تأكيد المرتجع</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
};

export default SalesReturns;

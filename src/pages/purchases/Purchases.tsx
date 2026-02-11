import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  FileText,
  DollarSign,
} from "lucide-react";
import {
  db,
  Purchase,
  PurchaseItem,
  Supplier,
  Product,
  Unit,
  Shift,
} from "@/shared/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ExcelExportButton } from "@/components/common/ExcelExportButton";

const Purchases = () => {
  const { user, can } = useAuth();
  const { getSetting } = useSettingsContext();
  const currency = getSetting("currency") || "EGP";

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    paymentType: "cash" as "cash" | "credit" | "installment",
    paidAmount: 0,
    discount: 0,
    tax: 0,
    notes: "",
    dueDate: "",
    numberOfInstallments: 1,
    installmentAmount: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await db.init();
    const [purchasesData, suppliersData, productsData, unitsData, shiftsData] =
      await Promise.all([
        db.getAll<Purchase>("purchases"),
        db.getAll<Supplier>("suppliers"),
        db.getAll<Product>("products"),
        db.getAll<Unit>("units"),
        db.getAll<Shift>("shifts"),
      ]);

    const sortedPurchases = purchasesData.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setPurchases(sortedPurchases);
    setSuppliers(suppliersData);
    setProducts(productsData);
    setUnits(unitsData);

    const activeShift = shiftsData.find((s) => s.status === "active");
    setCurrentShift(activeShift || null);
  };

  const handleAddProduct = (product: Product) => {
    const existingItem = purchaseItems.find(
      (item) => item.productId === product.id
    );

    if (existingItem) {
      toast.error("المنتج موجود بالفعل في القائمة");
      return;
    }

    const defaultUnit = units.find((u) => u.id === product.unitId);

    const newItem: PurchaseItem = {
      productId: product.id,
      productName: product.nameAr,
      quantity: 1,
      costPrice: product.costPrice || 0,
      total: product.costPrice || 0,
      unitId: product.unitId,
      unitName: defaultUnit?.name || "",
    };

    setPurchaseItems([...purchaseItems, newItem]);
    setProductSearchQuery("");
  };

  const handleUpdateQuantity = (index: number, quantity: number) => {
    const updated = [...purchaseItems];
    updated[index].quantity = quantity;
    updated[index].total = quantity * updated[index].costPrice;
    setPurchaseItems(updated);
  };

  const handleUpdateCostPrice = (index: number, costPrice: number) => {
    const updated = [...purchaseItems];
    updated[index].costPrice = costPrice;
    updated[index].total = costPrice * updated[index].quantity;
    setPurchaseItems(updated);
  };

  const handleRemoveProduct = (index: number) => {
    const updated = purchaseItems.filter((_, i) => i !== index);
    setPurchaseItems(updated);
  };

  const calculateTotals = () => {
    const subtotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);
    const tax = (subtotal * formData.tax) / 100;
    const total = subtotal + tax - formData.discount;
    const remaining = total - formData.paidAmount;

    return { subtotal, tax, total, remaining };
  };

  const handleCreatePurchase = async () => {
    if (!selectedSupplier) {
      toast.error("يرجى اختيار مورد");
      return;
    }

    if (purchaseItems.length === 0) {
      toast.error("يرجى إضافة منتجات");
      return;
    }

    if (!user) {
      toast.error("يجب تسجيل الدخول");
      return;
    }

    const { subtotal, tax, total, remaining } = calculateTotals();

    // التحقق من حد الائتمان
    if (formData.paymentType !== "cash") {
      const newBalance = selectedSupplier.balance + remaining;
      if (newBalance > selectedSupplier.creditLimit) {
        toast.error(
          `تجاوز حد الائتمان! الحد المسموح: ${Number(selectedSupplier.creditLimit || 0).toFixed(
            2
          )} ${currency}`
        );
        return;
      }
    }

    // التحقق من وجود وردية مفتوحة - CRITICAL!
    if (!currentShift) {
      toast.error("يجب فتح وردية أولاً لعمل فاتورة شراء");
      return;
    }

    try {
      const purchase: Purchase = {
        id: `purchase_${Date.now()}`,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        items: purchaseItems,
        subtotal,
        tax,
        discount: formData.discount,
        total,
        paymentType: formData.paymentType,
        paymentStatus:
          formData.paidAmount >= total
            ? "paid"
            : formData.paidAmount > 0
              ? "partial"
              : "unpaid",
        paidAmount: formData.paidAmount,
        remainingAmount: remaining,
        userId: user.id,
        userName: user.username,
        createdAt: new Date().toISOString(),
        dueDate: formData.dueDate || undefined,
        shiftId: currentShift.id,
        notes: formData.notes,
        installmentPlan:
          formData.paymentType === "installment"
            ? {
              numberOfInstallments: formData.numberOfInstallments,
              installmentAmount: formData.installmentAmount,
              interestRate: 0,
              startDate: new Date().toISOString(),
              payments: [],
            }
            : undefined,
      };

      await db.add("purchases", purchase);

      // تحديث المخزون وأسعار التكلفة
      for (const item of purchaseItems) {
        const product = await db.get<Product>("products", item.productId);
        if (product) {
          product.stock += item.quantity;
          product.costPrice = item.costPrice; // تحديث سعر التكلفة
          await db.update("products", product);
        }
      }

      // تحديث رصيد المورد
      if (remaining > 0) {
        selectedSupplier.balance += remaining;
        await db.update("suppliers", selectedSupplier);
      }

      toast.success("تم إنشاء فاتورة الشراء بنجاح");
      setIsCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء إنشاء الفاتورة");
    }
  };

  const resetForm = () => {
    setSelectedSupplier(null);
    setPurchaseItems([]);
    setFormData({
      paymentType: "cash",
      paidAmount: 0,
      discount: 0,
      tax: 0,
      notes: "",
      dueDate: "",
      numberOfInstallments: 1,
      installmentAmount: 0,
    });
    setProductSearchQuery("");
  };

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProducts = products.filter((p) =>
    p.nameAr.toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} ${currency}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const { subtotal, tax, total, remaining } = calculateTotals();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("purchases", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض المشتريات
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">إدارة المشتريات</h1>
            </div>
            {can("purchases", "create") && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                size="lg"
                className="gap-2"
              >
                <Plus className="h-5 w-5" />
                فاتورة شراء جديدة
              </Button>
            )}
            <ExcelExportButton
              data={purchases}
              columns={[
                { header: "رقم الفاتورة", key: "id", width: 18 },
                { header: "المورد", key: "supplierName", width: 20 },
                { header: "التاريخ", key: "createdAt", width: 15, formatter: (val) => formatDate(val) },
                { header: "الإجمالي", key: "total", width: 12 },
                { header: "المدفوع", key: "paidAmount", width: 12 },
                { header: "المتبقي", key: "remainingAmount", width: 12 },
                { header: "نوع الدفع", key: "paymentType", width: 10, formatter: (val) => val === "cash" ? "نقدي" : val === "credit" ? "آجل" : "تقسيط" },
                { header: "الحالة", key: "paymentStatus", width: 12, formatter: (val) => val === "paid" ? "مدفوعة" : val === "partial" ? "جزئي" : "غير مدفوعة" },
              ]}
              filename={`المشتريات_${new Date().toLocaleDateString("ar-EG")}`}
              sheetName="المشتريات"
            />
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">
                إجمالي المشتريات
              </div>
              <div className="text-2xl font-bold">{purchases.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">
                قيمة المشتريات
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(purchases.reduce((sum, p) => sum + p.total, 0))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">مدفوع</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  purchases.reduce((sum, p) => sum + p.paidAmount, 0)
                )}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">
                مستحقات الموردين
              </div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(
                  purchases.reduce((sum, p) => sum + p.remainingAmount, 0)
                )}
              </div>
            </Card>
          </div>

          {/* Purchases List */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">سجل المشتريات</h2>
            <div className="space-y-4">
              {purchases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد فواتير شراء
                </div>
              ) : (
                purchases.map((purchase) => (
                  <Card key={purchase.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4" />
                          <span className="font-bold">{purchase.id}</span>
                          <Badge
                            variant={
                              purchase.paymentStatus === "paid"
                                ? "default"
                                : purchase.paymentStatus === "partial"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {purchase.paymentStatus === "paid"
                              ? "مدفوعة"
                              : purchase.paymentStatus === "partial"
                                ? "مدفوعة جزئياً"
                                : "غير مدفوعة"}
                          </Badge>
                          <Badge variant="outline">
                            {purchase.paymentType === "cash"
                              ? "نقدي"
                              : purchase.paymentType === "credit"
                                ? "آجل"
                                : "تقسيط"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          المورد: {purchase.supplierName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          التاريخ: {formatDate(purchase.createdAt)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          المستخدم: {purchase.userName}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-2xl font-bold text-blue-600">
                          {formatCurrency(purchase.total)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {purchase.items.length} منتج
                        </p>
                        {purchase.remainingAmount > 0 && (
                          <p className="text-sm text-red-600 font-semibold">
                            المتبقي: {formatCurrency(purchase.remainingAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </Card>

          {/* Create Purchase Dialog */}
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogContent
              className="max-w-6xl max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  إنشاء فاتورة شراء جديدة
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Supplier Selection */}
                {!selectedSupplier ? (
                  <div>
                    <Label className="text-lg font-semibold">اختر المورد</Label>
                    <div className="relative mt-2">
                      <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="ابحث عن مورد..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-10"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 max-h-96 overflow-y-auto">
                      {filteredSuppliers.map((supplier) => (
                        <Card
                          key={supplier.id}
                          className="p-3 cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => setSelectedSupplier(supplier)}
                        >
                          <div className="font-bold">{supplier.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {supplier.phone}
                          </div>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-muted-foreground">
                              الرصيد: {formatCurrency(supplier.balance)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              الحد: {formatCurrency(supplier.creditLimit)}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <Card className="p-4 bg-blue-50 dark:bg-blue-950">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold text-lg">
                            {selectedSupplier.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {selectedSupplier.phone}
                          </div>
                          <div className="text-sm mt-1">
                            الرصيد الحالي:{" "}
                            <span className="font-bold text-red-600">
                              {formatCurrency(selectedSupplier.balance)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSupplier(null);
                            setPurchaseItems([]);
                          }}
                        >
                          تغيير المورد
                        </Button>
                      </div>
                    </Card>

                    {/* Products Selection */}
                    <div className="mt-4">
                      <Label className="text-lg font-semibold">المنتجات</Label>
                      <div className="relative mt-2">
                        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="ابحث عن منتج..."
                          value={productSearchQuery}
                          onChange={(e) =>
                            setProductSearchQuery(e.target.value)
                          }
                          className="pr-10"
                        />
                      </div>

                      {productSearchQuery && (
                        <div className="mt-2 max-h-48 overflow-y-auto border rounded-md">
                          {filteredProducts.map((product) => (
                            <div
                              key={product.id}
                              className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                              onClick={() => handleAddProduct(product)}
                            >
                              <div className="font-medium">
                                {product.nameAr}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                المخزون: {product.stock} | التكلفة:{" "}
                                {formatCurrency(product.costPrice || 0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Purchase Items Table */}
                      {purchaseItems.length > 0 && (
                        <Table className="mt-4">
                          <TableHeader>
                            <TableRow>
                              <TableHead>المنتج</TableHead>
                              <TableHead>الكمية</TableHead>
                              <TableHead>سعر التكلفة</TableHead>
                              <TableHead>الإجمالي</TableHead>
                              <TableHead>إجراء</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {purchaseItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {item.productName}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleUpdateQuantity(
                                        index,
                                        parseInt(e.target.value) || 1
                                      )
                                    }
                                    className="w-24"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.costPrice}
                                    onChange={(e) =>
                                      handleUpdateCostPrice(
                                        index,
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="w-32"
                                  />
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(item.total)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleRemoveProduct(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    {/* Payment Details */}
                    {purchaseItems.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="space-y-3">
                          <div>
                            <Label>طريقة الدفع</Label>
                            <Select
                              value={formData.paymentType}
                              onValueChange={(
                                value: "cash" | "credit" | "installment"
                              ) =>
                                setFormData({ ...formData, paymentType: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash">نقدي</SelectItem>
                                <SelectItem value="credit">آجل</SelectItem>
                                <SelectItem value="installment">
                                  تقسيط
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>الخصم</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.discount}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  discount: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>

                          <div>
                            <Label>الضريبة (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.tax}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  tax: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>

                          <div>
                            <Label>المبلغ المدفوع</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.paidAmount}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  paidAmount: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>

                          {formData.paymentType === "credit" && (
                            <div>
                              <Label>تاريخ الاستحقاق</Label>
                              <Input
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    dueDate: e.target.value,
                                  })
                                }
                              />
                            </div>
                          )}

                          <div>
                            <Label>ملاحظات</Label>
                            <Textarea
                              value={formData.notes}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  notes: e.target.value,
                                })
                              }
                              placeholder="أي ملاحظات إضافية..."
                            />
                          </div>
                        </div>

                        <div>
                          <Card className="p-4 bg-muted">
                            <h3 className="font-bold text-lg mb-4">
                              ملخص الفاتورة
                            </h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>المجموع الفرعي:</span>
                                <span className="font-bold">
                                  {formatCurrency(subtotal)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>الضريبة:</span>
                                <span className="font-bold">
                                  {formatCurrency(tax)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>الخصم:</span>
                                <span className="font-bold text-green-600">
                                  -{formatCurrency(formData.discount)}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-lg font-bold">
                                  الإجمالي:
                                </span>
                                <span className="text-lg font-bold text-blue-600">
                                  {formatCurrency(total)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>المدفوع:</span>
                                <span className="font-bold text-green-600">
                                  {formatCurrency(formData.paidAmount)}
                                </span>
                              </div>
                              <div className="flex justify-between pb-2 border-b">
                                <span>المتبقي:</span>
                                <span className="font-bold text-red-600">
                                  {formatCurrency(remaining)}
                                </span>
                              </div>

                              {remaining > 0 && (
                                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                                  <p className="text-sm font-medium">
                                    تحديث رصيد المورد:
                                  </p>
                                  <p className="text-sm">
                                    الرصيد الحالي:{" "}
                                    {formatCurrency(selectedSupplier.balance)}
                                  </p>
                                  <p className="text-sm">
                                    الرصيد الجديد:{" "}
                                    <span className="font-bold text-red-600">
                                      {formatCurrency(
                                        selectedSupplier.balance + remaining
                                      )}
                                    </span>
                                  </p>
                                </div>
                              )}
                            </div>
                          </Card>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                {selectedSupplier && purchaseItems.length > 0 && (
                  <Button onClick={handleCreatePurchase} className="gap-2">
                    <DollarSign className="h-4 w-4" />
                    إنشاء فاتورة الشراء
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
};

export default Purchases;

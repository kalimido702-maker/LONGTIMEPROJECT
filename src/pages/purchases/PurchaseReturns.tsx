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
import { Search, RotateCcw, FileText, Package } from "lucide-react";
import {
  db,
  PurchaseReturn,
  PurchaseReturnItem,
  Product,
  Supplier,
  Shift,
} from "@/shared/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { APP_DEFAULTS } from "@/lib/constants";

interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
}

const PurchaseReturns = () => {
  const { user, can } = useAuth();
  const { getSetting } = useSettings();
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(
    null
  );
  const [returnItems, setReturnItems] = useState<PurchaseReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await db.init();

    // تحميل الوردية الحالية
    const allShifts = await db.getAll<Shift>("shifts");
    const activeShift = allShifts.find((s) => s.status === "active");
    setCurrentShift(activeShift || null);

    const allReturns = await db.getAll<PurchaseReturn>("purchaseReturns");
    const sortedReturns = allReturns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setPurchaseReturns(sortedReturns);

    // في الحقيقة، يجب أن يكون هناك جدول purchases، لكن للتوضيح سنستخدم بيانات وهمية
    // يمكنك إضافة جدول purchases لاحقاً
    const allSuppliers = await db.getAll<Supplier>("suppliers");
    setSuppliers(allSuppliers);
  };

  const handleSelectPurchase = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    const items: PurchaseReturnItem[] = purchase.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: 0,
      price: item.price,
      total: 0,
      reason: "",
    }));
    setReturnItems(items);
    setIsCreateDialogOpen(true);
  };

  const updateReturnQuantity = (index: number, quantity: number) => {
    const updatedItems = [...returnItems];
    const maxQuantity = selectedPurchase?.items[index]?.quantity || 0;

    if (quantity > maxQuantity) {
      toast.error(`الحد الأقصى للكمية المرتجعة: ${maxQuantity}`);
      return;
    }

    updatedItems[index].quantity = quantity;
    updatedItems[index].total = quantity * updatedItems[index].price;
    setReturnItems(updatedItems);
  };

  const handleCreateReturn = async () => {
    if (!selectedPurchase || !reason) {
      toast.error("يرجى إدخال سبب الإرجاع");
      return;
    }

    if (!currentShift) {
      toast.error("يجب فتح وردية أولاً");
      return;
    }

    const itemsToReturn = returnItems.filter((item) => item.quantity > 0);

    if (itemsToReturn.length === 0) {
      toast.error("يرجى اختيار المنتجات المراد إرجاعها");
      return;
    }

    const subtotal = itemsToReturn.reduce((sum, item) => sum + item.total, 0);

    // الحصول على نسبة الضريبة من الإعدادات أو استخدام القيمة الافتراضية
    const taxRateSetting = getSetting("taxRate");
    const taxRate = taxRateSetting
      ? parseFloat(taxRateSetting) / 100
      : APP_DEFAULTS.TAX.DEFAULT_RATE / 100;

    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const newReturn: PurchaseReturn = {
      id: `purchase_return_${Date.now()}`,
      originalPurchaseId: selectedPurchase.id,
      supplierId: selectedPurchase.supplierId,
      supplierName: selectedPurchase.supplierName,
      items: itemsToReturn,
      subtotal,
      tax,
      total,
      reason,
      userId: user?.id || "",
      userName: user?.username || "",
      createdAt: new Date().toISOString(),
      refundStatus: "pending",
      shiftId: currentShift.id,
    };

    try {
      await db.add("purchaseReturns", newReturn);

      // خصم المنتجات من المخزون (لأنها رجعت للمورد)
      for (const item of itemsToReturn) {
        const product = await db.get<Product>("products", item.productId);
        if (product) {
          product.stock -= item.quantity;
          await db.update("products", product);
        }
      }

      // تحديث رصيد المورد
      const supplier = await db.get<Supplier>(
        "suppliers",
        selectedPurchase.supplierId
      );
      if (supplier) {
        supplier.balance -= total; // نقلل رصيد المورد لأننا أرجعنا له بضاعة
        await db.update("suppliers", supplier);
      }

      // تحديث الوردية - إضافة قيمة مرتجع المشتريات
      if (currentShift) {
        const updatedShift: Shift = {
          ...currentShift,
          purchaseReturns: currentShift.purchaseReturns + total,
        };
        await db.update("shifts", updatedShift);
      }

      newReturn.refundStatus = "completed";
      await db.update("purchaseReturns", newReturn);

      toast.success("تم إنشاء فاتورة مرتجع المشتريات بنجاح");
      setIsCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error("حدث خطأ أثناء إنشاء المرتجع");
      console.error(error);
    }
  };

  const resetForm = () => {
    setSelectedPurchase(null);
    setReturnItems([]);
    setReason("");
  };

  const formatCurrency = (amount: number) => {
    return amount.toFixed(2) + " EGP";
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
              ليس لديك صلاحية عرض مرتجع المشتريات
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">مرتجع المشتريات</h1>
            </div>
          </div>

          {/* قائمة المرتجعات */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">سجل مرتجعات المشتريات</h2>
            <div className="space-y-4">
              {purchaseReturns.map((returnDoc) => (
                <Card key={returnDoc.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-bold">{returnDoc.id}</span>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            returnDoc.refundStatus === "completed"
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
                        فاتورة الشراء الأصلية: {returnDoc.originalPurchaseId}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        المورد: {returnDoc.supplierName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        السبب: {returnDoc.reason}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        التاريخ: {formatDate(returnDoc.createdAt)}
                      </p>
                      {returnDoc.shiftId && (
                        <p className="text-sm text-muted-foreground">
                          الوردية: {returnDoc.shiftId}
                        </p>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(returnDoc.total)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        عدد المنتجات: {returnDoc.items.length}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PurchaseReturns;

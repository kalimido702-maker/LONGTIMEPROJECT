import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  MapPin,
  FileText,
  DollarSign,
} from "lucide-react";
import { db, Supplier, Purchase } from "@/shared/lib/indexedDB";
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
import { Textarea } from "@/components/ui/textarea";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExcelExportButton } from "@/components/common/ExcelExportButton";

const Suppliers = () => {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    email: "",
    taxNumber: "",
    balance: 0,
    creditLimit: 10000,
    notes: "",
  });

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    const [suppliersData, purchasesData] = await Promise.all([
      db.getAll<Supplier>("suppliers"),
      db.getAll<Purchase>("purchases"),
    ]);
    setSuppliers(suppliersData);
    setPurchases(purchasesData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supplier: Supplier = {
        id: editingSupplier?.id || Date.now().toString(),
        ...formData,
        createdAt: editingSupplier?.createdAt || new Date().toISOString(),
      };

      if (editingSupplier) {
        await db.update("suppliers", supplier);
        toast({ title: "تم تحديث المورد بنجاح" });
      } else {
        await db.add("suppliers", supplier);
        toast({ title: "تم إضافة المورد بنجاح" });
      }

      loadSuppliers();
      resetForm();
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      email: supplier.email || "",
      taxNumber: supplier.taxNumber || "",
      balance: supplier.balance,
      creditLimit: supplier.creditLimit,
      notes: supplier.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا المورد؟")) {
      await db.delete("suppliers", id);
      toast({ title: "تم حذف المورد بنجاح" });
      loadSuppliers();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      address: "",
      email: "",
      taxNumber: "",
      balance: 0,
      creditLimit: 10000,
      notes: "",
    });
    setEditingSupplier(null);
    setDialogOpen(false);
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">إدارة الموردين</h1>
          {can("suppliers", "create") && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة مورد
            </Button>
          )}
          <ExcelExportButton
            data={filteredSuppliers}
            columns={[
              { header: "اسم المورد", key: "name", width: 25 },
              { header: "الهاتف", key: "phone", width: 15 },
              { header: "العنوان", key: "address", width: 30 },
              { header: "البريد الإلكتروني", key: "email", width: 20 },
              { header: "الرقم الضريبي", key: "taxNumber", width: 15 },
              { header: "الرصيد", key: "balance", width: 12 },
              { header: "حد الائتمان", key: "creditLimit", width: 12 },
              { header: "ملاحظات", key: "notes", width: 30 },
            ]}
            filename={`الموردين_${new Date().toLocaleDateString("ar-EG")}`}
            sheetName="الموردين"
          />
        </div>

        <div className="relative mb-6">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث عن مورد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => {
            const supplierPurchases = purchases.filter(
              (p) => p.supplierId === supplier.id
            );
            const totalPurchases = supplierPurchases.reduce(
              (sum, p) => sum + p.total,
              0
            );
            const creditUsage = (supplier.balance / supplier.creditLimit) * 100;

            return (
              <Card key={supplier.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{supplier.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Phone className="h-3 w-3" />
                      {supplier.phone}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3" />
                      {supplier.address}
                    </div>

                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          الرصيد المستحق:
                        </span>
                        <span
                          className={`font-semibold ${supplier.balance > 0
                              ? "text-red-600"
                              : "text-green-600"
                            }`}
                        >
                          {supplier.balance.toFixed(2)} {currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          حد الائتمان:
                        </span>
                        <span className="font-semibold">
                          {Number(supplier.creditLimit || 0).toFixed(2)} {currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          الرصيد المتاح:
                        </span>
                        <span
                          className={`font-semibold ${Number(supplier.creditLimit || 0) - Number(supplier.balance || 0) > 0
                              ? "text-green-600"
                              : "text-red-600"
                            }`}
                        >
                          {(Number(supplier.creditLimit || 0) - Number(supplier.balance || 0)).toFixed(2)}{" "}
                          {currency}
                        </span>
                      </div>

                      {/* Credit Usage Bar */}
                      <div className="pt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>استخدام الائتمان</span>
                          <span>{creditUsage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${creditUsage > 90
                                ? "bg-red-600"
                                : creditUsage > 70
                                  ? "bg-yellow-600"
                                  : "bg-green-600"
                              }`}
                            style={{ width: `${Math.min(creditUsage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSupplier(supplier);
                        setViewDialogOpen(true);
                      }}
                      className="gap-1"
                    >
                      <FileText className="h-3 w-3" />
                      التفاصيل
                    </Button>
                    {can("suppliers", "edit") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(supplier)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                    {can("suppliers", "delete") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(supplier.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {supplierPurchases.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        إجمالي المشتريات:
                      </span>
                      <span className="font-bold text-blue-600">
                        {totalPurchases.toFixed(2)} {currency}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {supplierPurchases.length} فاتورة
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? "تعديل مورد" : "إضافة مورد جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <Label>اسم المورد *</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>رقم الهاتف *</Label>
                  <Input
                    required
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>العنوان *</Label>
                  <Input
                    required
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>الرقم الضريبي</Label>
                  <Input
                    value={formData.taxNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, taxNumber: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>الرصيد الافتتاحي</Label>
                  <Input
                    type="number"
                    value={formData.balance}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        balance: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>حد الائتمان</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.creditLimit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        creditLimit: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    الحد الأقصى للمشتريات الآجلة
                  </p>
                </div>
                <div>
                  <Label>ملاحظات</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
                <Button type="submit">حفظ</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Supplier Details Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent
            className="max-w-4xl max-h-[90vh] overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle className="text-2xl">
                تفاصيل المورد - {selectedSupplier?.name}
              </DialogTitle>
            </DialogHeader>

            {selectedSupplier && (
              <div className="space-y-6">
                {/* Supplier Info */}
                <Card className="p-4 bg-muted">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        الهاتف
                      </Label>
                      <p className="font-medium">{selectedSupplier.phone}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        العنوان
                      </Label>
                      <p className="font-medium">{selectedSupplier.address}</p>
                    </div>
                    {selectedSupplier.email && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          البريد الإلكتروني
                        </Label>
                        <p className="font-medium">{selectedSupplier.email}</p>
                      </div>
                    )}
                    {selectedSupplier.taxNumber && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          الرقم الضريبي
                        </Label>
                        <p className="font-medium">
                          {selectedSupplier.taxNumber}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <Label className="text-xs text-muted-foreground">
                      الرصيد المستحق
                    </Label>
                    <p className="text-2xl font-bold text-red-600">
                      {selectedSupplier.balance.toFixed(2)} {currency}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <Label className="text-xs text-muted-foreground">
                      حد الائتمان
                    </Label>
                    <p className="text-2xl font-bold">
                      {Number(selectedSupplier.creditLimit || 0).toFixed(2)} {currency}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <Label className="text-xs text-muted-foreground">
                      الرصيد المتاح
                    </Label>
                    <p className="text-2xl font-bold text-green-600">
                      {(
                        Number(selectedSupplier.creditLimit || 0) - Number(selectedSupplier.balance || 0)
                      ).toFixed(2)}{" "}
                      {currency}
                    </p>
                  </Card>
                </div>

                {/* Purchase History */}
                <div>
                  <h3 className="text-lg font-bold mb-3">سجل المشتريات</h3>
                  {purchases.filter((p) => p.supplierId === selectedSupplier.id)
                    .length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                      لا توجد مشتريات من هذا المورد
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {purchases
                        .filter((p) => p.supplierId === selectedSupplier.id)
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                        )
                        .map((purchase) => (
                          <Card key={purchase.id} className="p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">
                                    {purchase.id}
                                  </span>
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
                                <p className="text-sm text-muted-foreground mt-1">
                                  التاريخ:{" "}
                                  {new Date(
                                    purchase.createdAt
                                  ).toLocaleDateString("ar-EG")}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {purchase.items.length} منتج
                                </p>
                              </div>
                              <div className="text-left">
                                <p className="text-xl font-bold text-blue-600">
                                  {purchase.total.toFixed(2)} {currency}
                                </p>
                                <p className="text-sm text-green-600">
                                  مدفوع: {purchase.paidAmount.toFixed(2)}{" "}
                                  {currency}
                                </p>
                                {purchase.remainingAmount > 0 && (
                                  <p className="text-sm text-red-600 font-semibold">
                                    متبقي: {purchase.remainingAmount.toFixed(2)}{" "}
                                    {currency}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedSupplier.notes && (
                  <div>
                    <Label className="text-sm font-bold">ملاحظات</Label>
                    <Card className="p-3 mt-2 bg-muted">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedSupplier.notes}
                      </p>
                    </Card>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setViewDialogOpen(false)}
              >
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Suppliers;

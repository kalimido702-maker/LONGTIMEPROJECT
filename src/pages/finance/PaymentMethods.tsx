import { useState, useEffect } from "react";
import { db, PaymentMethod } from "@/shared/lib/indexedDB";
import { Button } from "@/components/ui/button";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  Wallet,
  Banknote,
  Building2,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const paymentTypeIcons = {
  cash: Banknote,
  wallet: Wallet,
  visa: CreditCard,
  bank_transfer: Building2,
  other: HelpCircle,
};

const paymentTypeLabels = {
  cash: "نقدي",
  wallet: "محفظة إلكترونية",
  visa: "فيزا/بطاقة ائتمان",
  bank_transfer: "تحويل بنكي",
  other: "أخرى",
};

export default function PaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(
    null
  );
  const [formData, setFormData] = useState<{
    name: string;
    type: "cash" | "wallet" | "visa" | "bank_transfer" | "other";
    isActive: boolean;
  }>({
    name: "",
    type: "cash",
    isActive: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    setIsLoading(true);
    try {
      await db.init();
      const data = await db.getAll<PaymentMethod>("paymentMethods");
      // Sort by active first, then by name
      const sorted = data.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name, "ar");
      });
      setPaymentMethods(sorted);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل طرق الدفع",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (method?: PaymentMethod) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        type: method.type,
        isActive: method.isActive,
      });
    } else {
      setEditingMethod(null);
      setFormData({
        name: "",
        type: "cash",
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingMethod(null);
    setFormData({ name: "", type: "cash", isActive: true });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم طريقة الدفع",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await db.init();

      if (editingMethod) {
        // Update existing payment method
        const updatedMethod: PaymentMethod = {
          ...editingMethod,
          name: formData.name.trim(),
          type: formData.type,
          isActive: formData.isActive,
        };
        await db.update("paymentMethods", updatedMethod);
        toast({
          title: "✅ تم التحديث",
          description: "تم تحديث طريقة الدفع بنجاح",
        });
      } else {
        // Create new payment method
        const newMethod: PaymentMethod = {
          id: Date.now().toString(),
          name: formData.name.trim(),
          type: formData.type,
          isActive: formData.isActive,
          createdAt: new Date().toISOString(),
        };
        await db.add("paymentMethods", newMethod);
        toast({
          title: "✅ تم الإضافة",
          description: "تم إضافة طريقة الدفع بنجاح",
        });
      }

      await loadPaymentMethods();
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving payment method:", error);
      toast({
        title: "خطأ",
        description: "فشل حفظ طريقة الدفع",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await db.init();

      // Check if this payment method is used in any invoices
      const invoices = await db.getAll<any>("invoices");
      const usedInInvoices = invoices.filter(
        (inv) => inv.paymentMethodIds && inv.paymentMethodIds.includes(id)
      );

      if (usedInInvoices.length > 0) {
        toast({
          title: "تحذير",
          description: `لا يمكن حذف هذه الطريقة لأنها مستخدمة في ${usedInInvoices.length} فاتورة`,
          variant: "destructive",
        });
        setDeleteDialog(null);
        setIsDeleting(false);
        return;
      }

      await db.delete("paymentMethods", id);
      toast({
        title: "✅ تم الحذف",
        description: "تم حذف طريقة الدفع بنجاح",
      });
      await loadPaymentMethods();
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast({
        title: "خطأ",
        description: "فشل حذف طريقة الدفع",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialog(null);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await db.init();
      const method = await db.get<PaymentMethod>("paymentMethods", id);
      if (method) {
        method.isActive = !currentStatus;
        await db.update("paymentMethods", method);
        toast({
          title: "✅ تم التحديث",
          description: method.isActive
            ? "تم تفعيل طريقة الدفع"
            : "تم تعطيل طريقة الدفع",
        });
        await loadPaymentMethods();
      }
    } catch (error) {
      console.error("Error toggling payment method:", error);
      toast({
        title: "خطأ",
        description: "فشل تحديث حالة طريقة الدفع",
        variant: "destructive",
      });
    }
  };

  const getMethodIcon = (type: PaymentMethod["type"]) => {
    const Icon = paymentTypeIcons[type];
    return <Icon className="h-5 w-5" />;
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <main className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-primary" />
                طرق الدفع
              </CardTitle>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة طريقة دفع
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">جاري تحميل طرق الدفع...</p>
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CreditCard className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">لا توجد طرق دفع</h3>
                <p className="text-muted-foreground mb-4">
                  قم بإضافة أول طريقة دفع (مثل: نقدي، فيزا، محفظة إلكترونية)
                </p>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة طريقة دفع
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ الإضافة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods.map((method) => (
                    <TableRow key={method.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMethodIcon(method.type)}
                          <span className="font-medium">{method.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {paymentTypeLabels[method.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={method.isActive}
                            onCheckedChange={() =>
                              handleToggleActive(method.id, method.isActive)
                            }
                          />
                          <span
                            className={
                              method.isActive
                                ? "text-green-600"
                                : "text-gray-500"
                            }
                          >
                            {method.isActive ? "نشط" : "معطل"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(method.createdAt).toLocaleDateString(
                          "ar-EG",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(method)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog(method.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? "تعديل طريقة الدفع" : "إضافة طريقة دفع جديدة"}
              </DialogTitle>
              <DialogDescription>أدخل تفاصيل طريقة الدفع</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">الاسم *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="مثال: نقدي"
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="type">النوع *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4" />
                        نقدي
                      </div>
                    </SelectItem>
                    <SelectItem value="wallet">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        محفظة إلكترونية
                      </div>
                    </SelectItem>
                    <SelectItem value="visa">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        فيزا/بطاقة ائتمان
                      </div>
                    </SelectItem>
                    <SelectItem value="bank_transfer">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        تحويل بنكي
                      </div>
                    </SelectItem>
                    <SelectItem value="other">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        أخرى
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">نشط</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                إلغاء
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !formData.name.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : editingMethod ? (
                  "تحديث"
                ) : (
                  "إضافة"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialog !== null}
          onOpenChange={() => setDeleteDialog(null)}
        >
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف طريقة الدفع هذه؟ لا يمكن التراجع عن هذا
                الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteDialog && handleDelete(deleteDialog)}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  "حذف"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

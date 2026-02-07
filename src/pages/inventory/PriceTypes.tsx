import { useState, useEffect } from "react";
import { db, PriceType } from "@/shared/lib/indexedDB";
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
  Check,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export default function PriceTypes() {
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [editingPriceType, setEditingPriceType] = useState<PriceType | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    isDefault: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadPriceTypes();
  }, []);

  const loadPriceTypes = async () => {
    setIsLoading(true);
    try {
      await db.init();
      const data = await db.getAll<PriceType>("priceTypes");
      // Sort by display order
      const sorted = data.sort((a, b) => a.displayOrder - b.displayOrder);
      setPriceTypes(sorted);
    } catch (error) {
      console.error("Error loading price types:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل أنواع التسعير",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (priceType?: PriceType) => {
    if (priceType) {
      setEditingPriceType(priceType);
      setFormData({
        name: priceType.name,
        isDefault: priceType.isDefault,
      });
    } else {
      setEditingPriceType(null);
      setFormData({
        name: "",
        isDefault: priceTypes.length === 0, // First price type is default by default
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPriceType(null);
    setFormData({ name: "", isDefault: false });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم نوع السعر",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await db.init();

      // If setting this price type as default, remove default from others
      if (formData.isDefault) {
        const allPriceTypes = await db.getAll<PriceType>("priceTypes");
        for (const priceType of allPriceTypes) {
          if (priceType.isDefault && priceType.id !== editingPriceType?.id) {
            priceType.isDefault = false;
            await db.update("priceTypes", priceType);
          }
        }
      }

      if (editingPriceType) {
        // Update existing price type
        const updatedPriceType: PriceType = {
          ...editingPriceType,
          name: formData.name.trim(),
          isDefault: formData.isDefault,
        };
        await db.update("priceTypes", updatedPriceType);
        toast({
          title: "✅ تم التحديث",
          description: "تم تحديث نوع السعر بنجاح",
        });
      } else {
        // Create new price type with next order number
        const allPriceTypes = await db.getAll<PriceType>("priceTypes");
        const maxOrder =
          allPriceTypes.length > 0
            ? Math.max(...allPriceTypes.map((pt) => pt.displayOrder))
            : 0;

        const newPriceType: PriceType = {
          id: Date.now().toString(),
          name: formData.name.trim(),
          displayOrder: maxOrder + 1,
          isDefault: formData.isDefault,
          createdAt: new Date().toISOString(),
        };
        await db.add("priceTypes", newPriceType);
        toast({
          title: "✅ تم الإضافة",
          description: "تم إضافة نوع السعر بنجاح",
        });
      }

      await loadPriceTypes();
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving price type:", error);
      toast({
        title: "خطأ",
        description: "فشل حفظ نوع السعر",
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

      // Check if this price type is used by any products
      const products = await db.getAll<any>("products");
      const usedByProducts = products.filter(
        (p) => p.prices && Object.keys(p.prices).includes(id)
      );

      if (usedByProducts.length > 0) {
        toast({
          title: "تحذير",
          description: `لا يمكن حذف هذا النوع لأنه مستخدم في ${usedByProducts.length} منتج`,
          variant: "destructive",
        });
        setDeleteDialog(null);
        setIsDeleting(false);
        return;
      }

      await db.delete("priceTypes", id);

      // Reorder remaining price types
      const remainingTypes = priceTypes.filter((pt) => pt.id !== id);
      for (let i = 0; i < remainingTypes.length; i++) {
        remainingTypes[i].displayOrder = i + 1;
        await db.update("priceTypes", remainingTypes[i]);
      }

      toast({
        title: "✅ تم الحذف",
        description: "تم حذف نوع السعر بنجاح",
      });
      await loadPriceTypes();
    } catch (error) {
      console.error("Error deleting price type:", error);
      toast({
        title: "خطأ",
        description: "فشل حذف نوع السعر",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialog(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await db.init();

      // Remove default from all price types
      const allPriceTypes = await db.getAll<PriceType>("priceTypes");
      for (const priceType of allPriceTypes) {
        if (priceType.isDefault) {
          priceType.isDefault = false;
          await db.update("priceTypes", priceType);
        }
      }

      // Set this price type as default
      const priceType = await db.get<PriceType>("priceTypes", id);
      if (priceType) {
        priceType.isDefault = true;
        await db.update("priceTypes", priceType);
        toast({
          title: "✅ تم التحديث",
          description: `تم تعيين "${priceType.name}" كنوع سعر افتراضي`,
        });
        await loadPriceTypes();
      }
    } catch (error) {
      console.error("Error setting default price type:", error);
      toast({
        title: "خطأ",
        description: "فشل تعيين نوع السعر الافتراضي",
        variant: "destructive",
      });
    }
  };

  const handleMoveUp = async (id: string) => {
    const index = priceTypes.findIndex((pt) => pt.id === id);
    if (index <= 0) return;

    try {
      await db.init();

      // Swap orders
      const current = priceTypes[index];
      const previous = priceTypes[index - 1];

      const tempOrder = current.displayOrder;
      current.displayOrder = previous.displayOrder;
      previous.displayOrder = tempOrder;

      await db.update("priceTypes", current);
      await db.update("priceTypes", previous);

      await loadPriceTypes();
    } catch (error) {
      console.error("Error moving price type up:", error);
      toast({
        title: "خطأ",
        description: "فشل تغيير الترتيب",
        variant: "destructive",
      });
    }
  };

  const handleMoveDown = async (id: string) => {
    const index = priceTypes.findIndex((pt) => pt.id === id);
    if (index < 0 || index >= priceTypes.length - 1) return;

    try {
      await db.init();

      // Swap orders
      const current = priceTypes[index];
      const next = priceTypes[index + 1];

      const tempOrder = current.displayOrder;
      current.displayOrder = next.displayOrder;
      next.displayOrder = tempOrder;

      await db.update("priceTypes", current);
      await db.update("priceTypes", next);

      await loadPriceTypes();
    } catch (error) {
      console.error("Error moving price type down:", error);
      toast({
        title: "خطأ",
        description: "فشل تغيير الترتيب",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <main className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-6 w-6 text-primary" />
                أنواع التسعير
              </CardTitle>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة نوع سعر
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  جاري تحميل أنواع التسعير...
                </p>
              </div>
            ) : priceTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DollarSign className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  لا توجد أنواع تسعير
                </h3>
                <p className="text-muted-foreground mb-4">
                  قم بإضافة أول نوع تسعير (مثل: سعر البيع، سعر الجملة، سعر خاص)
                </p>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة نوع سعر
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-16">الترتيب</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ الإضافة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceTypes.map((priceType, index) => (
                    <TableRow key={priceType.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveUp(priceType.id)}
                            disabled={index === 0}
                            className="h-6 w-6 p-0"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Badge variant="outline">
                            {priceType.displayOrder}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveDown(priceType.id)}
                            disabled={index === priceTypes.length - 1}
                            className="h-6 w-6 p-0"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {priceType.name}
                      </TableCell>
                      <TableCell>
                        {priceType.isDefault ? (
                          <Badge variant="default">
                            <Check className="h-3 w-3 ml-1" />
                            افتراضي
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(priceType.id)}
                          >
                            تعيين كافتراضي
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(priceType.createdAt).toLocaleDateString(
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
                            onClick={() => handleOpenDialog(priceType)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog(priceType.id)}
                            disabled={priceType.isDefault}
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
                {editingPriceType ? "تعديل نوع السعر" : "إضافة نوع سعر جديد"}
              </DialogTitle>
              <DialogDescription>
                أدخل اسم نوع السعر (مثل: سعر البيع، سعر الجملة، سعر خاص)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">اسم نوع السعر *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="مثال: سعر البيع"
                  maxLength={50}
                />
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) =>
                    setFormData({ ...formData, isDefault: e.target.checked })
                  }
                  className="rounded"
                />
                <Label htmlFor="isDefault">تعيين كنوع سعر افتراضي</Label>
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
                ) : editingPriceType ? (
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
                هل أنت متأكد من حذف نوع السعر هذا؟ لا يمكن التراجع عن هذا
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

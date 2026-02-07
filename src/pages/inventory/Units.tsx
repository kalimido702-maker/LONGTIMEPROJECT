import { useState, useEffect } from "react";
import { db, Unit } from "@/shared/lib/indexedDB";
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
import { Plus, Pencil, Trash2, Check, Ruler, Loader2 } from "lucide-react";
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

export default function Units() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    isDefault: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    setIsLoading(true);
    try {
      await db.init();
      const data = await db.getAll<Unit>("units");
      // Sort by default first, then by name
      const sorted = data.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name, "ar");
      });
      setUnits(sorted);
    } catch (error) {
      console.error("Error loading units:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل وحدات القياس",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (unit?: Unit) => {
    if (unit) {
      setEditingUnit(unit);
      setFormData({
        name: unit.name,
        symbol: unit.symbol,
        isDefault: unit.isDefault,
      });
    } else {
      setEditingUnit(null);
      setFormData({
        name: "",
        symbol: "",
        isDefault: units.length === 0, // First unit is default by default
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUnit(null);
    setFormData({ name: "", symbol: "", isDefault: false });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.symbol.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await db.init();

      // If setting this unit as default, remove default from others
      if (formData.isDefault) {
        const allUnits = await db.getAll<Unit>("units");
        for (const unit of allUnits) {
          if (unit.isDefault && unit.id !== editingUnit?.id) {
            unit.isDefault = false;
            await db.update("units", unit);
          }
        }
      }

      if (editingUnit) {
        // Update existing unit
        const updatedUnit: Unit = {
          ...editingUnit,
          name: formData.name.trim(),
          symbol: formData.symbol.trim(),
          isDefault: formData.isDefault,
        };
        await db.update("units", updatedUnit);
        toast({
          title: "✅ تم التحديث",
          description: "تم تحديث وحدة القياس بنجاح",
        });
      } else {
        // Create new unit
        const newUnit: Unit = {
          id: Date.now().toString(),
          name: formData.name.trim(),
          symbol: formData.symbol.trim(),
          isDefault: formData.isDefault,
          createdAt: new Date().toISOString(),
        };
        await db.add("units", newUnit);
        toast({
          title: "✅ تم الإضافة",
          description: "تم إضافة وحدة القياس بنجاح",
        });
      }

      await loadUnits();
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving unit:", error);
      toast({
        title: "خطأ",
        description: "فشل حفظ وحدة القياس",
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

      // Check if this unit is used by any products
      const products = await db.getAll<any>("products");
      const usedByProducts = products.filter((p) => p.unitId === id);

      if (usedByProducts.length > 0) {
        toast({
          title: "تحذير",
          description: `لا يمكن حذف هذه الوحدة لأنها مستخدمة في ${usedByProducts.length} منتج`,
          variant: "destructive",
        });
        setDeleteDialog(null);
        setIsDeleting(false);
        return;
      }

      await db.delete("units", id);
      toast({
        title: "✅ تم الحذف",
        description: "تم حذف وحدة القياس بنجاح",
      });
      await loadUnits();
    } catch (error) {
      console.error("Error deleting unit:", error);
      toast({
        title: "خطأ",
        description: "فشل حذف وحدة القياس",
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

      // Remove default from all units
      const allUnits = await db.getAll<Unit>("units");
      for (const unit of allUnits) {
        if (unit.isDefault) {
          unit.isDefault = false;
          await db.update("units", unit);
        }
      }

      // Set this unit as default
      const unit = await db.get<Unit>("units", id);
      if (unit) {
        unit.isDefault = true;
        await db.update("units", unit);
        toast({
          title: "✅ تم التحديث",
          description: `تم تعيين "${unit.name}" كوحدة افتراضية`,
        });
        await loadUnits();
      }
    } catch (error) {
      console.error("Error setting default unit:", error);
      toast({
        title: "خطأ",
        description: "فشل تعيين الوحدة الافتراضية",
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
                <Ruler className="h-6 w-6 text-primary" />
                وحدات القياس
              </CardTitle>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة وحدة قياس
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  جاري تحميل وحدات القياس...
                </p>
              </div>
            ) : units.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Ruler className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  لا توجد وحدات قياس
                </h3>
                <p className="text-muted-foreground mb-4">
                  قم بإضافة أول وحدة قياس (مثل: كجم، لتر، قطعة)
                </p>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة وحدة قياس
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ الإضافة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{unit.symbol}</Badge>
                      </TableCell>
                      <TableCell>
                        {unit.isDefault ? (
                          <Badge variant="default">
                            <Check className="h-3 w-3 ml-1" />
                            افتراضي
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(unit.id)}
                          >
                            تعيين كافتراضي
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(unit.createdAt).toLocaleDateString("ar-EG", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(unit)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog(unit.id)}
                            disabled={unit.isDefault}
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
                {editingUnit ? "تعديل وحدة القياس" : "إضافة وحدة قياس جديدة"}
              </DialogTitle>
              <DialogDescription>
                أدخل تفاصيل وحدة القياس (مثل: كيلوجرام - كجم)
              </DialogDescription>
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
                  placeholder="مثال: كيلوجرام"
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="symbol">الرمز *</Label>
                <Input
                  id="symbol"
                  value={formData.symbol}
                  onChange={(e) =>
                    setFormData({ ...formData, symbol: e.target.value })
                  }
                  placeholder="مثال: كجم"
                  maxLength={10}
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
                <Label htmlFor="isDefault">تعيين كوحدة افتراضية</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                إلغاء
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  isSaving || !formData.name.trim() || !formData.symbol.trim()
                }
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : editingUnit ? (
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
                هل أنت متأكد من حذف هذه الوحدة؟ لا يمكن التراجع عن هذا الإجراء.
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

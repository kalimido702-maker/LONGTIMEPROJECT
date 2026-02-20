import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, FolderOpen, FolderX, Percent } from "lucide-react";
import { db, ProductCategory } from "@/shared/lib/indexedDB";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

const ProductCategories = () => {
  const { can } = useAuth();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ProductCategory | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    nameAr: "",
    description: "",
    bonusPercentage: "",
    active: true,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const data = await db.getAll<ProductCategory>("productCategories");
    setCategories(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // التحقق من عدم تكرار اسم القسم
      const nameExists = await db.isCategoryNameExists(
        formData.nameAr,
        editingCategory?.id
      );

      if (nameExists) {
        toast({
          title: "خطأ",
          description: "اسم القسم موجود بالفعل، الرجاء اختيار اسم آخر",
          variant: "destructive",
        });
        return;
      }

      const category: ProductCategory = {
        id: editingCategory?.id || Date.now().toString(),
        name: formData.nameAr, // استخدام الاسم العربي للحقلين
        nameAr: formData.nameAr,
        description: formData.description,
        bonusPercentage: formData.bonusPercentage ? parseFloat(formData.bonusPercentage) : undefined,
        active: formData.active,
        createdAt: editingCategory?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingCategory) {
        await db.update("productCategories", category);
        toast({ title: "تم تحديث القسم بنجاح" });
      } else {
        await db.add("productCategories", category);
        toast({ title: "تم إضافة القسم بنجاح" });
      }

      resetForm();
      loadCategories();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ البيانات",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (category: ProductCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.nameAr, // استخدام الاسم العربي
      nameAr: category.nameAr,
      description: category.description || "",
      bonusPercentage: category.bonusPercentage?.toString() || "",
      active: category.active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      // الحصول على القسم للحصول على اسمه
      const category = categories.find((c) => c.id === id);
      if (!category) return;

      // التحقق من وجود منتجات تحت هذا القسم
      const productsInCategory = await db.getProductsByCategory(
        category.nameAr
      );

      if (productsInCategory.length > 0) {
        // إظهار تأكيد للمستخدم
        const confirmed = confirm(
          `يوجد ${productsInCategory.length} منتج تحت هذا القسم.\n` +
          `إذا تم الحذف، ستصبح هذه المنتجات بدون قسم.\n\n` +
          `هل تريد المتابعة؟`
        );

        if (!confirmed) return;

        // تفريغ القسم من المنتجات
        await db.clearCategoryFromProducts(category.nameAr);
        toast({
          title: "تم تفريغ القسم من المنتجات",
          description: `تم إزالة القسم من ${productsInCategory.length} منتج`,
        });
      } else {
        // لا يوجد منتجات، حذف مباشر مع تأكيد بسيط
        const confirmed = confirm("هل أنت متأكد من حذف هذا القسم؟");
        if (!confirmed) return;
      }

      // حذف القسم
      await db.delete("productCategories", id);
      toast({ title: "تم حذف القسم بنجاح" });
      loadCategories();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف القسم",
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (category: ProductCategory) => {
    const updated: ProductCategory = {
      ...category,
      active: !category.active,
      updatedAt: new Date().toISOString(),
    };
    await db.update("productCategories", updated);
    toast({
      title: updated.active ? "تم تفعيل القسم" : "تم إلغاء تفعيل القسم",
    });
    loadCategories();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      nameAr: "",
      description: "",
      bonusPercentage: "",
      active: true,
    });
    setEditingCategory(null);
    setDialogOpen(false);
  };

  const filteredCategories = categories.filter(
    (cat) =>
      cat.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.nameAr?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pagination = usePagination(filteredCategories, { resetDeps: [searchTerm] });

  if (!can("products", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <p className="text-destructive font-semibold">
              ⚠️ ليس لديك صلاحية لعرض هذه الصفحة
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">أقسام المنتجات</h1>
          {can("products", "create") && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة قسم
            </Button>
          )}
        </div>

        {/* بطاقات الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأقسام</p>
                <p className="text-2xl font-bold">{categories.length}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">أقسام نشطة</p>
                <p className="text-2xl font-bold text-green-600">
                  {categories.filter((c) => c.active).length}
                </p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-full">
                <FolderOpen className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">أقسام غير نشطة</p>
                <p className="text-2xl font-bold text-gray-600">
                  {categories.filter((c) => !c.active).length}
                </p>
              </div>
              <div className="p-3 bg-gray-500/10 rounded-full">
                <FolderX className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </Card>
        </div>

        {/* البحث */}
        <div className="relative mb-6">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث في الأقسام..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* قائمة الأقسام */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground col-span-full">
              لا توجد أقسام
            </Card>
          ) : (
            pagination.paginatedItems.map((category) => (
              <Card key={category.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">{category.nameAr}</h3>
                      <Badge
                        variant={category.active ? "default" : "secondary"}
                      >
                        {category.active ? "نشط" : "غير نشط"}
                      </Badge>
                    </div>
                    {category.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {category.description}
                      </p>
                    )}
                    {category.bonusPercentage !== undefined && category.bonusPercentage > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Percent className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600 font-medium">
                          بونص: {category.bonusPercentage}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(category)}
                  >
                    {category.active ? (
                      <>
                        <FolderX className="h-3 w-3 ml-1" />
                        إلغاء التفعيل
                      </>
                    ) : (
                      <>
                        <FolderOpen className="h-3 w-3 ml-1" />
                        تفعيل
                      </>
                    )}
                  </Button>
                  <div className="flex gap-2">
                    {can("products", "edit") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(category)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                    {can("products", "delete") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(category.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <DataPagination {...pagination} entityName="قسم منتجات" />

        {/* نموذج إضافة/تعديل القسم */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "تعديل القسم" : "إضافة قسم جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <Label>اسم القسم *</Label>
                  <Input
                    required
                    value={formData.nameAr}
                    onChange={(e) =>
                      setFormData({ ...formData, nameAr: e.target.value })
                    }
                    placeholder="مثال: مشروبات"
                  />
                </div>

                <div>
                  <Label>الوصف (اختياري)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="وصف القسم..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    نسبة البونص (%)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.bonusPercentage}
                    onChange={(e) =>
                      setFormData({ ...formData, bonusPercentage: e.target.value })
                    }
                    placeholder="مثال: 5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    نسبة البونص التي ستطبق على مبيعات هذا القسم لحساب بونص المشرف
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-muted p-3 rounded border">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={(e) =>
                      setFormData({ ...formData, active: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <Label htmlFor="active" className="cursor-pointer">
                    ✅ القسم نشط
                  </Label>
                </div>
              </div>

              <DialogFooter className="mt-6 gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
                <Button type="submit">
                  {editingCategory ? "حفظ التعديلات" : "إضافة القسم"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ProductCategories;

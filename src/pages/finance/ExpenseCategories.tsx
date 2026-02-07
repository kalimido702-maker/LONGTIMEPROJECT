import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, ExpenseCategory } from "@/shared/lib/indexedDB";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const ExpenseCategories = () => {
  const { can } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<
    ExpenseCategory[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ExpenseCategory | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    filterCategories();
  }, [categories, searchTerm]);

  const loadCategories = async () => {
    await db.init();
    const data = await db.getAll<ExpenseCategory>("expenseCategories");
    setCategories(
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  };

  const filterCategories = () => {
    let filtered = [...categories];

    if (searchTerm) {
      filtered = filtered.filter(
        (category) =>
          category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          category.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredCategories(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: "الرجاء إدخال اسم الفئة", variant: "destructive" });
      return;
    }

    try {
      if (editingCategory) {
        // Update existing
        const updated: ExpenseCategory = {
          ...editingCategory,
          name: formData.name.trim(),
          description: formData.description.trim(),
          active: formData.active,
          updatedAt: new Date().toISOString(),
        };
        await db.update("expenseCategories", updated);
        toast({ title: "تم تحديث الفئة بنجاح" });
      } else {
        // Create new
        const newCategory: ExpenseCategory = {
          id: Date.now().toString(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          active: formData.active,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.add("expenseCategories", newCategory);
        toast({ title: "تم إضافة الفئة بنجاح" });
      }

      await loadCategories();
      resetForm();
      setShowDialog(false);
    } catch (error) {
      console.error("Error saving category:", error);
      toast({ title: "حدث خطأ أثناء حفظ الفئة", variant: "destructive" });
    }
  };

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      active: category.active,
    });
    setShowDialog(true);
  };

  const handleToggleActive = async (category: ExpenseCategory) => {
    try {
      const updated: ExpenseCategory = {
        ...category,
        active: !category.active,
        updatedAt: new Date().toISOString(),
      };
      await db.update("expenseCategories", updated);
      await loadCategories();
      toast({ title: "تم تحديث حالة الفئة" });
    } catch (error) {
      console.error("Error toggling active:", error);
      toast({
        title: "حدث خطأ أثناء تحديث حالة الفئة",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      active: true,
    });
    setEditingCategory(null);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    resetForm();
  };

  if (!can("expenseCategories", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <div className="text-center text-red-600">
            ليس لديك صلاحية لعرض هذه الصفحة
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">فئات المصروفات</h1>
          {can("expenseCategories", "create") && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="ml-2 h-4 w-4" />
              فئة جديدة
            </Button>
          )}
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث في الفئات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>

        {/* Categories Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                {can("expenseCategories", "update") && (
                  <TableHead className="text-right">إجراءات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-gray-500 py-8"
                  >
                    لا توجد فئات
                  </TableCell>
                </TableRow>
              ) : (
                filteredCategories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      {category.name}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {category.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={category.active ? "default" : "secondary"}
                        >
                          {category.active ? "نشطة" : "غير نشطة"}
                        </Badge>
                        {can("expenseCategories", "update") && (
                          <Switch
                            checked={category.active}
                            onCheckedChange={() => handleToggleActive(category)}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(category.createdAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    {can("expenseCategories", "update") && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(category)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "تعديل الفئة" : "فئة جديدة"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">الاسم *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="مثال: إيجار، كهرباء، مرتبات، ..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="وصف اختياري للفئة"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="active">نشطة</Label>
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  إلغاء
                </Button>
                <Button type="submit">
                  {editingCategory ? "تحديث" : "إضافة"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ExpenseCategories;

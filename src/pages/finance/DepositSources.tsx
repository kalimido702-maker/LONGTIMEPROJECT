import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, DepositSource } from "@/shared/lib/indexedDB";
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

const DepositSources = () => {
  const { can } = useAuth();
  const { toast } = useToast();
  const [sources, setSources] = useState<DepositSource[]>([]);
  const [filteredSources, setFilteredSources] = useState<DepositSource[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<DepositSource | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
  });

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    filterSources();
  }, [sources, searchTerm]);

  const loadSources = async () => {
    await db.init();
    const data = await db.getAll<DepositSource>("depositSources");
    setSources(
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  };

  const filterSources = () => {
    let filtered = [...sources];

    if (searchTerm) {
      filtered = filtered.filter(
        (source) =>
          source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          source.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredSources(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: "الرجاء إدخال اسم المصدر", variant: "destructive" });
      return;
    }

    try {
      if (editingSource) {
        // Update existing
        const updated: DepositSource = {
          ...editingSource,
          name: formData.name.trim(),
          description: formData.description.trim(),
          active: formData.active,
          updatedAt: new Date().toISOString(),
        };
        await db.update("depositSources", updated);
        toast({ title: "تم تحديث المصدر بنجاح" });
      } else {
        // Create new
        const newSource: DepositSource = {
          id: Date.now().toString(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          active: formData.active,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.add("depositSources", newSource);
        toast({ title: "تم إضافة المصدر بنجاح" });
      }

      await loadSources();
      resetForm();
      setShowDialog(false);
    } catch (error) {
      console.error("Error saving source:", error);
      toast({ title: "حدث خطأ أثناء حفظ المصدر", variant: "destructive" });
    }
  };

  const handleEdit = (source: DepositSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      description: source.description || "",
      active: source.active,
    });
    setShowDialog(true);
  };

  const handleToggleActive = async (source: DepositSource) => {
    try {
      const updated: DepositSource = {
        ...source,
        active: !source.active,
        updatedAt: new Date().toISOString(),
      };
      await db.update("depositSources", updated);
      await loadSources();
      toast({ title: "تم تحديث حالة المصدر" });
    } catch (error) {
      console.error("Error toggling active:", error);
      toast({
        title: "حدث خطأ أثناء تحديث حالة المصدر",
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
    setEditingSource(null);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    resetForm();
  };

  if (!can("depositSources", "view")) {
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
          <h1 className="text-3xl font-bold">مصادر الإيداعات</h1>
          {can("depositSources", "create") && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="ml-2 h-4 w-4" />
              مصدر جديد
            </Button>
          )}
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث في المصادر..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>

        {/* Sources Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                {can("depositSources", "update") && (
                  <TableHead className="text-right">إجراءات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSources.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-gray-500 py-8"
                  >
                    لا توجد مصادر
                  </TableCell>
                </TableRow>
              ) : (
                filteredSources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell className="text-gray-600">
                      {source.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={source.active ? "default" : "secondary"}
                        >
                          {source.active ? "نشط" : "غير نشط"}
                        </Badge>
                        {can("depositSources", "update") && (
                          <Switch
                            checked={source.active}
                            onCheckedChange={() => handleToggleActive(source)}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(source.createdAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    {can("depositSources", "update") && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(source)}
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
                {editingSource ? "تعديل المصدر" : "مصدر جديد"}
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
                  placeholder="مثال: البنك الأهلي، الكاش، ..."
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
                  placeholder="وصف اختياري للمصدر"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="active">نشط</Label>
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
                  {editingSource ? "تحديث" : "إضافة"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default DepositSources;

import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Tag, Percent } from "lucide-react";
import { db, Promotion } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";

const Promotions = () => {
  const { can } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(
    null
  );
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 0,
    startDate: "",
    endDate: "",
    active: true,
  });

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    const data = await db.getAll<Promotion>("promotions");
    setPromotions(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const promotion: Promotion = {
        id: editingPromotion?.id || Date.now().toString(),
        ...formData,
      };

      if (editingPromotion) {
        await db.update("promotions", promotion);
        toast({ title: "تم تحديث العرض بنجاح" });
      } else {
        await db.add("promotions", promotion);
        toast({ title: "تم إضافة العرض بنجاح" });
      }

      loadPromotions();
      resetForm();
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleEdit = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData({
      name: promotion.name,
      description: promotion.description,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      active: promotion.active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا العرض؟")) {
      await db.delete("promotions", id);
      toast({ title: "تم حذف العرض بنجاح" });
      loadPromotions();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      startDate: "",
      endDate: "",
      active: true,
    });
    setEditingPromotion(null);
    setDialogOpen(false);
  };

  const filteredPromotions = promotions.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isPromotionActive = (promotion: Promotion) => {
    const now = new Date();
    const start = new Date(promotion.startDate);
    const end = new Date(promotion.endDate);
    return promotion.active && now >= start && now <= end;
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("promotions", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض العروض والخصومات
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">إدارة العروض والخصومات</h1>
            {can("promotions", "create") && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة عرض
              </Button>
            )}
          </div>

          <div className="relative mb-6">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن عرض..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPromotions.map((promotion) => (
              <Card key={promotion.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">{promotion.name}</h3>
                      <Badge
                        variant={
                          isPromotionActive(promotion) ? "default" : "secondary"
                        }
                      >
                        {isPromotionActive(promotion) ? "نشط" : "غير نشط"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {promotion.description}
                    </p>
                    <div className="flex items-center gap-2 text-primary font-bold text-xl">
                      {promotion.discountType === "percentage" ? (
                        <>
                          <Percent className="h-5 w-5" />
                          <span>{promotion.discountValue}%</span>
                        </>
                      ) : (
                        <>
                          <Tag className="h-5 w-5" />
                          <span>
                            {promotion.discountValue} {currency}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      <p>
                        من:{" "}
                        {new Date(promotion.startDate).toLocaleDateString(
                          "ar-EG"
                        )}
                      </p>
                      <p>
                        إلى:{" "}
                        {new Date(promotion.endDate).toLocaleDateString(
                          "ar-EG"
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  {can("promotions", "edit") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(promotion)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                  {can("promotions", "delete") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(promotion.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>
                  {editingPromotion ? "تعديل عرض" : "إضافة عرض جديد"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label>اسم العرض *</Label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>الوصف *</Label>
                    <Textarea
                      required
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>نوع الخصم *</Label>
                    <Select
                      value={formData.discountType}
                      onValueChange={(value: "percentage" | "fixed") =>
                        setFormData({ ...formData, discountType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">
                          نسبة مئوية (%)
                        </SelectItem>
                        <SelectItem value="fixed">
                          قيمة ثابتة ({currency})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>قيمة الخصم *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.discountValue}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discountValue: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>تاريخ البداية *</Label>
                    <Input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) =>
                        setFormData({ ...formData, startDate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>تاريخ النهاية *</Label>
                    <Input
                      type="date"
                      required
                      value={formData.endDate}
                      onChange={(e) =>
                        setFormData({ ...formData, endDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="active"
                      checked={formData.active}
                      onChange={(e) =>
                        setFormData({ ...formData, active: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <Label htmlFor="active">عرض نشط</Label>
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
        </div>
      )}
    </div>
  );
};

export default Promotions;

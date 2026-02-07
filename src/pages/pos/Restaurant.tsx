import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Users } from "lucide-react";
import { db, Hall, RestaurantTable } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

const Restaurant = () => {
  const { can } = useAuth();
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedHall, setSelectedHall] = useState<string>("");
  const [hallDialogOpen, setHallDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const { toast } = useToast();

  const [hallForm, setHallForm] = useState({ name: "", description: "" });
  const [tableForm, setTableForm] = useState({
    tableNumber: "",
    capacity: 4,
    hallId: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const hallsData = await db.getAll<Hall>("halls");
    const tablesData = await db.getAll<RestaurantTable>("tables");
    setHalls(hallsData);
    setTables(tablesData);
    if (hallsData.length > 0 && !selectedHall) {
      setSelectedHall(hallsData[0].id);
    }
  };

  const handleAddHall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hall: Hall = {
        id: Date.now().toString(),
        ...hallForm,
        active: true,
      };
      await db.add("halls", hall);
      toast({ title: "تم إضافة الصالة بنجاح" });
      loadData();
      setHallForm({ name: "", description: "" });
      setHallDialogOpen(false);
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const table: RestaurantTable = {
        id: Date.now().toString(),
        ...tableForm,
        hallId: selectedHall,
        status: "available",
      };
      await db.add("tables", table);
      toast({ title: "تم إضافة الطاولة بنجاح" });
      loadData();
      setTableForm({ tableNumber: "", capacity: 4, hallId: "" });
      setTableDialogOpen(false);
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "default";
      case "occupied":
        return "destructive";
      case "reserved":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available":
        return "متاحة";
      case "occupied":
        return "مشغولة";
      case "reserved":
        return "محجوزة";
      default:
        return status;
    }
  };

  const filteredTables = tables.filter((t) => t.hallId === selectedHall);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      {!can("restaurant", "view") ? (
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض إدارة المطاعم
            </p>
          </Card>
        </div>
      ) : (
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">إدارة الصالات والطاولات</h1>
            <div className="flex gap-2">
              {can("restaurant", "create") && (
                <>
                  <Button
                    onClick={() => setHallDialogOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة صالة
                  </Button>
                  <Button
                    onClick={() => setTableDialogOpen(true)}
                    className="gap-2"
                    disabled={halls.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    إضافة طاولة
                  </Button>
                </>
              )}
            </div>
          </div>

          <Tabs value={selectedHall} onValueChange={setSelectedHall}>
            <TabsList className="mb-4">
              {halls.map((hall) => (
                <TabsTrigger key={hall.id} value={hall.id}>
                  {hall.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {halls.map((hall) => (
              <TabsContent key={hall.id} value={hall.id}>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredTables.map((table) => (
                    <Card
                      key={table.id}
                      className="p-6 cursor-pointer hover:shadow-lg transition-all"
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">🪑</div>
                        <h3 className="font-bold text-lg mb-2">
                          طاولة {table.tableNumber}
                        </h3>
                        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-2">
                          <Users className="h-3 w-3" />
                          <span>{table.capacity} أشخاص</span>
                        </div>
                        <Badge variant={getStatusColor(table.status)}>
                          {getStatusText(table.status)}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
                {filteredTables.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    لا توجد طاولات في هذه الصالة
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {halls.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد صالات. قم بإضافة صالة أولاً
            </div>
          )}

          <Dialog open={hallDialogOpen} onOpenChange={setHallDialogOpen}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة صالة جديدة</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddHall}>
                <div className="space-y-4">
                  <div>
                    <Label>اسم الصالة *</Label>
                    <Input
                      required
                      value={hallForm.name}
                      onChange={(e) =>
                        setHallForm({ ...hallForm, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>الوصف</Label>
                    <Input
                      value={hallForm.description}
                      onChange={(e) =>
                        setHallForm({
                          ...hallForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setHallDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button type="submit">حفظ</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة طاولة جديدة</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddTable}>
                <div className="space-y-4">
                  <div>
                    <Label>رقم الطاولة *</Label>
                    <Input
                      required
                      value={tableForm.tableNumber}
                      onChange={(e) =>
                        setTableForm({
                          ...tableForm,
                          tableNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>عدد الأشخاص *</Label>
                    <Input
                      type="number"
                      required
                      min="1"
                      value={tableForm.capacity}
                      onChange={(e) =>
                        setTableForm({
                          ...tableForm,
                          capacity: parseInt(e.target.value) || 4,
                        })
                      }
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTableDialogOpen(false)}
                  >
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

export default Restaurant;

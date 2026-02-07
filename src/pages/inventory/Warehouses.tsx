/**
 * Warehouses - صفحة إدارة المخازن
 * لإضافة وتعديل وإدارة المخازن المتعددة
 */
import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Landmark,
    Plus,
    Pencil,
    Trash2,
    MapPin,
    CheckCircle,
} from "lucide-react";
import { db, Warehouse } from "@/shared/lib/indexedDB";
import { toast } from "sonner";

export default function Warehouses() {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        nameAr: "",
        location: "",
        isDefault: false,
        isActive: true,
    });

    useEffect(() => {
        loadWarehouses();
    }, []);

    const loadWarehouses = async () => {
        const allWarehouses = await db.getAll<Warehouse>("warehouses");
        // Sort: default first, then by name
        const sorted = allWarehouses.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.nameAr.localeCompare(b.nameAr);
        });
        setWarehouses(sorted);
    };

    const openAddDialog = () => {
        setEditingWarehouse(null);
        setFormData({
            name: "",
            nameAr: "",
            location: "",
            isDefault: warehouses.length === 0, // First warehouse is default
            isActive: true,
        });
        setIsDialogOpen(true);
    };

    const openEditDialog = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse);
        setFormData({
            name: warehouse.name,
            nameAr: warehouse.nameAr,
            location: warehouse.location || "",
            isDefault: warehouse.isDefault,
            isActive: warehouse.isActive,
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.nameAr.trim()) {
            toast.error("يرجى إدخال اسم المخزن");
            return;
        }

        setIsLoading(true);

        try {
            // If setting as default, remove default from others
            if (formData.isDefault) {
                const currentDefault = warehouses.find((w) => w.isDefault);
                if (currentDefault && currentDefault.id !== editingWarehouse?.id) {
                    await db.update("warehouses", {
                        ...currentDefault,
                        isDefault: false,
                    });
                }
            }

            if (editingWarehouse) {
                // Update existing
                const updated: Warehouse = {
                    ...editingWarehouse,
                    name: formData.name || formData.nameAr,
                    nameAr: formData.nameAr,
                    location: formData.location || undefined,
                    isDefault: formData.isDefault,
                    isActive: formData.isActive,
                };
                await db.update("warehouses", updated);
                toast.success("تم تحديث المخزن بنجاح");
            } else {
                // Add new
                const newWarehouse: Warehouse = {
                    id: `warehouse_${Date.now()}`,
                    name: formData.name || formData.nameAr,
                    nameAr: formData.nameAr,
                    location: formData.location || undefined,
                    isDefault: formData.isDefault,
                    isActive: formData.isActive,
                    createdAt: new Date().toISOString(),
                };
                await db.add("warehouses", newWarehouse);
                toast.success("تم إضافة المخزن بنجاح");
            }

            setIsDialogOpen(false);
            loadWarehouses();
        } catch (error) {
            console.error("Error saving warehouse:", error);
            toast.error("حدث خطأ أثناء حفظ المخزن");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (warehouse: Warehouse) => {
        if (warehouse.isDefault) {
            toast.error("لا يمكن حذف المخزن الافتراضي");
            return;
        }

        if (!confirm(`هل أنت متأكد من حذف المخزن "${warehouse.nameAr}"؟`)) {
            return;
        }

        try {
            await db.delete("warehouses", warehouse.id);
            toast.success("تم حذف المخزن بنجاح");
            loadWarehouses();
        } catch (error) {
            console.error("Error deleting warehouse:", error);
            toast.error("حدث خطأ أثناء حذف المخزن");
        }
    };

    const handleSetDefault = async (warehouse: Warehouse) => {
        if (warehouse.isDefault) return;

        try {
            // Remove default from current
            const currentDefault = warehouses.find((w) => w.isDefault);
            if (currentDefault) {
                await db.update("warehouses", {
                    ...currentDefault,
                    isDefault: false,
                });
            }

            // Set new default
            await db.update("warehouses", {
                ...warehouse,
                isDefault: true,
            });

            toast.success(`تم تعيين "${warehouse.nameAr}" كمخزن افتراضي`);
            loadWarehouses();
        } catch (error) {
            console.error("Error setting default:", error);
            toast.error("حدث خطأ");
        }
    };

    const handleToggleActive = async (warehouse: Warehouse) => {
        if (warehouse.isDefault && warehouse.isActive) {
            toast.error("لا يمكن تعطيل المخزن الافتراضي");
            return;
        }

        try {
            await db.update("warehouses", {
                ...warehouse,
                isActive: !warehouse.isActive,
            });
            toast.success(
                warehouse.isActive ? "تم تعطيل المخزن" : "تم تفعيل المخزن"
            );
            loadWarehouses();
        } catch (error) {
            console.error("Error toggling active:", error);
            toast.error("حدث خطأ");
        }
    };

    // Stats
    const activeCount = warehouses.filter((w) => w.isActive).length;
    const totalCount = warehouses.length;

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Landmark className="h-8 w-8 text-primary" />
                        إدارة المخازن
                    </h1>
                    <Button onClick={openAddDialog}>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة مخزن
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">إجمالي المخازن</p>
                                <p className="text-2xl font-bold">{totalCount}</p>
                            </div>
                            <Landmark className="h-8 w-8 text-primary" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">المخازن النشطة</p>
                                <p className="text-2xl font-bold text-green-600">{activeCount}</p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                    </Card>
                </div>

                {/* Warehouses Table */}
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>اسم المخزن</TableHead>
                                <TableHead>الموقع</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead>افتراضي</TableHead>
                                <TableHead>إجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {warehouses.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center text-muted-foreground py-8"
                                    >
                                        لا توجد مخازن. أضف مخزنك الأول!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                warehouses.map((warehouse) => (
                                    <TableRow key={warehouse.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <Landmark className="h-4 w-4 text-muted-foreground" />
                                                {warehouse.nameAr}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {warehouse.location ? (
                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    {warehouse.location}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={warehouse.isActive}
                                                onCheckedChange={() => handleToggleActive(warehouse)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {warehouse.isDefault ? (
                                                <Badge className="bg-green-500">افتراضي</Badge>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleSetDefault(warehouse)}
                                                >
                                                    تعيين كافتراضي
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEditDialog(warehouse)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                {!warehouse.isDefault && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleDelete(warehouse)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Landmark className="h-5 w-5" />
                            {editingWarehouse ? "تعديل المخزن" : "إضافة مخزن جديد"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>اسم المخزن (عربي) *</Label>
                            <Input
                                value={formData.nameAr}
                                onChange={(e) =>
                                    setFormData({ ...formData, nameAr: e.target.value })
                                }
                                placeholder="مثال: المخزن الرئيسي"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>اسم المخزن (إنجليزي)</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder="Main Warehouse"
                                dir="ltr"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>الموقع (اختياري)</Label>
                            <Input
                                value={formData.location}
                                onChange={(e) =>
                                    setFormData({ ...formData, location: e.target.value })
                                }
                                placeholder="مثال: المنطقة الصناعية"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>مخزن نشط</Label>
                            <Switch
                                checked={formData.isActive}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, isActive: checked })
                                }
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>مخزن افتراضي</Label>
                            <Switch
                                checked={formData.isDefault}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, isDefault: checked })
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                        >
                            إلغاء
                        </Button>
                        <Button onClick={handleSubmit} disabled={isLoading}>
                            {isLoading
                                ? "جاري الحفظ..."
                                : editingWarehouse
                                    ? "تحديث"
                                    : "إضافة"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

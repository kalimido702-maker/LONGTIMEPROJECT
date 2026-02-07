import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Plus, Edit, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, Role } from "@/shared/lib/indexedDB";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RolesPermissions = () => {
  const { can } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    nameEn: "",
    description: "",
    color: "bg-gray-500",
    permissions: {} as Record<string, string[]>,
  });

  // تعريف الصلاحيات الثابتة (Permissions)
  const availablePermissions = {
    invoices: {
      name: "الفواتير",
      actions: {
        view: "عرض الفواتير",
        create: "إنشاء فاتورة",
        edit: "تعديل فاتورة",
        delete: "حذف فاتورة",
        refund: "إرجاع فاتورة",
      },
    },
    products: {
      name: "المنتجات",
      actions: {
        view: "عرض المنتجات",
        create: "إضافة منتج",
        edit: "تعديل منتج",
        delete: "حذف منتج",
        adjustStock: "تعديل المخزون",
      },
    },
    customers: {
      name: "العملاء",
      actions: {
        view: "عرض العملاء",
        create: "إضافة عميل",
        edit: "تعديل عميل",
        delete: "حذف عميل",
      },
    },
    suppliers: {
      name: "الموردين",
      actions: {
        view: "عرض الموردين",
        create: "إضافة مورد",
        edit: "تعديل مورد",
        delete: "حذف مورد",
      },
    },
    purchases: {
      name: "المشتريات",
      actions: {
        view: "عرض المشتريات",
        create: "إنشاء فاتورة شراء",
        edit: "تعديل فاتورة",
        delete: "حذف فاتورة",
      },
    },
    employees: {
      name: "الموظفين",
      actions: {
        view: "عرض الموظفين",
        create: "إضافة موظف",
        edit: "تعديل موظف",
        delete: "حذف موظف",
      },
    },
    reports: {
      name: "التقارير",
      actions: {
        view: "عرض التقارير",
        export: "تصدير التقارير",
      },
    },
    settings: {
      name: "الإعدادات",
      actions: {
        view: "عرض الإعدادات",
        edit: "تعديل الإعدادات",
      },
    },
    shifts: {
      name: "الورديات",
      actions: {
        view: "عرض الورديات",
        create: "فتح وردية",
        close: "إغلاق وردية",
      },
    },
    credit: {
      name: "المبيعات الآجلة",
      actions: {
        view: "عرض الآجل",
        edit: "تسديد دفعات",
      },
    },
    installments: {
      name: "التقسيط",
      actions: {
        view: "عرض الأقساط",
        edit: "تسديد قسط",
      },
    },
    promotions: {
      name: "العروض",
      actions: {
        view: "عرض العروض",
        create: "إضافة عرض",
        edit: "تعديل عرض",
        delete: "حذف عرض",
      },
    },
    restaurant: {
      name: "المطعم",
      actions: {
        view: "عرض الصالات",
        create: "إدارة الطاولات",
      },
    },
    returns: {
      name: "المرتجعات",
      actions: {
        view: "عرض المرتجعات",
        create: "إنشاء مرتجع",
      },
    },
    depositSources: {
      name: "مصادر الإيداعات",
      actions: {
        view: "عرض المصادر",
        create: "إضافة مصدر",
        update: "تعديل مصدر",
      },
    },
    deposits: {
      name: "الإيداعات",
      actions: {
        view: "عرض الإيداعات",
        create: "إضافة إيداع",
      },
    },
    expenseCategories: {
      name: "فئات المصروفات",
      actions: {
        view: "عرض الفئات",
        create: "إضافة فئة",
        update: "تعديل فئة",
      },
    },
    expenses: {
      name: "المصروفات",
      actions: {
        view: "عرض المصروفات",
        create: "إضافة مصروف",
      },
    },
    employeeAdvances: {
      name: "سُلف الموظفين",
      actions: {
        view: "عرض السُلف",
        create: "إضافة سُلفة",
        approve: "اعتماد/رفض سُلفة",
      },
    },
  };

  const colorOptions = [
    { value: "bg-red-500", label: "أحمر" },
    { value: "bg-blue-500", label: "أزرق" },
    { value: "bg-green-500", label: "أخضر" },
    { value: "bg-purple-500", label: "بنفسجي" },
    { value: "bg-orange-500", label: "برتقالي" },
    { value: "bg-pink-500", label: "وردي" },
    { value: "bg-yellow-500", label: "أصفر" },
    { value: "bg-gray-500", label: "رمادي" },
  ];

  useEffect(() => {
    initializeAndLoadRoles();
  }, []);

  const initializeAndLoadRoles = async () => {
    await db.initializeDefaultRoles();
    await db.migrateRolesPermissions(); // تحديث الصلاحيات للأدوار الموجودة
    await loadRoles();
  };

  const loadRoles = async () => {
    const data = await db.getAll<Role>("roles");
    setRoles(data);
    if (data.length > 0 && !selectedRole) {
      setSelectedRole(data[0]);
    }
  };

  const handleAddRole = () => {
    setIsEditing(false);
    setFormData({
      name: "",
      nameEn: "",
      description: "",
      color: "bg-gray-500",
      permissions: {},
    });
    setDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    if (role.isDefault) {
      toast.error("لا يمكن تعديل الأدوار الافتراضية");
      return;
    }
    setIsEditing(true);
    setFormData({
      name: role.name,
      nameEn: role.nameEn,
      description: role.description,
      color: role.color,
      permissions: role.permissions,
    });
    setSelectedRole(role);
    setDialogOpen(true);
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.isDefault) {
      toast.error("لا يمكن حذف الأدوار الافتراضية");
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف الدور "${role.name}"؟`)) return;

    try {
      await db.delete("roles", role.id);
      toast.success("تم حذف الدور بنجاح");
      loadRoles();
      if (selectedRole?.id === role.id) {
        const newRoles = roles.filter((r) => r.id !== role.id);
        setSelectedRole(newRoles[0] || null);
      }
    } catch (error) {
      toast.error("حدث خطأ أثناء حذف الدور");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.nameEn) {
      toast.error("الرجاء إدخال اسم الدور");
      return;
    }

    try {
      const role: Role = {
        id: isEditing ? selectedRole!.id : Date.now().toString(),
        name: formData.name,
        nameEn: formData.nameEn.toLowerCase(),
        description: formData.description,
        color: formData.color,
        permissions: formData.permissions,
        isDefault: false,
        createdAt: isEditing
          ? selectedRole!.createdAt
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (isEditing) {
        await db.update("roles", role);
        toast.success("تم تحديث الدور بنجاح");
      } else {
        await db.add("roles", role);
        toast.success("تم إضافة الدور بنجاح");
      }

      loadRoles();
      setDialogOpen(false);
    } catch (error) {
      toast.error("حدث خطأ أثناء حفظ الدور");
    }
  };

  const togglePermission = (resource: string, action: string) => {
    setFormData((prev) => {
      const resourcePerms = prev.permissions[resource] || [];
      const hasPermission = resourcePerms.includes(action);

      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [resource]: hasPermission
            ? resourcePerms.filter((a) => a !== action)
            : [...resourcePerms, action],
        },
      };
    });
  };

  if (!can("settings", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p className="text-muted-foreground">
              ليس لديك صلاحية عرض الأدوار والصلاحيات
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">إدارة الأدوار والصلاحيات</h1>
          </div>
          <div className="flex gap-2">
            {can("settings", "edit") && (
              <Button onClick={handleAddRole} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة دور جديد
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* قائمة الأدوار */}
          <div className="lg:col-span-1">
            <Card className="p-4">
              <h3 className="font-bold mb-4">الأدوار المتاحة</h3>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedRole?.id === role.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3 h-3 rounded-full ${role.color}`} />
                      <span className="font-semibold">{role.name}</span>
                      {role.isDefault && (
                        <AlertTriangle className="h-3 w-3 ml-auto" />
                      )}
                    </div>
                    <p className="text-xs opacity-80">{role.nameEn}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* تفاصيل الدور المحدد */}
          <div className="lg:col-span-3">
            {selectedRole ? (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-lg ${selectedRole.color}`}>
                      <Shield className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">
                        {selectedRole.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedRole.nameEn}
                      </p>
                      <p className="text-sm mt-1">{selectedRole.description}</p>
                    </div>
                  </div>
                  {can("settings", "edit") && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditRole(selectedRole)}
                        disabled={selectedRole.isDefault}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteRole(selectedRole)}
                        disabled={selectedRole.isDefault}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-bold text-lg mb-4">الصلاحيات المتاحة:</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المورد</TableHead>
                        <TableHead className="text-right">الصلاحيات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(availablePermissions).map(
                        ([resource, resourceData]) => {
                          const rolePerms =
                            selectedRole.permissions[resource] || [];
                          const hasAnyPermission = rolePerms.length > 0;

                          return (
                            <TableRow key={resource}>
                              <TableCell className="font-semibold">
                                {resourceData.name}
                              </TableCell>
                              <TableCell>
                                {hasAnyPermission ? (
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(resourceData.actions).map(
                                      ([action, label]) => {
                                        const hasPermission =
                                          rolePerms.includes(action);
                                        return hasPermission ? (
                                          <span
                                            key={action}
                                            className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                                          >
                                            ✓ {label}
                                          </span>
                                        ) : null;
                                      }
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground italic text-sm">
                                    لا توجد صلاحيات
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  اختر دورًا لعرض التفاصيل
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* Dialog إضافة/تعديل دور */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            className="max-w-4xl max-h-[90vh] overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "تعديل دور" : "إضافة دور جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>اسم الدور (بالعربية) *</Label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="مثال: مشرف مبيعات"
                    />
                  </div>
                  <div>
                    <Label>اسم الدور (بالإنجليزية) *</Label>
                    <Input
                      required
                      value={formData.nameEn}
                      onChange={(e) =>
                        setFormData({ ...formData, nameEn: e.target.value })
                      }
                      placeholder="Example: sales_supervisor"
                    />
                  </div>
                </div>

                <div>
                  <Label>الوصف</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="وصف مختصر لصلاحيات هذا الدور"
                  />
                </div>

                <div>
                  <Label>اللون</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, color: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {colorOptions.map((color) => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded ${color.value}`} />
                            {color.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-lg font-bold mb-4 block">
                    تحديد الصلاحيات
                  </Label>
                  <div className="space-y-4">
                    {Object.entries(availablePermissions).map(
                      ([resource, resourceData]) => (
                        <Card key={resource} className="p-4">
                          <h4 className="font-semibold mb-3">
                            {resourceData.name}
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Object.entries(resourceData.actions).map(
                              ([action, label]) => {
                                const isChecked =
                                  formData.permissions[resource]?.includes(
                                    action
                                  ) || false;
                                return (
                                  <div
                                    key={action}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      onCheckedChange={() =>
                                        togglePermission(resource, action)
                                      }
                                    />
                                    <span className="text-sm">{label}</span>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </Card>
                      )
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button type="submit">{isEditing ? "تحديث" : "إضافة"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="p-6 mt-6 bg-muted/50">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            ملاحظات هامة:
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              • <strong>الأدوار الافتراضية</strong> (admin, manager, cashier,
              accountant) لا يمكن تعديلها أو حذفها
            </li>
            <li>• يمكنك إنشاء أدوار مخصصة حسب احتياجات عملك</li>
            <li>
              • يتم تعيين الدور الوظيفي لكل موظف من خلال صفحة إدارة الموظفين
            </li>
            <li>
              • <strong>الصلاحيات (Permissions) ثابتة</strong> ومرتبطة بموارد
              النظام
            </li>
            <li>• عند إضافة دور جديد، يجب تحديد الصلاحيات المطلوبة لكل مورد</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default RolesPermissions;

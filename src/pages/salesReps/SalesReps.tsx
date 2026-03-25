import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Plus,
    Edit,
    Trash2,
    Search,
    UserCheck,
    Phone,
    Mail,
    Percent,
    RefreshCw,
    Loader2,
    MessageCircle,
    Eye,
} from "lucide-react";
import { db } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { whatsappService } from "@/services/whatsapp/whatsappService";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";
import { SalesRepActivityDialog } from "@/components/dialogs/SalesRepActivityDialog";

interface Supervisor {
    id: string;
    name: string;
    phone: string;
    email?: string;
    isActive: boolean;
    createdAt: string;
    notes?: string;
}

interface SalesRep {
    id: string;
    name: string;
    phone: string;
    supervisorId: string;
    email?: string;
    isActive: boolean;
    commissionRate?: number;
    whatsappGroupId?: string;
    createdAt: string;
    notes?: string;
}

const SalesReps = () => {
    const { toast } = useToast();
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        supervisorId: "",
        commissionRate: "",
        whatsappGroupId: "",
        notes: "",
        isActive: true,
    });

    // WhatsApp Groups State
    const [whatsappGroups, setWhatsappGroups] = useState<{ id: string; name: string }[]>([]);
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);

    // Activity Dialog State
    const [activityDialogOpen, setActivityDialogOpen] = useState(false);
    const [selectedRepForActivity, setSelectedRepForActivity] = useState<SalesRep | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [reps, sups] = await Promise.all([
                db.getAll<SalesRep>("salesReps"),
                db.getAll<Supervisor>("supervisors"),
            ]);
            setSalesReps(reps);
            setSupervisors(sups);
        } catch (error) {
            console.error("Error loading data:", error);
            toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
        }
    };

    const getSupervisorName = (id: string) => {
        return supervisors.find((s) => s.id === id)?.name || "-";
    };

    const filteredSalesReps = salesReps.filter(
        (r) =>
            r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.phone.includes(searchQuery)
    );

    const pagination = usePagination(filteredSalesReps, { resetDeps: [searchQuery] });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name || !formData.phone || !formData.supervisorId) {
            toast({
                title: "يرجى إدخال الاسم ورقم الهاتف واختيار المشرف",
                variant: "destructive",
            });
            return;
        }

        try {
            const salesRep: SalesRep = {
                id: editingId || Date.now().toString(),
                name: formData.name,
                phone: formData.phone,
                supervisorId: formData.supervisorId,
                email: formData.email || undefined,
                commissionRate: formData.commissionRate
                    ? parseFloat(formData.commissionRate)
                    : undefined,
                whatsappGroupId: formData.whatsappGroupId || undefined,
                notes: formData.notes || undefined,
                isActive: formData.isActive,
                createdAt: editingId
                    ? salesReps.find((r) => r.id === editingId)?.createdAt ||
                    new Date().toISOString()
                    : new Date().toISOString(),
            };

            if (editingId) {
                await db.update("salesReps", salesRep);
                toast({ title: "تم تحديث المندوب" });
            } else {
                await db.add("salesReps", salesRep);
                toast({ title: "تم إضافة المندوب" });
            }

            resetForm();
            loadData();
        } catch (error) {
            console.error("Error saving sales rep:", error);
            toast({ title: "خطأ في الحفظ", variant: "destructive" });
        }
    };

    const handleEdit = (rep: SalesRep) => {
        setEditingId(rep.id);
        setFormData({
            name: rep.name,
            phone: rep.phone,
            email: rep.email || "",
            supervisorId: rep.supervisorId,
            commissionRate: rep.commissionRate?.toString() || "",
            whatsappGroupId: rep.whatsappGroupId || "",
            notes: rep.notes || "",
            isActive: rep.isActive,
        });
        setDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await db.delete("salesReps", id);
            toast({ title: "تم حذف المندوب" });
            loadData();
        } catch (error) {
            toast({ title: "خطأ في الحذف", variant: "destructive" });
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            name: "",
            phone: "",
            email: "",
            supervisorId: "",
            commissionRate: "",
            whatsappGroupId: "",
            notes: "",
            isActive: true,
        });
        setWhatsappGroups([]);
        setDialogOpen(false);
    };

    const handleFetchWhatsAppGroups = async () => {
        setIsFetchingGroups(true);
        try {
            const accounts = await db.getAll<any>("whatsappAccounts");
            const activeAccount = accounts.find((a) => a.isActive && a.status === "connected");

            if (!activeAccount) {
                toast({ title: "يرجى التأكد من وجود حساب واتساب متصل", variant: "destructive" });
                return;
            }

            const groups = await whatsappService.getGroups(activeAccount.id);
            if (groups.length === 0) {
                toast({ title: "لم يتم العثور على مجموعات" });
            } else {
                setWhatsappGroups(groups);
                toast({ title: `تم جلب ${groups.length} مجموعة` });
            }
        } catch (error) {
            console.error("Error fetching groups:", error);
            toast({ title: "فشل جلب المجموعات", variant: "destructive" });
        } finally {
            setIsFetchingGroups(false);
        }
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">إدارة المندوبين</h1>
                        <p className="text-muted-foreground">
                            إضافة وتعديل مندوبي المبيعات وربطهم بالمشرفين
                        </p>
                    </div>
                    <Button onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة مندوب
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                                إجمالي المندوبين
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{salesReps.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                                المندوبين النشطين
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {salesReps.filter((r) => r.isActive).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                                المندوبين غير النشطين
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">
                                {salesReps.filter((r) => !r.isActive).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                                عدد المشرفين
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">
                                {supervisors.filter((s) => s.isActive).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="بحث بالاسم أو رقم الهاتف..."
                        className="pr-10"
                    />
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>الاسم</TableHead>
                                    <TableHead>رقم الهاتف</TableHead>
                                    <TableHead>المشرف</TableHead>
                                    <TableHead>نسبة العمولة</TableHead>
                                    <TableHead>الحالة</TableHead>
                                    <TableHead className="text-left">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSalesReps.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            لا يوجد مندوبين
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pagination.paginatedItems.map((rep) => (
                                        <TableRow key={rep.id}>
                                            <TableCell className="font-medium">
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                                                    onClick={() => {
                                                        setSelectedRepForActivity(rep);
                                                        setActivityDialogOpen(true);
                                                    }}
                                                >
                                                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                                                    {rep.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                                    {rep.phone}
                                                </div>
                                            </TableCell>
                                            <TableCell>{getSupervisorName(rep.supervisorId)}</TableCell>
                                            <TableCell>
                                                {rep.commissionRate ? (
                                                    <div className="flex items-center gap-1">
                                                        <Percent className="h-3 w-3 text-muted-foreground" />
                                                        {rep.commissionRate}%
                                                    </div>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={rep.isActive ? "default" : "secondary"}>
                                                    {rep.isActive ? "نشط" : "غير نشط"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setSelectedRepForActivity(rep);
                                                            setActivityDialogOpen(true);
                                                        }}
                                                        title="سجل المندوب"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleEdit(rep)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleDelete(rep.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <DataPagination {...pagination} entityName="مندوب" />

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent dir="rtl" className="max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingId ? "تعديل المندوب" : "إضافة مندوب جديد"}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>الاسم *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder="اسم المندوب"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>رقم الهاتف *</Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                placeholder="رقم الهاتف"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>المشرف *</Label>
                            <Select
                                value={formData.supervisorId}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, supervisorId: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="اختر المشرف" />
                                </SelectTrigger>
                                <SelectContent>
                                    {supervisors
                                        .filter((s) => s.isActive)
                                        .map((sup) => (
                                            <SelectItem key={sup.id} value={sup.id}>
                                                {sup.name}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>البريد الإلكتروني</Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                placeholder="البريد الإلكتروني (اختياري)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>نسبة العمولة (%)</Label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={formData.commissionRate}
                                onChange={(e) =>
                                    setFormData({ ...formData, commissionRate: e.target.value })
                                }
                                placeholder="نسبة العمولة (اختياري)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>ملاحظات</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) =>
                                    setFormData({ ...formData, notes: e.target.value })
                                }
                                placeholder="ملاحظات (اختياري)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MessageCircle className="h-4 w-4 text-green-600" />
                                جروب الواتساب
                            </Label>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    {whatsappGroups.length > 0 ? (
                                        <Select
                                            value={formData.whatsappGroupId || "none"}
                                            onValueChange={(value) =>
                                                setFormData({ ...formData, whatsappGroupId: value === "none" ? "" : value })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="اختر جروب" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">بدون جروب</SelectItem>
                                                {whatsappGroups.map((group) => (
                                                    <SelectItem key={group.id} value={group.id}>
                                                        {group.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            value={formData.whatsappGroupId}
                                            onChange={(e) =>
                                                setFormData({ ...formData, whatsappGroupId: e.target.value })
                                            }
                                            placeholder="معرف الجروب (اختياري)"
                                            className="font-mono text-sm"
                                        />
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleFetchWhatsAppGroups}
                                    disabled={isFetchingGroups}
                                    className="gap-1 shrink-0"
                                >
                                    {isFetchingGroups ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                    جلب
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                اضغط "جلب" لتحميل المجموعات من الواتساب
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>نشط</Label>
                            <Switch
                                checked={formData.isActive}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, isActive: checked })
                                }
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetForm}>
                                إلغاء
                            </Button>
                            <Button type="submit">{editingId ? "تحديث" : "إضافة"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Activity Dialog */}
            <SalesRepActivityDialog
                open={activityDialogOpen}
                onOpenChange={setActivityDialogOpen}
                salesRep={selectedRepForActivity}
            />
        </div>
    );
};

export default SalesReps;

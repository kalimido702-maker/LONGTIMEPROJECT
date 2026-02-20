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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Plus,
    Edit,
    Trash2,
    Search,
    Users,
    Phone,
    Mail,
} from "lucide-react";
import { db } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

interface Supervisor {
    id: string;
    name: string;
    phone: string;
    email?: string;
    isActive: boolean;
    createdAt: string;
    notes?: string;
}

const Supervisors = () => {
    const { toast } = useToast();
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        notes: "",
        isActive: true,
    });

    useEffect(() => {
        loadSupervisors();
    }, []);

    const loadSupervisors = async () => {
        try {
            const data = await db.getAll<Supervisor>("supervisors");
            setSupervisors(data);
        } catch (error) {
            console.error("Error loading supervisors:", error);
            toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
        }
    };

    const filteredSupervisors = supervisors.filter(
        (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.phone.includes(searchQuery)
    );

    const pagination = usePagination(filteredSupervisors, { resetDeps: [searchQuery] });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name || !formData.phone) {
            toast({ title: "يرجى إدخال الاسم ورقم الهاتف", variant: "destructive" });
            return;
        }

        try {
            const supervisor: Supervisor = {
                id: editingId || Date.now().toString(),
                name: formData.name,
                phone: formData.phone,
                email: formData.email || undefined,
                notes: formData.notes || undefined,
                isActive: formData.isActive,
                createdAt: editingId
                    ? supervisors.find((s) => s.id === editingId)?.createdAt || new Date().toISOString()
                    : new Date().toISOString(),
            };

            if (editingId) {
                await db.update("supervisors", supervisor);
                toast({ title: "تم تحديث المشرف" });
            } else {
                await db.add("supervisors", supervisor);
                toast({ title: "تم إضافة المشرف" });
            }

            resetForm();
            loadSupervisors();
        } catch (error) {
            console.error("Error saving supervisor:", error);
            toast({ title: "خطأ في الحفظ", variant: "destructive" });
        }
    };

    const handleEdit = (supervisor: Supervisor) => {
        setEditingId(supervisor.id);
        setFormData({
            name: supervisor.name,
            phone: supervisor.phone,
            email: supervisor.email || "",
            notes: supervisor.notes || "",
            isActive: supervisor.isActive,
        });
        setDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await db.delete("supervisors", id);
            toast({ title: "تم حذف المشرف" });
            loadSupervisors();
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
            notes: "",
            isActive: true,
        });
        setDialogOpen(false);
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">إدارة المشرفين</h1>
                        <p className="text-muted-foreground">
                            إضافة وتعديل المشرفين المسؤولين عن المندوبين
                        </p>
                    </div>
                    <Button onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة مشرف
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي المشرفين</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{supervisors.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">المشرفين النشطين</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {supervisors.filter((s) => s.isActive).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">المشرفين غير النشطين</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">
                                {supervisors.filter((s) => !s.isActive).length}
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
                                    <TableHead>البريد الإلكتروني</TableHead>
                                    <TableHead>الحالة</TableHead>
                                    <TableHead>تاريخ الإضافة</TableHead>
                                    <TableHead className="text-left">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSupervisors.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            لا يوجد مشرفين
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pagination.paginatedItems.map((supervisor) => (
                                        <TableRow key={supervisor.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    {supervisor.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                                    {supervisor.phone}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {supervisor.email ? (
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                                        {supervisor.email}
                                                    </div>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={supervisor.isActive ? "default" : "secondary"}>
                                                    {supervisor.isActive ? "نشط" : "غير نشط"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(supervisor.createdAt).toLocaleDateString("ar-EG")}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleEdit(supervisor)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleDelete(supervisor.id)}
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

            <DataPagination {...pagination} entityName="مشرف" />

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent dir="rtl" className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingId ? "تعديل المشرف" : "إضافة مشرف جديد"}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>الاسم *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="اسم المشرف"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>رقم الهاتف *</Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="رقم الهاتف"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>البريد الإلكتروني</Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="البريد الإلكتروني (اختياري)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>ملاحظات</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="ملاحظات (اختياري)"
                            />
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
                            <Button type="submit">
                                {editingId ? "تحديث" : "إضافة"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Supervisors;

/**
 * WhatsAppGroups - إدارة مجموعات WhatsApp والإرسال الدوري
 */
import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Users,
    Plus,
    Edit,
    Trash2,
    Clock,
    Send,
    MessageCircle,
    Calendar,
    RefreshCw,
    Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppGroup, ScheduledStatement } from "@/domain/entities/WhatsApp";
import { whatsappService } from "@/services/whatsapp/whatsappService";
import { db } from "@/shared/lib/indexedDB";

const WhatsAppGroups = () => {
    // Groups State
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<WhatsAppGroup | null>(null);
    const [groupForm, setGroupForm] = useState({
        name: "",
        groupJid: "",
        description: "",
        isActive: true,
    });

    // Fetched Groups State
    const [fetchedGroups, setFetchedGroups] = useState<{ id: string; name: string }[]>([]);
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);

    // Scheduled Statements State
    const [statements, setStatements] = useState<ScheduledStatement[]>([]);
    const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
    const [editingStatement, setEditingStatement] = useState<ScheduledStatement | null>(null);
    const [statementForm, setStatementForm] = useState({
        name: "",
        scheduleType: "weekly" as "daily" | "weekly" | "monthly",
        scheduleDay: 0,
        scheduleTime: "09:00",
        template: "السلام عليكم {customer_name}\nكشف حسابكم المرفق للفترة من {date_from} إلى {date_to}\nالرصيد الحالي: {balance}",
        isActive: true,
    });

    // Load data on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        try {
            // Load groups
            const savedGroups = localStorage.getItem("whatsappGroups");
            if (savedGroups) {
                setGroups(JSON.parse(savedGroups));
            }

            // Load scheduled statements
            const savedStatements = localStorage.getItem("scheduledStatements");
            if (savedStatements) {
                setStatements(JSON.parse(savedStatements));
            }
        } catch (error) {
            console.error("Error loading data:", error);
        }
    };

    // Group CRUD
    const handleSaveGroup = () => {
        if (!groupForm.name.trim()) {
            toast.error("يرجى إدخال اسم المجموعة");
            return;
        }
        if (!groupForm.groupJid.trim()) {
            toast.error("يرجى إدخال معرف المجموعة (Group JID)");
            return;
        }

        const now = new Date().toISOString();
        let updatedGroups: WhatsAppGroup[];

        if (editingGroup) {
            updatedGroups = groups.map((g) =>
                g.id === editingGroup.id
                    ? { ...editingGroup, ...groupForm, updatedAt: now }
                    : g
            );
            toast.success("تم تحديث المجموعة");
        } else {
            const newGroup: WhatsAppGroup = {
                id: `group_${Date.now()}`,
                accountId: "default",
                createdAt: now,
                ...groupForm,
            };
            updatedGroups = [...groups, newGroup];
            toast.success("تم إضافة المجموعة");
        }

        setGroups(updatedGroups);
        localStorage.setItem("whatsappGroups", JSON.stringify(updatedGroups));
        resetGroupForm();
    };

    const handleDeleteGroup = (id: string) => {
        const updatedGroups = groups.filter((g) => g.id !== id);
        setGroups(updatedGroups);
        localStorage.setItem("whatsappGroups", JSON.stringify(updatedGroups));
        toast.success("تم حذف المجموعة");
    };

    const handleEditGroup = (group: WhatsAppGroup) => {
        setEditingGroup(group);
        setGroupForm({
            name: group.name,
            groupJid: group.groupJid,
            description: group.description || "",
            isActive: group.isActive,
        });
        setIsGroupDialogOpen(true);
    };

    const resetGroupForm = () => {
        setGroupForm({ name: "", groupJid: "", description: "", isActive: true });
        setEditingGroup(null);
        setIsGroupDialogOpen(false);
        setFetchedGroups([]);
    };

    const handleFetchGroups = async () => {
        setIsFetchingGroups(true);
        try {
            // Get active account
            const accounts = await db.getAll<any>("whatsappAccounts");
            const activeAccount = accounts.find((a) => a.isActive && a.status === "connected");

            if (!activeAccount) {
                toast.error("يرجى التأكد من وجود حساب واتساب متصل ونشط");
                return;
            }

            const groups = await whatsappService.getGroups(activeAccount.id);

            if (groups.length === 0) {
                toast.info("لم يتم العثور على مجموعات أو الحساب غير متصل");
            } else {
                setFetchedGroups(groups);
                toast.success(`تم جلب ${groups.length} مجموعة`);
            }
        } catch (error) {
            console.error("Error fetching groups:", error);
            toast.error("فشل جلب المجموعات");
        } finally {
            setIsFetchingGroups(false);
        }
    };

    const handleSelectFetchedGroup = (groupJid: string) => {
        const group = fetchedGroups.find(g => g.id === groupJid);
        if (group) {
            setGroupForm(prev => ({
                ...prev,
                name: group.name || prev.name,
                groupJid: group.id
            }));
        }
    };

    // Statement CRUD
    const handleSaveStatement = () => {
        if (!statementForm.name.trim()) {
            toast.error("يرجى إدخال اسم الجدولة");
            return;
        }

        const now = new Date().toISOString();
        let updatedStatements: ScheduledStatement[];

        if (editingStatement) {
            updatedStatements = statements.map((s) =>
                s.id === editingStatement.id
                    ? { ...editingStatement, ...statementForm, updatedAt: now }
                    : s
            );
            toast.success("تم تحديث الجدولة");
        } else {
            const newStatement: ScheduledStatement = {
                id: `schedule_${Date.now()}`,
                accountId: "default",
                targetType: "customer",
                targetIds: [],
                createdAt: now,
                ...statementForm,
            };
            updatedStatements = [...statements, newStatement];
            toast.success("تم إضافة الجدولة");
        }

        setStatements(updatedStatements);
        localStorage.setItem("scheduledStatements", JSON.stringify(updatedStatements));
        resetStatementForm();
    };

    const handleDeleteStatement = (id: string) => {
        const updatedStatements = statements.filter((s) => s.id !== id);
        setStatements(updatedStatements);
        localStorage.setItem("scheduledStatements", JSON.stringify(updatedStatements));
        toast.success("تم حذف الجدولة");
    };

    const handleEditStatement = (statement: ScheduledStatement) => {
        setEditingStatement(statement);
        setStatementForm({
            name: statement.name,
            scheduleType: statement.scheduleType,
            scheduleDay: statement.scheduleDay || 0,
            scheduleTime: statement.scheduleTime,
            template: statement.template,
            isActive: statement.isActive,
        });
        setIsStatementDialogOpen(true);
    };

    const resetStatementForm = () => {
        setStatementForm({
            name: "",
            scheduleType: "weekly",
            scheduleDay: 0,
            scheduleTime: "09:00",
            template: "السلام عليكم {customer_name}\nكشف حسابكم المرفق للفترة من {date_from} إلى {date_to}\nالرصيد الحالي: {balance}",
            isActive: true,
        });
        setEditingStatement(null);
        setIsStatementDialogOpen(false);
    };

    const toggleGroupActive = (id: string) => {
        const updatedGroups = groups.map((g) =>
            g.id === id ? { ...g, isActive: !g.isActive } : g
        );
        setGroups(updatedGroups);
        localStorage.setItem("whatsappGroups", JSON.stringify(updatedGroups));
    };

    const toggleStatementActive = (id: string) => {
        const updatedStatements = statements.map((s) =>
            s.id === id ? { ...s, isActive: !s.isActive } : s
        );
        setStatements(updatedStatements);
        localStorage.setItem("scheduledStatements", JSON.stringify(updatedStatements));
    };

    const getScheduleTypeLabel = (type: string) => {
        switch (type) {
            case "daily": return "يومي";
            case "weekly": return "أسبوعي";
            case "monthly": return "شهري";
            default: return type;
        }
    };

    const getDayLabel = (day: number, type: string) => {
        if (type === "weekly") {
            const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
            return days[day] || "";
        }
        if (type === "monthly") {
            return `يوم ${day}`;
        }
        return "";
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />
            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <MessageCircle className="h-8 w-8 text-green-600" />
                    <h1 className="text-3xl font-bold">مجموعات WhatsApp والإرسال الدوري</h1>
                </div>

                <Tabs defaultValue="groups" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="groups" className="gap-2">
                            <Users className="h-4 w-4" />
                            المجموعات
                        </TabsTrigger>
                        <TabsTrigger value="scheduled" className="gap-2">
                            <Clock className="h-4 w-4" />
                            الإرسال الدوري
                        </TabsTrigger>
                    </TabsList>

                    {/* Groups Tab */}
                    <TabsContent value="groups">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5" />
                                    مجموعات WhatsApp
                                </CardTitle>
                                <Button
                                    onClick={() => setIsGroupDialogOpen(true)}
                                    className="gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    إضافة مجموعة
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {groups.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        لا توجد مجموعات مضافة
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>الاسم</TableHead>
                                                <TableHead>معرف المجموعة</TableHead>
                                                <TableHead>الوصف</TableHead>
                                                <TableHead>الحالة</TableHead>
                                                <TableHead>إجراءات</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groups.map((group) => (
                                                <TableRow key={group.id}>
                                                    <TableCell className="font-medium">{group.name}</TableCell>
                                                    <TableCell className="font-mono text-sm">{group.groupJid}</TableCell>
                                                    <TableCell>{group.description || "-"}</TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={group.isActive}
                                                            onCheckedChange={() => toggleGroupActive(group.id)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleEditGroup(group)}
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-red-600"
                                                                onClick={() => handleDeleteGroup(group.id)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
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
                    </TabsContent>

                    {/* Scheduled Statements Tab */}
                    <TabsContent value="scheduled">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="h-5 w-5" />
                                    جدولة الإرسال التلقائي
                                </CardTitle>
                                <Button
                                    onClick={() => setIsStatementDialogOpen(true)}
                                    className="gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    إضافة جدولة
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {statements.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        لا توجد جدولات مضافة
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {statements.map((statement) => (
                                            <Card key={statement.id} className="p-4">
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-lg">{statement.name}</span>
                                                            <Badge variant={statement.isActive ? "default" : "secondary"}>
                                                                {statement.isActive ? "نشط" : "متوقف"}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="h-4 w-4" />
                                                                {getScheduleTypeLabel(statement.scheduleType)}
                                                                {statement.scheduleDay !== undefined && statement.scheduleType !== "daily" && (
                                                                    <> - {getDayLabel(statement.scheduleDay, statement.scheduleType)}</>
                                                                )}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-4 w-4" />
                                                                {statement.scheduleTime}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground max-w-md line-clamp-2">
                                                            {statement.template}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Switch
                                                            checked={statement.isActive}
                                                            onCheckedChange={() => toggleStatementActive(statement.id)}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleEditStatement(statement)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-red-600"
                                                            onClick={() => handleDeleteStatement(statement.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Group Dialog */}
                <Dialog open={isGroupDialogOpen} onOpenChange={resetGroupForm}>
                    <DialogContent dir="rtl">
                        <DialogHeader>
                            <DialogTitle>
                                {editingGroup ? "تعديل مجموعة" : "إضافة مجموعة جديدة"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>اسم المجموعة</Label>
                                <Input
                                    value={groupForm.name}
                                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                                    placeholder="مثال: مجموعة المبيعات"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>معرف المجموعة (Group JID)</Label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        {fetchedGroups.length > 0 ? (
                                            <Select
                                                value={groupForm.groupJid}
                                                onValueChange={(value) => handleSelectFetchedGroup(value)}
                                            >
                                                <SelectTrigger className="w-full text-right" dir="rtl">
                                                    <SelectValue placeholder="اختر مجموعة..." />
                                                </SelectTrigger>
                                                <SelectContent dir="rtl">
                                                    {fetchedGroups.map((group) => (
                                                        <SelectItem key={group.id} value={group.id}>
                                                            <div className="flex items-center justify-between w-full gap-4">
                                                                <span>{group.name}</span>
                                                                <span className="text-xs text-muted-foreground font-mono">
                                                                    {group.id.split("@")[0]}
                                                                </span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                value={groupForm.groupJid}
                                                onChange={(e) => setGroupForm({ ...groupForm, groupJid: e.target.value })}
                                                placeholder="مثال: 123456789@g.us"
                                                className="font-mono text-sm"
                                            />
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleFetchGroups}
                                        disabled={isFetchingGroups}
                                        className="gap-2 shrink-0"
                                    >
                                        {isFetchingGroups ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-4 w-4" />
                                        )}
                                        جلب المجموعات
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {fetchedGroups.length > 0
                                        ? "تم جلب المجموعات من واتساب. اختر المجموعة لإكمال البيانات تلقائياً."
                                        : "اضغط على 'جلب المجموعات' لاختيار المجموعة من واتساب بدلاً من الإدخال اليدوي"
                                    }
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>الوصف (اختياري)</Label>
                                <Textarea
                                    value={groupForm.description}
                                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                                    placeholder="وصف المجموعة..."
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={groupForm.isActive}
                                    onCheckedChange={(checked) => setGroupForm({ ...groupForm, isActive: checked })}
                                />
                                <Label>نشطة</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={resetGroupForm}>
                                إلغاء
                            </Button>
                            <Button onClick={handleSaveGroup}>
                                {editingGroup ? "تحديث" : "إضافة"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Statement Dialog */}
                <Dialog open={isStatementDialogOpen} onOpenChange={resetStatementForm}>
                    <DialogContent dir="rtl" className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {editingStatement ? "تعديل الجدولة" : "إضافة جدولة جديدة"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>اسم الجدولة</Label>
                                <Input
                                    value={statementForm.name}
                                    onChange={(e) => setStatementForm({ ...statementForm, name: e.target.value })}
                                    placeholder="مثال: كشف حساب أسبوعي"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>التكرار</Label>
                                    <Select
                                        value={statementForm.scheduleType}
                                        onValueChange={(value: "daily" | "weekly" | "monthly") =>
                                            setStatementForm({ ...statementForm, scheduleType: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="daily">يومي</SelectItem>
                                            <SelectItem value="weekly">أسبوعي</SelectItem>
                                            <SelectItem value="monthly">شهري</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {statementForm.scheduleType === "weekly" && (
                                    <div className="space-y-2">
                                        <Label>اليوم</Label>
                                        <Select
                                            value={String(statementForm.scheduleDay)}
                                            onValueChange={(value) =>
                                                setStatementForm({ ...statementForm, scheduleDay: parseInt(value) })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">الأحد</SelectItem>
                                                <SelectItem value="1">الإثنين</SelectItem>
                                                <SelectItem value="2">الثلاثاء</SelectItem>
                                                <SelectItem value="3">الأربعاء</SelectItem>
                                                <SelectItem value="4">الخميس</SelectItem>
                                                <SelectItem value="5">الجمعة</SelectItem>
                                                <SelectItem value="6">السبت</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {statementForm.scheduleType === "monthly" && (
                                    <div className="space-y-2">
                                        <Label>يوم الشهر</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={statementForm.scheduleDay}
                                            onChange={(e) =>
                                                setStatementForm({ ...statementForm, scheduleDay: parseInt(e.target.value) })
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>الوقت</Label>
                                <Input
                                    type="time"
                                    value={statementForm.scheduleTime}
                                    onChange={(e) => setStatementForm({ ...statementForm, scheduleTime: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>قالب الرسالة</Label>
                                <Textarea
                                    value={statementForm.template}
                                    onChange={(e) => setStatementForm({ ...statementForm, template: e.target.value })}
                                    rows={4}
                                />
                                <p className="text-xs text-muted-foreground">
                                    المتغيرات المتاحة: {"{customer_name}"}, {"{balance}"}, {"{date_from}"}, {"{date_to}"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={statementForm.isActive}
                                    onCheckedChange={(checked) => setStatementForm({ ...statementForm, isActive: checked })}
                                />
                                <Label>نشطة</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={resetStatementForm}>
                                إلغاء
                            </Button>
                            <Button onClick={handleSaveStatement}>
                                {editingStatement ? "تحديث" : "إضافة"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default WhatsAppGroups;

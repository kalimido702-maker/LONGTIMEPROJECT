/**
 * BackupSettings - إعدادات النسخ الاحتياطي التلقائي
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Download,
    Upload,
    Clock,
    Database,
    Save,
    RefreshCw,
    CheckCircle,
    HardDrive,
    FolderOpen,
    Cloud,
    CloudOff,
    Plus,
    Trash2,
    TestTube,
    Mail,
    ToggleLeft,
    Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { backupService } from "@/services/backup/backupService";
import { db } from "@/shared/lib/indexedDB";
import {
    AlertTriangle,
    Bug,
} from "lucide-react";

const BackupSettings = () => {
    const [config, setConfig] = useState(backupService.getBackupConfig());
    const [history, setHistory] = useState(backupService.getBackupHistory());
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreProgress, setRestoreProgress] = useState<{ stage: string; detail: string; percent: number } | null>(null);

    // Google Drive state
    const [driveAccounts, setDriveAccounts] = useState<Array<{
        id: string;
        email: string;
        enabled: boolean;
        lastUploadAt?: string;
    }>>([]);
    const [isAddingDriveAccount, setIsAddingDriveAccount] = useState(false);
    const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
    const [isDriveAvailable, setIsDriveAvailable] = useState(false);

    // Debug mode - shows dangerous operations only (does NOT affect sync)
    const isDebugMode = import.meta.env.VITE_DEBUG_SYNC === 'true';

    useEffect(() => {
        // بدء خدمة النسخ التلقائي
        if (config.enabled) {
            backupService.startAutoBackup();
        }
        return () => {
            // لا نوقفها عند الخروج لأنها تعمل في الخلفية
        };
    }, [config.enabled]);

    // تحميل حسابات Google Drive
    useEffect(() => {
        const loadDriveAccounts = async () => {
            try {
                const api = (window as any).electronAPI?.drive;
                if (!api) return;
                setIsDriveAvailable(true);
                const result = await api.listAccounts();
                if (result.success) {
                    setDriveAccounts(result.accounts || []);
                }
            } catch {
                // Drive API not available (browser mode)
            }
        };
        loadDriveAccounts();
    }, []);

    // ==================== Google Drive Functions ====================
    const handleAddDriveAccount = async () => {
        setIsAddingDriveAccount(true);
        try {
            const api = (window as any).electronAPI?.drive;
            if (!api) {
                toast.error("غير متاح في المتصفح");
                return;
            }
            const result = await api.authenticate();
            if (result.success && result.account) {
                toast.success(`تم ربط حساب ${result.account.email}`);
                // Refresh accounts list
                const listResult = await api.listAccounts();
                if (listResult.success) {
                    setDriveAccounts(listResult.accounts || []);
                }
            } else {
                if (result.error && !result.error.includes("إلغاء")) {
                    toast.error(result.error || "فشل تسجيل الدخول");
                }
            }
        } catch (err: any) {
            toast.error("حدث خطأ أثناء تسجيل الدخول");
        } finally {
            setIsAddingDriveAccount(false);
        }
    };

    const handleToggleDriveAccount = async (accountId: string, enabled: boolean) => {
        try {
            const api = (window as any).electronAPI?.drive;
            if (!api) return;
            const result = await api.toggleAccount(accountId, enabled);
            if (result.success) {
                setDriveAccounts(prev =>
                    prev.map(a => a.id === accountId ? { ...a, enabled } : a)
                );
                toast.success(enabled ? "تم تفعيل الحساب" : "تم تعطيل الحساب");
            }
        } catch {
            toast.error("حدث خطأ");
        }
    };

    const handleRemoveDriveAccount = async (accountId: string, email: string) => {
        if (!confirm(`هل تريد إزالة حساب ${email}؟`)) return;
        try {
            const api = (window as any).electronAPI?.drive;
            if (!api) return;
            const result = await api.removeAccount(accountId);
            if (result.success) {
                setDriveAccounts(prev => prev.filter(a => a.id !== accountId));
                toast.success("تم إزالة الحساب");
            }
        } catch {
            toast.error("حدث خطأ");
        }
    };

    const handleTestDriveConnection = async (accountId: string) => {
        setTestingAccountId(accountId);
        try {
            const api = (window as any).electronAPI?.drive;
            if (!api) return;
            const result = await api.testConnection(accountId);
            if (result.success) {
                toast.success("الاتصال ناجح ✓");
            } else {
                toast.error(result.error || "فشل الاتصال");
            }
        } catch {
            toast.error("فشل اختبار الاتصال");
        } finally {
            setTestingAccountId(null);
        }
    };

    const handleSaveConfig = () => {
        backupService.saveBackupConfig(config);

        if (config.enabled) {
            backupService.startAutoBackup();
        } else {
            backupService.stopAutoBackup();
        }

        toast.success("تم حفظ الإعدادات");
    };

    const handleCreateBackup = async () => {
        setIsCreatingBackup(true);
        try {
            const result = await backupService.createBackup();
            if (result) {
                toast.success(`تم إنشاء النسخ الاحتياطي: ${result.filename}`);
                setHistory(backupService.getBackupHistory());
                setConfig(backupService.getBackupConfig());
            } else {
                toast.error("فشل إنشاء النسخ الاحتياطي");
            }
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsRestoring(true);
        setRestoreProgress({ stage: 'reading', detail: 'جاري البدء...', percent: 0 });
        try {
            const result = await backupService.restoreBackup(file, (progress) => {
                setRestoreProgress(progress);
            });
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        } finally {
            setIsRestoring(false);
            setRestoreProgress(null);
            e.target.value = ""; // Reset input
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString("ar-EG");
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const handleResetDatabase = async () => {
        if (!confirm("⚠️ تحذير: سيتم حذف قاعدة البيانات القديمة وإنشاء واحدة جديدة!\n\nسيتم فقد جميع البيانات التي لم يتم عمل نسخة احتياطية منها.\n\nهل أنت متأكد تماماً؟")) {
            return;
        }

        try {
            await db.resetDatabase();
            toast.success("تمت إعادة التهيئة بنجاح");
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error("Error resetting database:", error);
            toast.error("خطأ في إعادة التهيئة");
        }
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />
            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Database className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">النسخ الاحتياطي</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Settings Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                إعدادات النسخ التلقائي
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base">تفعيل النسخ التلقائي</Label>
                                <Switch
                                    checked={config.enabled}
                                    onCheckedChange={(checked) =>
                                        setConfig({ ...config, enabled: checked })
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>وقت النسخ الاحتياطي اليومي</Label>
                                <Input
                                    type="time"
                                    value={config.time}
                                    onChange={(e) => setConfig({ ...config, time: e.target.value })}
                                    disabled={!config.enabled}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>مدة الاحتفاظ بالنسخ (أيام)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={config.keepDays}
                                    onChange={(e) =>
                                        setConfig({ ...config, keepDays: parseInt(e.target.value) || 7 })
                                    }
                                    disabled={!config.enabled}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>مجلد حفظ النسخ الاحتياطي</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={config.backupPath || ""}
                                        onChange={(e) =>
                                            setConfig({ ...config, backupPath: e.target.value })
                                        }
                                        placeholder="المسار الافتراضي (تنزيل)"
                                        className="flex-1"
                                        dir="ltr"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={async () => {
                                            try {
                                                const result = await (window as any).electronAPI?.file?.selectFolder(config.backupPath);
                                                if (result?.success && result.folderPath) {
                                                    setConfig({ ...config, backupPath: result.folderPath });
                                                }
                                            } catch {
                                                toast.error("غير متاح في المتصفح");
                                            }
                                        }}
                                        title="اختيار مجلد"
                                    >
                                        <FolderOpen className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    اترك فارغاً للتحميل من المتصفح
                                </p>
                            </div>

                            {config.lastBackupAt && (
                                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-sm">
                                            آخر نسخ احتياطي: {formatDate(config.lastBackupAt)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <Button onClick={handleSaveConfig} className="w-full gap-2">
                                <Save className="h-4 w-4" />
                                حفظ الإعدادات
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Manual Backup Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <HardDrive className="h-5 w-5" />
                                النسخ الاحتياطي اليدوي
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={handleCreateBackup}
                                disabled={isCreatingBackup}
                                className="w-full gap-2"
                                size="lg"
                            >
                                {isCreatingBackup ? (
                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Download className="h-5 w-5" />
                                )}
                                إنشاء نسخة احتياطية الآن
                            </Button>

                            <div className="relative">
                                <Button
                                    variant="outline"
                                    disabled={isRestoring}
                                    className="w-full gap-2"
                                    size="lg"
                                    onClick={() => document.getElementById("restore-input")?.click()}
                                >
                                    {isRestoring ? (
                                        <RefreshCw className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Upload className="h-5 w-5" />
                                    )}
                                    استعادة نسخة احتياطية
                                </Button>
                                <input
                                    id="restore-input"
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={handleRestoreBackup}
                                />
                            </div>

                            {/* Progress bar during restore */}
                            {restoreProgress && (
                                <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-blue-800 dark:text-blue-200">
                                            {restoreProgress.detail}
                                        </span>
                                        <span className="text-blue-600 dark:text-blue-400 font-mono">
                                            {restoreProgress.percent}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                                        <div
                                            className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${restoreProgress.percent}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                                <p>⚠️ تحذير: استعادة نسخة احتياطية ستؤدي إلى استبدال البيانات الحالية</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Google Drive Accounts Card */}
                {isDriveAvailable && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Cloud className="h-5 w-5 text-blue-500" />
                                حسابات Google Drive
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                اربط حسابات Google Drive لرفع النسخ الاحتياطي تلقائياً على السحابة بالتزامن مع الحفظ المحلي
                            </p>

                            {/* Connected Accounts */}
                            {driveAccounts.length > 0 && (
                                <div className="space-y-3">
                                    {driveAccounts.map((account) => (
                                        <div
                                            key={account.id}
                                            className="flex items-center justify-between p-3 border rounded-lg bg-card"
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className={`p-2 rounded-full ${account.enabled ? "bg-green-100 dark:bg-green-900" : "bg-gray-100 dark:bg-gray-800"}`}>
                                                    {account.enabled ? (
                                                        <Cloud className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                    ) : (
                                                        <CloudOff className="h-4 w-4 text-gray-400" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium truncate" dir="ltr">
                                                        {account.email}
                                                    </p>
                                                    {account.lastUploadAt && (
                                                        <p className="text-xs text-muted-foreground">
                                                            آخر رفع: {new Date(account.lastUploadAt).toLocaleString("ar-EG")}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleTestDriveConnection(account.id)}
                                                    disabled={testingAccountId === account.id}
                                                    title="اختبار الاتصال"
                                                >
                                                    {testingAccountId === account.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <TestTube className="h-4 w-4" />
                                                    )}
                                                </Button>
                                                <Switch
                                                    checked={account.enabled}
                                                    onCheckedChange={(checked) =>
                                                        handleToggleDriveAccount(account.id, checked)
                                                    }
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveDriveAccount(account.id, account.email)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                                    title="إزالة الحساب"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {driveAccounts.length === 0 && (
                                <div className="text-center py-6 border rounded-lg border-dashed">
                                    <CloudOff className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        لم يتم ربط أي حساب Google Drive بعد
                                    </p>
                                </div>
                            )}

                            <Button
                                onClick={handleAddDriveAccount}
                                disabled={isAddingDriveAccount}
                                variant="outline"
                                className="w-full gap-2"
                            >
                                {isAddingDriveAccount ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4" />
                                )}
                                إضافة حساب Google Drive
                            </Button>

                            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                                <p>💡 سيتم رفع النسخ الاحتياطي تلقائياً على جميع الحسابات المفعلة عند كل عملية نسخ احتياطي (يدوي أو تلقائي)</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Data Maintenance - Debug Mode Only */}
                {/* {isDebugMode && (
                    <Card className="border-red-200 dark:border-red-900">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                <Bug className="h-5 w-5" />
                                صيانة البيانات - وضع المطور (Debug)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Label>إعادة ضبط المصنع</Label>
                                    <Button
                                        variant="destructive"
                                        className="w-full gap-2"
                                        onClick={handleResetDatabase}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        حذف جميع البيانات وإعادة التهيئة
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        سيتم حذف قاعدة البيانات بالكامل وإنشاء واحدة جديدة فارغة
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )} */}

                {/* Backup History */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            سجل النسخ الاحتياطي
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {history.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                لا توجد نسخ احتياطية سابقة
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>الملف</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>الحجم</TableHead>
                                        <TableHead>السجلات</TableHead>
                                        <TableHead>الجداول</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((record) => (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-mono text-sm">
                                                {record.filename}
                                            </TableCell>
                                            <TableCell>{formatDate(record.createdAt)}</TableCell>
                                            <TableCell>{formatSize(record.size)}</TableCell>
                                            <TableCell>{record.recordsCount}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{record.tables.length} جدول</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default BackupSettings;

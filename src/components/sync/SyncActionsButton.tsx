/**
 * SyncActionsButton - Manual sync controls for Pull, Push, and Backup
 * Displays as a fixed button with dropdown menu
 */

import React, { useState } from "react";
import {
    Download,
    Upload,
    HardDrive,
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getSmartSync } from "@/infrastructure/sync/SmartSyncManager";
import backupService from "@/services/backup/backupService";

type ActionStatus = "idle" | "loading" | "success" | "error";

export function SyncActionsButton() {
    const [pullStatus, setPullStatus] = useState<ActionStatus>("idle");
    const [pushStatus, setPushStatus] = useState<ActionStatus>("idle");
    const [backupStatus, setBackupStatus] = useState<ActionStatus>("idle");
    const { toast } = useToast();

    const handlePull = async () => {
        if (pullStatus === "loading") return;

        setPullStatus("loading");
        try {
            const syncManager = getSmartSync();
            const result = await syncManager.pullChanges();

            setPullStatus("success");
            setTimeout(() => setPullStatus("idle"), 2000);

            if (result.errors.length > 0) {
                toast({
                    title: "سحب جزئي",
                    description: `تم سحب ${result.pulled} سجل مع ${result.errors.length} أخطاء`,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "تم السحب بنجاح",
                    description: `تم سحب ${result.pulled} سجل من السيرفر`,
                });
            }

            // Dispatch event to refresh UI
            window.dispatchEvent(new CustomEvent("sync:dataUpdated", { detail: { source: "manual-pull" } }));

        } catch (error: any) {
            setPullStatus("error");
            setTimeout(() => setPullStatus("idle"), 2000);
            toast({
                title: "فشل في السحب",
                description: error.message || "حدث خطأ أثناء السحب من السيرفر",
                variant: "destructive",
            });
        }
    };

    const handlePush = async () => {
        if (pushStatus === "loading") return;

        setPushStatus("loading");
        try {
            const syncManager = getSmartSync();
            const result = await syncManager.pushChanges();

            setPushStatus("success");
            setTimeout(() => setPushStatus("idle"), 2000);

            if (result.errors.length > 0) {
                toast({
                    title: "رفع جزئي",
                    description: `تم رفع ${result.pushed} سجل مع ${result.errors.length} أخطاء`,
                    variant: "destructive",
                });
            } else if (result.pushed === 0) {
                toast({
                    title: "لا توجد تغييرات",
                    description: "لا توجد بيانات جديدة لرفعها للسيرفر",
                });
            } else {
                toast({
                    title: "تم الرفع بنجاح",
                    description: `تم رفع ${result.pushed} سجل للسيرفر`,
                });
            }
        } catch (error: any) {
            setPushStatus("error");
            setTimeout(() => setPushStatus("idle"), 2000);
            toast({
                title: "فشل في الرفع",
                description: error.message || "حدث خطأ أثناء الرفع للسيرفر",
                variant: "destructive",
            });
        }
    };

    const handleBackup = async () => {
        if (backupStatus === "loading") return;

        setBackupStatus("loading");
        try {
            const result = await backupService.createBackup();

            if (result) {
                setBackupStatus("success");
                setTimeout(() => setBackupStatus("idle"), 2000);
                toast({
                    title: "تم النسخ الاحتياطي",
                    description: `تم حفظ ${result.tables.length} جدول (${(result.size / 1024).toFixed(1)} KB)`,
                });
            } else {
                throw new Error("فشل في إنشاء النسخة الاحتياطية");
            }
        } catch (error: any) {
            setBackupStatus("error");
            setTimeout(() => setBackupStatus("idle"), 2000);
            toast({
                title: "فشل النسخ الاحتياطي",
                description: error.message || "حدث خطأ أثناء إنشاء النسخة الاحتياطية",
                variant: "destructive",
            });
        }
    };

    const handleForceFullSync = async () => {
        if (isAnyLoading) return;

        if (!confirm("هل أنت متأكد من رغبتك في إعادة تعيين المزامنة؟\nسيقوم هذا بسحب جميع البيانات من السيرفر وإعادة رفع البيانات المحلية.")) {
            return;
        }

        setPullStatus("loading");
        setPushStatus("loading");

        try {
            const syncManager = getSmartSync();
            const result = await syncManager.forceFullSync();

            setPullStatus("success");
            setPushStatus("success");
            setTimeout(() => {
                setPullStatus("idle");
                setPushStatus("idle");
            }, 3000);

            if (result.errors.length > 0) {
                toast({
                    title: "مزامنة كاملة (مع أخطاء)",
                    description: `سحب: ${result.pulled} | رفع: ${result.pushed} | أخطاء: ${result.errors.length}`,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "تمت المزامنة الكاملة",
                    description: `تم تحديث البيانات بنجاح (سحب: ${result.pulled} | رفع: ${result.pushed})`,
                });
            }

            // Dispatch event to refresh UI
            window.dispatchEvent(new CustomEvent("sync:dataUpdated", { detail: { source: "force-full-sync" } }));

        } catch (error: any) {
            setPullStatus("error");
            setPushStatus("error");
            setTimeout(() => {
                setPullStatus("idle");
                setPushStatus("idle");
            }, 3000);

            toast({
                title: "فشل المزامنة الكاملة",
                description: error.message || "حدث خطأ أثناء المزامنة الكاملة",
                variant: "destructive",
            });
        }
    };


    const getStatusIcon = (status: ActionStatus, defaultIcon: React.ReactNode) => {
        switch (status) {
            case "loading":
                return <Loader2 className="h-4 w-4 animate-spin" />;
            case "success":
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case "error":
                return <XCircle className="h-4 w-4 text-red-500" />;
            default:
                return defaultIcon;
        }
    };

    const isAnyLoading = pullStatus === "loading" || pushStatus === "loading" || backupStatus === "loading";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="default"
                    size="icon"
                    className="relative"
                    title="مزامنة البيانات"
                >
                    {isAnyLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                    onClick={handlePull}
                    disabled={pullStatus === "loading"}
                    className="flex items-center gap-2 cursor-pointer"
                >
                    {getStatusIcon(pullStatus, <Download className="h-4 w-4" />)}
                    <span>سحب من السيرفر</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={handlePush}
                    disabled={pushStatus === "loading"}
                    className="flex items-center gap-2 cursor-pointer"
                >
                    {getStatusIcon(pushStatus, <Upload className="h-4 w-4" />)}
                    <span>رفع للسيرفر</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={handleBackup}
                    disabled={backupStatus === "loading"}
                    className="flex items-center gap-2 cursor-pointer"
                >
                    {getStatusIcon(backupStatus, <HardDrive className="h-4 w-4" />)}
                    <span>نسخ احتياطي</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={handleForceFullSync}
                    disabled={isAnyLoading}
                    className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                >
                    {getStatusIcon(pullStatus === "loading" && pushStatus === "loading" ? "loading" : "idle", <RefreshCw className="h-4 w-4" />)}
                    <span>إعادة تعيين المزامنة</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

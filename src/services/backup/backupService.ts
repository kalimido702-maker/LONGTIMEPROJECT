/**
 * Backup Service - خدمة النسخ الاحتياطي التلقائي
 * تنفذ نسخ احتياطي يومي تلقائي لجميع البيانات
 */

import { db } from "@/shared/lib/indexedDB";

// تكوين النسخ الاحتياطي
interface BackupConfig {
    enabled: boolean;
    time: string; // HH:mm
    keepDays: number; // عدد أيام الاحتفاظ بالنسخ
    lastBackupAt?: string;
    backupPath?: string;
}

// سجل النسخ الاحتياطي
interface BackupRecord {
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    tables: string[];
    recordsCount: number;
}

// الحصول على الإعدادات
const getBackupConfig = (): BackupConfig => {
    try {
        const saved = localStorage.getItem("backupConfig");
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.error("Error loading backup config:", error);
    }
    return {
        enabled: true,
        time: "02:00", // الثانية صباحاً
        keepDays: 7,
    };
};

// حفظ الإعدادات
const saveBackupConfig = (config: BackupConfig): void => {
    localStorage.setItem("backupConfig", JSON.stringify(config));
};

// الحصول على سجل النسخ الاحتياطي
const getBackupHistory = (): BackupRecord[] => {
    try {
        const saved = localStorage.getItem("backupHistory");
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.error("Error loading backup history:", error);
    }
    return [];
};

// حفظ سجل النسخ الاحتياطي
const saveBackupHistory = (history: BackupRecord[]): void => {
    localStorage.setItem("backupHistory", JSON.stringify(history));
};

// إنشاء نسخة احتياطية
const createBackup = async (): Promise<BackupRecord | null> => {
    try {
        await db.init();

        // جمع البيانات من جميع الجداول
        const tables = [
            "products",
            "customers",
            "invoices",
            "salesReturns",
            "purchases",
            "purchaseReturns",
            "suppliers",
            "employees",
            "expenses",
            "deposits",
            "depositSources",
            "installments",
            "shifts",
            "promotions",
            "productCategories",
            "units",
            "warehouses",
            "priceTypes",
            "salesReps",
            "supervisors",
            "users",
            "settings",
        ];

        const backupData: Record<string, any[]> = {};
        let totalRecords = 0;

        for (const table of tables) {
            try {
                const data = await db.getAll(table);
                if (data && data.length > 0) {
                    backupData[table] = data;
                    totalRecords += data.length;
                }
            } catch (error) {
                // تجاهل الجداول غير الموجودة
                console.log(`Table ${table} not found or empty`);
            }
        }

        // إنشاء ملف النسخ الاحتياطي
        const now = new Date();
        const filename = `backup_${now.toISOString().split("T")[0]}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}.json`;

        const backupContent = JSON.stringify({
            version: "1.0",
            createdAt: now.toISOString(),
            app: "MYPOS",
            data: backupData,
        }, null, 2);

        const blob = new Blob([backupContent], { type: "application/json" });
        const size = blob.size;

        // في Electron، يمكن حفظ الملف على القرص
        if (typeof window !== "undefined" && (window as any).electron) {
            try {
                const path = await (window as any).electron.saveBackup(filename, backupContent);
                console.log("Backup saved to:", path);
            } catch (e) {
                console.log("Electron backup save failed, using browser download");
                downloadBackup(blob, filename);
            }
        } else {
            // تحميل كملف في المتصفح
            downloadBackup(blob, filename);
        }

        // سجل النسخة الاحتياطية
        const record: BackupRecord = {
            id: `backup_${Date.now()}`,
            filename,
            size,
            createdAt: now.toISOString(),
            tables: Object.keys(backupData),
            recordsCount: totalRecords,
        };

        // تحديث السجل
        const history = getBackupHistory();
        history.unshift(record);

        // حذف النسخ القديمة
        const config = getBackupConfig();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.keepDays);

        const filteredHistory = history.filter(
            (r) => new Date(r.createdAt) > cutoffDate
        );

        saveBackupHistory(filteredHistory);

        // تحديث آخر نسخ احتياطي
        config.lastBackupAt = now.toISOString();
        saveBackupConfig(config);

        return record;
    } catch (error) {
        console.error("Error creating backup:", error);
        return null;
    }
};

// تحميل النسخ الاحتياطي
const downloadBackup = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// استعادة النسخ الاحتياطي
const restoreBackup = async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
        const content = await file.text();
        const backup = JSON.parse(content);

        if (!backup.data || typeof backup.data !== "object") {
            return { success: false, message: "ملف النسخ الاحتياطي غير صالح" };
        }

        await db.init();

        let restoredCount = 0;
        for (const [table, records] of Object.entries(backup.data)) {
            if (Array.isArray(records)) {
                for (const record of records) {
                    try {
                        await db.add(table, record);
                        restoredCount++;
                    } catch (e) {
                        // تحديث إذا كان موجوداً
                        try {
                            await db.update(table, record);
                            restoredCount++;
                        } catch (updateError) {
                            console.log(`Could not restore record in ${table}`);
                        }
                    }
                }
            }
        }

        return {
            success: true,
            message: `تم استعادة ${restoredCount} سجل من النسخ الاحتياطي`,
        };
    } catch (error) {
        return { success: false, message: "حدث خطأ أثناء استعادة النسخ الاحتياطي" };
    }
};

// فحص وتنفيذ النسخ الاحتياطي التلقائي
let autoBackupInterval: number | null = null;

const checkAndRunAutoBackup = async (): Promise<void> => {
    const config = getBackupConfig();

    if (!config.enabled) {
        return;
    }

    const now = new Date();
    const [hours, minutes] = config.time.split(":").map(Number);

    // التحقق من الوقت المناسب
    if (now.getHours() === hours && now.getMinutes() === minutes) {
        // التحقق من عدم إجراء نسخ احتياطي اليوم
        if (config.lastBackupAt) {
            const lastBackup = new Date(config.lastBackupAt);
            if (
                lastBackup.getDate() === now.getDate() &&
                lastBackup.getMonth() === now.getMonth() &&
                lastBackup.getFullYear() === now.getFullYear()
            ) {
                return; // تم النسخ الاحتياطي اليوم بالفعل
            }
        }

        console.log("Running automatic backup...");
        const result = await createBackup();
        if (result) {
            console.log("Automatic backup completed:", result.filename);
        }
    }
};

// بدء النسخ الاحتياطي التلقائي
const startAutoBackup = (): void => {
    if (autoBackupInterval) {
        return; // بالفعل مفعل
    }

    // فحص كل دقيقة
    autoBackupInterval = setInterval(checkAndRunAutoBackup, 60 * 1000);
    console.log("Auto backup service started");

    // فحص فوري عند البدء
    checkAndRunAutoBackup();
};

// إيقاف النسخ الاحتياطي التلقائي
const stopAutoBackup = (): void => {
    if (autoBackupInterval) {
        clearInterval(autoBackupInterval);
        autoBackupInterval = null;
        console.log("Auto backup service stopped");
    }
};

export const backupService = {
    getBackupConfig,
    saveBackupConfig,
    getBackupHistory,
    createBackup,
    restoreBackup,
    startAutoBackup,
    stopAutoBackup,
};

export default backupService;

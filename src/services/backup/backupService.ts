/**
 * Backup Service - خدمة النسخ الاحتياطي التلقائي
 * تنفذ نسخ احتياطي يومي تلقائي لجميع البيانات
 */

import { db } from "@/shared/lib/indexedDB";
import { getDatabaseService } from "@/infrastructure/database/DatabaseService";
import { getSmartSync } from "@/infrastructure/sync";

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
            "invoiceItems",
            "salesReturns",
            "purchases",
            "purchaseReturns",
            "suppliers",
            "employees",
            "expenses",
            "expenseCategories",
            "expenseItems",
            "deposits",
            "depositSources",
            "payments",
            "paymentMethods",
            "installments",
            "shifts",
            "promotions",
            "productCategories",
            "units",
            "productUnits",
            "warehouses",
            "priceTypes",
            "salesReps",
            "supervisors",
            "users",
            "roles",
            "settings",
            "auditLogs",
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
const restoreBackup = async (
    file: File,
    onProgress?: (progress: { stage: string; detail: string; percent: number }) => void
): Promise<{ success: boolean; message: string }> => {
    try {
        onProgress?.({ stage: 'reading', detail: 'جاري قراءة ملف النسخ الاحتياطي...', percent: 0 });

        const content = await file.text();
        const backup = JSON.parse(content);

        if (!backup.data || typeof backup.data !== "object") {
            return { success: false, message: "ملف النسخ الاحتياطي غير صالح" };
        }

        await db.init();
        const dbService = getDatabaseService();

        const tables = Object.entries(backup.data).filter(
            ([, records]) => Array.isArray(records) && (records as any[]).length > 0
        ) as [string, any[]][];
        const totalTables = tables.length;
        let restoredCount = 0;
        const now = new Date().toISOString();

        onProgress?.({ stage: 'restoring', detail: `جاري استعادة ${totalTables} جدول...`, percent: 5 });

        console.log(`📦 Starting restore of ${totalTables} tables...`);
        const tableResults: Array<{ table: string; count: number; status: string }> = [];

        // Bulk upsert each table in a single IDB transaction (fast)
        for (let i = 0; i < tables.length; i++) {
            const [table, records] = tables[i];
            const percent = 5 + Math.round(((i + 1) / totalTables) * 65); // 5% - 70%

            onProgress?.({
                stage: 'restoring',
                detail: `جاري استعادة ${table} (${records.length} سجل) [${i + 1}/${totalTables}]`,
                percent
            });

            try {
                const repo = dbService.getRepository(table);

                // Clear existing data first to avoid uniqueness conflicts
                try {
                    await repo.clear();
                } catch (clearErr) {
                    console.warn(`⚠️ Could not clear table ${table} before restore:`, clearErr);
                }

                // Stamp records: mark as unsynced so SmartSyncManager will push them
                const stampedRecords = records.map((record: any) => ({
                    ...record,
                    local_updated_at: now,
                    is_synced: false,
                    last_synced_at: null,
                }));

                // Use batchUpdateFromServer: single IDB transaction with put (upsert), no sync queue overhead
                await repo.batchUpdateFromServer(stampedRecords);
                restoredCount += records.length;
                console.log(`✅ Restored ${table}: ${records.length} records`);
                tableResults.push({ table, count: records.length, status: '✅' });
            } catch (error) {
                console.error(`❌ Error restoring table ${table}:`, error);
                tableResults.push({ table, count: 0, status: '❌' });
            }
        }

        // Log summary of all tables
        console.log('\n📊 Restore Summary:');
        for (const r of tableResults) {
            console.log(`  ${r.status} ${r.table}: ${r.count} records`);
        }
        console.log(`  Total restored: ${restoredCount} records\n`);

        // After all data is in IndexedDB, push to server automatically
        onProgress?.({ stage: 'syncing', detail: 'جاري رفع البيانات للسيرفر...', percent: 75 });

        try {
            const smartSync = getSmartSync();
            if (smartSync) {
                console.log("🔄 Starting post-restore sync push...");
                const pushResult = await smartSync.pushChanges();
                console.log(`✅ Post-restore sync push completed: ${pushResult.pushed} records pushed`);
                onProgress?.({
                    stage: 'done',
                    detail: `تم رفع ${pushResult.pushed} سجل للسيرفر`,
                    percent: 100
                });
            }
        } catch (syncError) {
            console.warn("⚠️ Could not push to server after restore:", syncError);
            onProgress?.({ stage: 'done', detail: 'تم الاستعادة محلياً، فشل الرفع للسيرفر', percent: 100 });
        }

        return {
            success: true,
            message: `تم استعادة ${restoredCount} سجل ورفعهم للسيرفر`,
        };
    } catch (error) {
        console.error("Error restoring backup:", error);
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

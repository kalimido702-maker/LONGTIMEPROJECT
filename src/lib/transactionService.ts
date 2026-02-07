// Transaction Service - يلف جميع العمليات ويضيف audit logging تلقائياً
import { db, AuditLog } from "@/shared/lib/indexedDB";

interface TransactionContext {
  userId: string;
  userName: string;
  shiftId?: string;
}

/**
 * كتابة audit log entry
 */
export async function writeAuditLog(
  action: string,
  entity: string,
  refId: string,
  context: TransactionContext,
  changes?: {
    oldValue?: any;
    newValue?: any;
    diff?: string;
  }
): Promise<void> {
  const auditLog: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    action,
    entity,
    refId,
    userId: context.userId,
    userName: context.userName,
    shiftId: context.shiftId,
    oldValue: changes?.oldValue,
    newValue: changes?.newValue,
    changes: changes?.diff,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.add("auditLogs", auditLog);
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // لا نفشل العملية الأساسية إذا فشل الـ audit log
  }
}

/**
 * Wrapper لعمليات الإنشاء - يضيف userId/shiftId تلقائياً ويكتب audit log
 */
export async function createWithAudit<T extends Record<string, any>>(
  storeName: string,
  data: T,
  context: TransactionContext,
  options?: {
    skipAudit?: boolean;
    beforeCreate?: (data: T) => Promise<void> | void;
    afterCreate?: (data: T) => Promise<void> | void;
  }
): Promise<T> {
  await db.init();

  // إضافة metadata
  const enrichedData = {
    ...data,
    userId: data.userId || context.userId,
    shiftId: data.shiftId || context.shiftId,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };

  // Before hook
  if (options?.beforeCreate) {
    await options.beforeCreate(enrichedData);
  }

  // Perform create
  await db.add(storeName, enrichedData);

  // Write audit log
  if (!options?.skipAudit) {
    await writeAuditLog(
      `${storeName}.create`,
      storeName,
      enrichedData.id,
      context,
      { newValue: enrichedData }
    );
  }

  // After hook
  if (options?.afterCreate) {
    await options.afterCreate(enrichedData);
  }

  return enrichedData;
}

/**
 * Wrapper لعمليات التحديث - يكتب audit log مع التغييرات
 */
export async function updateWithAudit<T extends Record<string, any>>(
  storeName: string,
  id: string,
  updates: Partial<T>,
  context: TransactionContext,
  options?: {
    skipAudit?: boolean;
    trackChanges?: boolean; // حفظ القيم القديمة والجديدة
    beforeUpdate?: (oldData: T, newData: T) => Promise<void> | void;
    afterUpdate?: (oldData: T, newData: T) => Promise<void> | void;
  }
): Promise<T> {
  await db.init();

  // Get old data
  const oldData = await db.get<T>(storeName, id);
  if (!oldData) {
    throw new Error(`Record not found: ${storeName}/${id}`);
  }

  // Merge updates
  const newData = {
    ...oldData,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Before hook
  if (options?.beforeUpdate) {
    await options.beforeUpdate(oldData, newData);
  }

  // Perform update
  await db.update(storeName, newData);

  // Write audit log
  if (!options?.skipAudit) {
    const changes = options?.trackChanges
      ? {
          oldValue: oldData,
          newValue: newData,
          diff: JSON.stringify(computeDiff(oldData, newData)),
        }
      : undefined;

    await writeAuditLog(`${storeName}.update`, storeName, id, context, changes);
  }

  // After hook
  if (options?.afterUpdate) {
    await options.afterUpdate(oldData, newData);
  }

  return newData;
}

/**
 * Wrapper لعمليات الحذف - يكتب audit log
 */
export async function deleteWithAudit(
  storeName: string,
  id: string,
  context: TransactionContext,
  options?: {
    skipAudit?: boolean;
    softDelete?: boolean; // علم الصف كمحذوف بدلاً من الحذف الفعلي
    beforeDelete?: (data: any) => Promise<void> | void;
    afterDelete?: (data: any) => Promise<void> | void;
  }
): Promise<void> {
  await db.init();

  // Get data before delete
  const data = await db.get(storeName, id);
  if (!data) {
    throw new Error(`Record not found: ${storeName}/${id}`);
  }

  // Before hook
  if (options?.beforeDelete) {
    await options.beforeDelete(data);
  }

  // Perform delete or soft delete
  if (options?.softDelete) {
    const updatedData: any = {
      ...data,
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: context.userId,
    };
    await db.update(storeName, updatedData);
  } else {
    await db.delete(storeName, id);
  }

  // Write audit log
  if (!options?.skipAudit) {
    await writeAuditLog(`${storeName}.delete`, storeName, id, context, {
      oldValue: data,
    });
  }

  // After hook
  if (options?.afterDelete) {
    await options.afterDelete(data);
  }
}

/**
 * حساب الفرق بين object قديم وجديد
 */
function computeDiff(
  oldObj: any,
  newObj: any
): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};

  // Check changed fields
  for (const key in newObj) {
    if (oldObj[key] !== newObj[key]) {
      // Skip updatedAt and internal fields
      if (key === "updatedAt" || key.startsWith("_")) continue;

      diff[key] = {
        old: oldObj[key],
        new: newObj[key],
      };
    }
  }

  return diff;
}

/**
 * Get audit logs for a specific record
 */
export async function getAuditLogsForRecord(
  entity: string,
  refId: string
): Promise<AuditLog[]> {
  await db.init();
  const allLogs = await db.getAll<AuditLog>("auditLogs");
  return allLogs
    .filter((log) => log.entity === entity && log.refId === refId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/**
 * Get audit logs for a user
 */
export async function getAuditLogsForUser(
  userId: string,
  limit?: number
): Promise<AuditLog[]> {
  await db.init();
  const allLogs = await db.getAll<AuditLog>("auditLogs");
  const userLogs = allLogs
    .filter((log) => log.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return limit ? userLogs.slice(0, limit) : userLogs;
}

/**
 * Get audit logs for a shift
 */
export async function getAuditLogsForShift(
  shiftId: string
): Promise<AuditLog[]> {
  await db.init();
  const allLogs = await db.getAll<AuditLog>("auditLogs");
  return allLogs
    .filter((log) => log.shiftId === shiftId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/**
 * Get recent audit logs
 */
export async function getRecentAuditLogs(
  limit: number = 100
): Promise<AuditLog[]> {
  await db.init();
  const allLogs = await db.getAll<AuditLog>("auditLogs");
  return allLogs
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);
}

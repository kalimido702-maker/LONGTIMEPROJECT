import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, isUsingSQLite } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { FieldMapper } from "./FieldMapper.js";

export interface SyncRecord {
  table_name: string;
  record_id: string;
  data: Record<string, any>;
  local_updated_at: string; // ISO timestamp من الـ client
  is_deleted: boolean;
}

export interface SyncBatchRequest {
  client_id: string | number; // Support both UUID strings and numeric IDs
  branch_id: string | number;
  device_id: string;
  records: SyncRecord[];
}

export interface SyncConflict {
  table_name: string;
  record_id: string;
  local_data: Record<string, any>;
  server_data: Record<string, any>;
  local_updated_at: string;
  server_updated_at: string;
}

export interface SyncBatchResponse {
  success: boolean;
  synced_count: number;
  conflicts: SyncConflict[];
  errors: Array<{
    table_name: string;
    record_id: string;
    error: string;
  }>;
}

export interface PullChangesRequest {
  client_id: string | number;
  branch_id: string | number;
  since: string; // ISO timestamp
  tables?: string[]; // optional: فلترة جداول معينة
}

export interface PullChangesResponse {
  changes: Array<{
    table_name: string;
    record_id: string;
    data: Record<string, any>;
    server_updated_at: string;
    is_deleted: boolean;
  }>;
  has_more: boolean;
  next_cursor?: string;
}

// قائمة الجداول المسموح بـ sync (snake_case - Backend format)
const SYNCABLE_TABLES = [
  "products",
  "product_categories",
  "customers",
  "suppliers",
  "invoices",
  "invoice_items",
  "employees",
  "shifts",
  "cash_movements",
  "payment_methods",
  "deposit_sources",
  "deposits",
  "expense_categories",
  "expense_items",
  "warehouses",
  "product_stock",
  "purchases",
  "purchase_items",
  "sales_returns",
  "purchase_returns",
  "employee_advances",
  "employee_deductions",
  "whatsapp_accounts",
  "whatsapp_messages",
  "whatsapp_campaigns",
  "whatsapp_tasks",
  "restaurant_tables",
  "halls",
  "promotions",
  "printers",
  "payment_apps",
  "settings",
  "units",
  "price_types",
  "audit_logs",
  "payments",
  "expenses",
  "purchase_payments",
  "product_units",
  "supervisors",
  "sales_reps",
  "supervisor_bonuses",
  "customer_bonuses",
  "roles",
  "users",
];


// Table name mapping: camelCase (Client) => snake_case (Backend)
const TABLE_NAME_MAP: Record<string, string> = {
  productCategories: "product_categories",
  invoiceItems: "invoice_items",
  cashMovements: "cash_movements",
  paymentMethods: "payment_methods",
  depositSources: "deposit_sources",
  expenseCategories: "expense_categories",
  expenseItems: "expense_items",
  productStock: "product_stock",
  purchaseItems: "purchase_items",
  salesReturns: "sales_returns",
  purchaseReturns: "purchase_returns",
  employeeAdvances: "employee_advances",
  employeeDeductions: "employee_deductions",
  whatsappAccounts: "whatsapp_accounts",
  whatsappMessages: "whatsapp_messages",
  salesReps: "sales_reps",
  whatsappCampaigns: "whatsapp_campaigns",
  whatsappTasks: "whatsapp_tasks",
  restaurantTables: "restaurant_tables",
  paymentApps: "payment_apps",
  priceTypes: "price_types",
  auditLogs: "audit_logs",
  purchasePayments: "purchase_payments",
  productUnits: "product_units",
  supervisorBonuses: "supervisor_bonuses",
  customerBonuses: "customer_bonuses",
};


// Helper function to normalize table name
function normalizeTableName(tableName: string): string {
  return TABLE_NAME_MAP[tableName] || tableName;
}

const MAX_BATCH_SIZE = 50;
// No global pull limit - each table is fetched completely
// This avoids cross-table cursor issues where some tables get skipped
const PER_TABLE_PULL_LIMIT = 50000;

export class SyncService {
  /**
   * معالجة batch من السجلات من الـ client
   * Strategy: Last Write Wins بناءً على timestamps
   */
  async processBatch(request: SyncBatchRequest): Promise<SyncBatchResponse> {
    const { client_id, branch_id, device_id, records } = request;

    // التحقق من حجم الـ batch
    if (records.length > MAX_BATCH_SIZE) {
      throw new Error(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} records`
      );
    }

    logger.info(
      {
        client_id,
        branch_id,
        device_id,
        record_count: records.length,
      },
      "Processing sync batch"
    );

    const response: SyncBatchResponse = {
      success: true,
      synced_count: 0,
      conflicts: [],
      errors: [],
    };

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      
      // Temporarily disable FK checks to handle out-of-order sync (e.g., purchases before suppliers)
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');

      for (const record of records) {
        try {
          // Normalize table name (camelCase => snake_case)
          const normalizedTableName = normalizeTableName(record.table_name);

          // التحقق من أن الجدول مسموح بـ sync
          if (!SYNCABLE_TABLES.includes(normalizedTableName)) {
            response.errors.push({
              table_name: record.table_name,
              record_id: record.record_id,
              error: `Table ${record.table_name} (${normalizedTableName}) is not syncable`,
            });
            continue;
          }

          // Use normalized table name for all further operations
          const table_name = normalizedTableName;

          // Tables that don't have branch_id column
          const noBranchTables = ['roles'];
          // التحقق من وجود السجل على السيرفر - check by id only (PRIMARY KEY)
          const selectCols = noBranchTables.includes(table_name)
            ? 'id, server_updated_at, sync_version, is_deleted, client_id'
            : 'id, server_updated_at, sync_version, is_deleted, client_id, branch_id';
          const [existingRows] = await connection.query<RowDataPacket[]>(
            `SELECT ${selectCols} 
             FROM ?? 
             WHERE id = ?`,
            [table_name, record.record_id]
          );

          const existing = existingRows[0];
          const localTimestamp = new Date(record.local_updated_at).getTime();

          // Special handling for invoice_items - check for duplicates by invoice_id + product_id
          // This handles the case where backup restore generates new IDs with timestamps
          if (table_name === 'invoice_items' && !existing && record.data) {
            const invoiceId = record.data.invoice_id || record.data.invoiceId;
            const productId = record.data.product_id || record.data.productId;
            const quantity = record.data.quantity;

            if (invoiceId && productId) {
              const [duplicateCheck] = await connection.query<RowDataPacket[]>(
                `SELECT id FROM ?? WHERE invoice_id = ? AND product_id = ? AND quantity = ? AND client_id = ? LIMIT 1`,
                [table_name, invoiceId, productId, quantity, client_id]
              );

              if (duplicateCheck.length > 0) {
                // Duplicate found - skip this record, it's already synced
                logger.info({
                  table_name,
                  record_id: record.record_id,
                  existing_id: duplicateCheck[0].id,
                }, 'Skipping duplicate invoice_item');
                response.synced_count++; // Count as synced since data already exists
                continue;
              }
            }
          }

          if (existing) {
            const serverTimestamp = new Date(
              existing.server_updated_at
            ).getTime();

            // Conflict Detection: Server أحدث من Client
            if (serverTimestamp > localTimestamp) {
              response.conflicts.push({
                table_name: record.table_name,
                record_id: record.record_id,
                local_data: record.data,
                server_data: existing,
                local_updated_at: record.local_updated_at,
                server_updated_at: existing.server_updated_at,
              });
              continue; // لا نحدث السجل، ننتظر قرار الـ client
            }

            // Update existing record (Last Write Wins)
            await this.updateRecord(
              connection,
              table_name,
              record.record_id,
              record.data,
              client_id,
              branch_id,
              existing.sync_version,
              record.is_deleted
            );
          } else {
            // Record doesn't exist on server

            // If this is a delete operation for a non-existent record, skip it
            // (can't delete what doesn't exist, and we can't insert with missing required fields)
            if (record.is_deleted) {
              logger.debug({ table_name, record_id: record.record_id },
                "Skipping delete for non-existent record");
              response.synced_count++; // Count as synced since nothing to do
              continue;
            }

            // Insert new record
            await this.insertRecord(
              connection,
              table_name,
              record.record_id,
              record.data,
              client_id,
              branch_id,
              record.is_deleted
            );
          }

          // تسجيل في sync_queue للبث للأجهزة الأخرى
          // Wrap in try-catch to not fail sync if sync_queue has issues
          try {
            await this.addToSyncQueue(
              connection,
              client_id,
              branch_id,
              table_name,
              record.record_id,
              record.is_deleted ? "delete" : existing ? "update" : "create",
              device_id
            );
          } catch (queueError) {
            // Log but don't fail the sync - queue errors shouldn't block data sync
            logger.warn({ error: queueError, table_name, record_id: record.record_id },
              "Failed to add to sync_queue (will retry via WebSocket)");
          }

          response.synced_count++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // Handle UNIQUE constraint violations - record already exists with same unique field
          if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('Duplicate entry')) {
            logger.warn({
              table_name: record.table_name,
              record_id: record.record_id,
              error: errorMessage
            }, "Duplicate record detected (UNIQUE constraint) - counting as synced");

            // Count as synced since the data already exists (just with different ID)
            response.synced_count++;
            continue;
          }

          logger.error(
            {
              error,
              table_name: record.table_name,
              record_id: record.record_id,
            },
            "Failed to sync record"
          );

          response.errors.push({
            table_name: record.table_name,
            record_id: record.record_id,
            error: errorMessage,
          });
        }
      }

      // Re-enable FK checks before committing
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      await connection.commit();
      logger.info(
        {
          synced_count: response.synced_count,
          conflicts_count: response.conflicts.length,
          errors_count: response.errors.length,
        },
        "Batch processing completed"
      );
    } catch (error) {
      // Re-enable FK checks even on error
      try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch { /* ignore */ }
      await connection.rollback();
      logger.error({ error }, "Batch processing failed");
      throw error;
    } finally {
      connection.release();
    }

    return response;
  }

  /**
   * سحب التغييرات من السيرفر منذ timestamp معين
   */
  async pullChanges(request: PullChangesRequest): Promise<PullChangesResponse> {
    const { client_id, branch_id, since, tables } = request;

    logger.info(
      {
        client_id,
        branch_id,
        since,
        tables,
      },
      "Pulling changes from server"
    );

    const response: PullChangesResponse = {
      changes: [],
      has_more: false,
    };

    const connection = await db.getConnection();

    try {
      const tablesToSync = tables || SYNCABLE_TABLES;

      // Tables that don't have branch_id column
      const noBranchTables = ['roles'];

      for (const table_name of tablesToSync) {
        try {
          let queryParams: any[];
          let query: string;

          if (noBranchTables.includes(table_name)) {
            query = `SELECT * FROM ?? 
             WHERE client_id = ? 
             AND server_updated_at >= ? 
             ORDER BY server_updated_at ASC, id ASC 
             LIMIT ?`;
            queryParams = [table_name, client_id, since, PER_TABLE_PULL_LIMIT];
          } else {
            // When branchId is null, pull ALL records for the client (no branch filtering)
            // This handles the common case where license doesn't specify a branch
            const branchIsNull = branch_id === null || branch_id === 'null';
            if (branchIsNull) {
              // No branch filtering - get all client records
              query = `SELECT * FROM ?? 
               WHERE client_id = ? 
               AND server_updated_at >= ? 
               ORDER BY server_updated_at ASC, id ASC 
               LIMIT ?`;
              queryParams = [table_name, client_id, since, PER_TABLE_PULL_LIMIT];
            } else {
              // Include records with NULL branch_id (imported data) alongside branch-specific records
              query = `SELECT * FROM ?? 
               WHERE client_id = ? 
               AND (branch_id = ? OR branch_id IS NULL)
               AND server_updated_at >= ? 
               ORDER BY server_updated_at ASC, id ASC 
               LIMIT ?`;
              queryParams = [table_name, client_id, branch_id, since, PER_TABLE_PULL_LIMIT];
            }
          }

          const [rows] = await connection.query<RowDataPacket[]>(query, queryParams);

          for (const row of rows) {
            const mappedData = FieldMapper.serverToClient(table_name, row);

            // For products: if prices is null/empty, reconstruct from selling_price
            if (table_name === 'products') {
              // Log for debugging
              logger.info({
                id: row.id,
                name: row.name,
                raw_prices_json: row.prices_json,
                mapped_prices: mappedData.prices,
                selling_price: row.selling_price,
                unit_id: row.unit_id,
                category_id: row.category_id,
              }, '[DEBUG] Product PULL - raw vs mapped');

              // Ensure sellingPrice is set (maps from selling_price)
              if (mappedData.sellingPrice !== undefined) {
                mappedData.sellingPrice = Number(mappedData.sellingPrice) || 0;
              }
              if (mappedData.price !== undefined) {
                mappedData.price = Number(mappedData.price) || 0;
              }
              if (mappedData.costPrice !== undefined) {
                mappedData.costPrice = Number(mappedData.costPrice) || 0;
              }
            }

            response.changes.push({
              table_name,
              record_id: row.id,
              data: mappedData,
              server_updated_at: row.server_updated_at,
              is_deleted: row.is_deleted || false,
            });
          }
        } catch (error) {
          logger.warn(
            { error, table_name },
            "Skipping table during pull (likely missing client_id/branch_id columns)"
          );
          continue;
        }
      }

      logger.info(
        {
          changes_count: response.changes.length,
          has_more: response.has_more,
        },
        "Pull changes completed"
      );
    } finally {
      connection.release();
    }

    return response;
  }

  /**
   * حل conflict بقبول نسخة معينة
   */
  async resolveConflict(
    client_id: string | number,
    branch_id: string | number | null,
    table_name: string,
    record_id: string,
    resolution: "accept_server" | "accept_client",
    client_data?: Record<string, any>
  ): Promise<void> {
    const connection = await db.getConnection();

    // Handle null branch_id
    const branchIsNull = branch_id === null || branch_id === 'null';
    const branchCondition = branchIsNull ? 'branch_id IS NULL' : 'branch_id = ?';

    try {
      await connection.beginTransaction();

      if (resolution === "accept_client" && client_data) {
        // قبول نسخة الـ client
        const queryParams = branchIsNull
          ? [table_name, record_id, client_id]
          : [table_name, record_id, client_id, branch_id];
        const [existingRows] = await connection.query<RowDataPacket[]>(
          `SELECT sync_version FROM ?? WHERE id = ? AND client_id = ? AND ${branchCondition}`,
          queryParams
        );

        if (existingRows.length > 0) {
          await this.updateRecord(
            connection,
            table_name,
            record_id,
            client_data,
            client_id,
            branch_id,
            existingRows[0].sync_version,
            false
          );
        }
      }
      // resolution === 'accept_server' لا يحتاج أي action، الـ client سيسحب النسخة من السيرفر

      await connection.commit();
      logger.info(
        {
          table_name,
          record_id,
          resolution,
        },
        "Conflict resolved"
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * إدراج أو تحديث سجل (UPSERT)
   */
  private async insertRecord(
    connection: any,
    table_name: string,
    record_id: string,
    data: Record<string, any>,
    client_id: string | number,
    branch_id: string | number,
    is_deleted: boolean
  ): Promise<void> {
    // DEBUG: Log raw client data for products
    if (table_name === 'products') {
      logger.info({
        record_id,
        raw_prices: data.prices,
        raw_unitId: data.unitId,
        raw_category: data.category,
        raw_categoryId: data.categoryId,
        raw_defaultPriceTypeId: data.defaultPriceTypeId,
        raw_keys: Object.keys(data).filter(k => ['prices', 'unitId', 'category', 'categoryId', 'defaultPriceTypeId', 'price', 'sellingPrice', 'costPrice', 'expiryDate', 'hasMultipleUnits'].includes(k)),
      }, `[DEBUG] Product push - RAW client data`);
    }

    // Transform client data to server format (includes client_id, branch_id)
    const transformedData = FieldMapper.clientToServer(
      table_name,
      data,
      client_id,
      branch_id
    );

    // DEBUG: Log transformed data for products
    if (table_name === 'products') {
      logger.info({
        record_id,
        prices_json: transformedData.prices_json,
        unit_id: transformedData.unit_id,
        category_id: transformedData.category_id,
        default_price_type_id: transformedData.default_price_type_id,
        selling_price: transformedData.selling_price,
        has_multiple_units: transformedData.has_multiple_units,
        transformed_keys: Object.keys(transformedData),
      }, `[DEBUG] Product push - TRANSFORMED server data`);
    }

    // Sanitize empty strings for DATETIME columns (MySQL rejects '' for DATETIME)
    for (const key of Object.keys(transformedData)) {
      if (
        (key.endsWith('_date') || key.endsWith('_at') || key === 'expiry_date') &&
        transformedData[key] === ''
      ) {
        transformedData[key] = null;
      }
    }

    // Also sanitize boolean fields for MySQL
    for (const key of Object.keys(transformedData)) {
      if (transformedData[key] === true) transformedData[key] = 1;
      if (transformedData[key] === false) transformedData[key] = 0;
    }

    // Add metadata fields (id and is_deleted)
    // Note: transformedData already has client_id and branch_id
    // For settings table, use record_id (which is the key) as part of id generation
    let finalId = record_id;
    if (table_name === 'settings' && !record_id.match(/^[0-9a-f]{8}-/i)) {
      // Generate a stable id based on client_id + key for settings
      finalId = `${client_id}-${record_id}`;
    }

    const fields = {
      id: finalId,
      ...transformedData,
      is_deleted
    };

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map(() => "?").join(", ");

    // Build upsert clause based on database type
    const updateColumns = columns.filter(col => col !== 'id');

    try {
      const now = new Date().toISOString();

      if (isUsingSQLite()) {
        // SQLite: ON CONFLICT(id) DO UPDATE SET col = excluded.col
        const updateClause = updateColumns.map(col => `${col} = excluded.${col}`).join(", ");
        await connection.query(
          `INSERT INTO ?? (${columns.join(", ")}, server_updated_at, sync_version) 
           VALUES (${placeholders}, ?, 1)
           ON CONFLICT(id) DO UPDATE SET ${updateClause}, server_updated_at = ?, sync_version = sync_version + 1`,
          [table_name, ...values, now, now]
        );
      } else {
        // MySQL: ON DUPLICATE KEY UPDATE col = VALUES(col)
        const updateClause = updateColumns.map(col => `${col} = VALUES(${col})`).join(", ");
        await connection.query(
          `INSERT INTO ?? (${columns.join(", ")}, server_updated_at, sync_version) 
           VALUES (${placeholders}, ?, 1)
           ON DUPLICATE KEY UPDATE ${updateClause}, server_updated_at = VALUES(server_updated_at), sync_version = sync_version + 1`,
          [table_name, ...values, now]
        );
      }
    } catch (error: any) {
      // Log helpful error info
      console.error(`Upsert failed for ${table_name}:`, {
        columns,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * تحديث سجل موجود
   */
  private async updateRecord(
    connection: any,
    table_name: string,
    record_id: string,
    data: Record<string, any>,
    client_id: string | number,
    branch_id: string | number | null,
    current_version: number,
    is_deleted: boolean
  ): Promise<void> {
    // Transform client data to server format
    const transformedData = FieldMapper.clientToServer(
      table_name,
      data,
      client_id,
      branch_id
    );

    // DEBUG: Log transformed data for products on update
    if (table_name === 'products') {
      logger.info({
        record_id,
        raw_prices: data.prices,
        raw_unitId: data.unitId,
        prices_json: transformedData.prices_json,
        unit_id: transformedData.unit_id,
        default_price_type_id: transformedData.default_price_type_id,
        transformed_keys: Object.keys(transformedData),
      }, `[DEBUG] Product UPDATE - transformed data`);
    }

    // Sanitize empty strings for DATETIME columns (MySQL rejects '' for DATETIME)
    for (const key of Object.keys(transformedData)) {
      if (
        (key.endsWith('_date') || key.endsWith('_at') || key === 'expiry_date') &&
        transformedData[key] === ''
      ) {
        transformedData[key] = null;
      }
    }

    // Also sanitize boolean fields for MySQL
    for (const key of Object.keys(transformedData)) {
      if (transformedData[key] === true) transformedData[key] = 1;
      if (transformedData[key] === false) transformedData[key] = 0;
    }

    // Remove fields that shouldn't be updated manually
    delete transformedData.id;
    delete transformedData.client_id;
    delete transformedData.branch_id;

    const updates = Object.keys(transformedData)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(transformedData);

    const now = new Date().toISOString();
    await connection.query(
      `UPDATE ?? 
       SET ${updates}, 
           is_deleted = ?, 
           server_updated_at = ?, 
           sync_version = sync_version + 1 
       WHERE id = ?`,
      [table_name, ...values, is_deleted, now, record_id]
    );
  }

  /**
   * إضافة سجل لـ sync_queue للبث للأجهزة الأخرى
   */
  private async addToSyncQueue(
    connection: any,
    client_id: number | string,
    branch_id: number | string,
    table_name: string,
    record_id: string,
    operation: "create" | "update" | "delete",
    source_device_id: string
  ): Promise<void> {
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const now = new Date().toISOString();
    await connection.query(
      `INSERT INTO sync_queue 
       (id, client_id, branch_id, device_id, entity_type, entity_id, operation, payload, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
      [queueId, client_id, branch_id, source_device_id, table_name, record_id, operation, now]
    );
  }



  /**
   * الحصول على سجل محدد من جدول معين
   * يستخدم في Notification-based Sync
   */
  async getSpecificRecord(
    client_id: string | number,
    branch_id: string | number | null,
    table_name: string,
    record_id: string
  ): Promise<Record<string, any> | null> {

    // Normalize table name
    const normalizedTableName = normalizeTableName(table_name);

    // Validate table
    if (!SYNCABLE_TABLES.includes(normalizedTableName)) {
      throw new Error(`Table ${table_name} is not syncable`);
    }

    const connection = await db.getConnection();

    try {
      // Tables that don't have branch_id column
      const noBranchTables = ['roles'];

      // Handle different primary key columns and lookup strategies
      let primaryKeyColumn = 'id';
      let lookupValue = record_id;

      if (normalizedTableName === 'settings') {
        // Settings: client sends key like "company_address", 
        // MySQL id is "${client_id}-company_address", and setting_key = "company_address"
        // Try to find by setting_key first since client sends the key name
        primaryKeyColumn = 'setting_key';
        lookupValue = record_id;
      }

      let query: string;
      let params: any[];

      if (noBranchTables.includes(normalizedTableName)) {
        // Tables without branch_id - only filter by client_id
        query = `SELECT * FROM ?? WHERE ?? = ? AND client_id = ?`;
        params = [normalizedTableName, primaryKeyColumn, lookupValue, client_id];
      } else {
        // When branchId is null, get record for any branch in the same client
        const branchIsNull = branch_id === null || branch_id === 'null';
        if (branchIsNull) {
          query = `SELECT * FROM ?? WHERE ?? = ? AND client_id = ?`;
          params = [normalizedTableName, primaryKeyColumn, lookupValue, client_id];
        } else {
          query = `SELECT * FROM ?? WHERE ?? = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)`;
          params = [normalizedTableName, primaryKeyColumn, lookupValue, client_id, branch_id];
        }
      }

      const [rows] = await connection.query<RowDataPacket[]>(query, params);

      // Fallback: if settings lookup by setting_key found nothing, try by id
      if (rows.length === 0 && normalizedTableName === 'settings') {
        const fallbackId = record_id.match(/^[0-9a-f]{8}-/i) ? record_id : `${client_id}-${record_id}`;
        const branchIsNull = branch_id === null || branch_id === 'null';
        const branchCondition = branchIsNull ? 'branch_id IS NULL' : 'branch_id = ?';
        const fallbackQuery = `SELECT * FROM ?? WHERE id = ? AND client_id = ? AND ${branchCondition}`;
        const fallbackParams = [normalizedTableName, fallbackId, client_id, ...(branchIsNull ? [] : [branch_id])];
        const [fallbackRows] = await connection.query<RowDataPacket[]>(fallbackQuery, fallbackParams);
        if (fallbackRows.length > 0) {
          const row = fallbackRows[0];
          const mappedData = FieldMapper.serverToClient(normalizedTableName, row);
          return {
            ...mappedData,
            server_updated_at: row.server_updated_at,
            is_deleted: row.is_deleted || false
          };
        }
      }

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];

      // Return mapped data (transform to client format)
      const mappedData = FieldMapper.serverToClient(normalizedTableName, row);

      return {
        ...mappedData,
        server_updated_at: row.server_updated_at,
        is_deleted: row.is_deleted || false
      };

    } finally {
      connection.release();
    }
  }

  /**
   * الحصول على إحصائيات الـ sync
   */
  async getSyncStats(
    client_id: string | number,
    branch_id: string | number | null
  ): Promise<{
    pending_queue_count: number;
    last_sync_at: string | null;
    tables_stats: Array<{ table_name: string; record_count: number }>;
  }> {
    const connection = await db.getConnection();

    // Handle null branch_id
    const branchIsNull = branch_id === null || branch_id === 'null';
    const branchCondition = branchIsNull ? 'branch_id IS NULL' : 'branch_id = ?';

    try {
      // عدد السجلات في queue
      const queueParams = branchIsNull ? [client_id] : [client_id, branch_id];
      const [queueRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM sync_queue 
         WHERE client_id = ? AND ${branchCondition} AND processed_at IS NULL`,
        queueParams
      );

      // آخر وقت sync
      const [lastSyncRows] = await connection.query<RowDataPacket[]>(
        `SELECT MAX(created_at) as last_sync FROM sync_queue 
         WHERE client_id = ? AND ${branchCondition}`,
        queueParams
      );

      // إحصائيات كل جدول
      const tables_stats: Array<{ table_name: string; record_count: number }> =
        [];
      for (const table of SYNCABLE_TABLES) {
        const tableParams = branchIsNull ? [table, client_id] : [table, client_id, branch_id];
        const [countRows] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) as count FROM ?? 
           WHERE client_id = ? AND ${branchCondition} AND is_deleted = 0`,
          tableParams
        );
        if (countRows[0].count > 0) {
          tables_stats.push({
            table_name: table,
            record_count: countRows[0].count,
          });
        }
      }

      return {
        pending_queue_count: queueRows[0].count,
        last_sync_at: lastSyncRows[0].last_sync,
        tables_stats,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * حذف جميع البيانات من السيرفر لعميل وفرع معين
   * يحذف من جميع الجداول القابلة للمزامنة + جدول sync_queue
   */
  async clearAllData(
    client_id: string | number,
    branch_id: string | number
  ): Promise<{ success: boolean; deleted_tables: string[]; total_deleted: number }> {
    const connection = await db.getConnection();
    try {
      const branchIsNull = branch_id === null || branch_id === undefined || branch_id === '';
      const branchCondition = branchIsNull ? 'branch_id IS NULL' : 'branch_id = ?';

      let totalDeleted = 0;
      const deletedTables: string[] = [];

      await connection.beginTransaction();

      for (const table of SYNCABLE_TABLES) {
        try {
          const params = branchIsNull ? [client_id] : [client_id, branch_id];
          const [result] = await connection.query<ResultSetHeader>(
            `DELETE FROM ?? WHERE client_id = ? AND ${branchCondition}`,
            [table, ...params]
          );
          if (result.affectedRows > 0) {
            deletedTables.push(table);
            totalDeleted += result.affectedRows;
            logger.info(`Cleared ${result.affectedRows} records from ${table}`);
          }
        } catch (tableError: any) {
          // Skip tables that don't exist
          if (tableError?.code === 'ER_NO_SUCH_TABLE') {
            logger.warn(`Table ${table} does not exist, skipping`);
          } else {
            logger.error({ error: tableError }, `Error clearing table ${table}`);
          }
        }
      }

      // Also clear sync_queue for this client
      try {
        const queueParams = branchIsNull ? [client_id] : [client_id, branch_id];
        const [queueResult] = await connection.query<ResultSetHeader>(
          `DELETE FROM sync_queue WHERE client_id = ? AND ${branchCondition}`,
          queueParams
        );
        if (queueResult.affectedRows > 0) {
          deletedTables.push('sync_queue');
          totalDeleted += queueResult.affectedRows;
        }
      } catch (e) {
        logger.warn({ error: e }, 'Could not clear sync_queue');
      }

      await connection.commit();

      logger.info(`Cleared all data: ${totalDeleted} records from ${deletedTables.length} tables`);

      return {
        success: true,
        deleted_tables: deletedTables,
        total_deleted: totalDeleted,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const syncService = new SyncService();

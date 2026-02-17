/**
 * SmartSyncManager - Intelligent Bidirectional Sync System
 * 
 * Features:
 * - Automatic bidirectional sync (local ↔ server)
 * - Timestamp-based conflict resolution (Last Write Wins)
 * - Real-time updates via WebSocket
 * - Offline queue with smart merge on reconnection
 * - Multi-user support
 */

import { EventEmitter } from 'events';
import { FastifyClient } from '../http/FastifyClient';
import { WebSocketClient, ConnectionState } from '../http/WebSocketClient';
import { getDatabaseService } from '../database/DatabaseService';

// Types
export interface SyncRecord {
    id: string;
    table: string;
    data: any;
    local_updated_at: string;
    server_updated_at?: string;
    is_deleted?: boolean;
}

export interface SyncResult {
    pulled: number;
    pushed: number;
    conflicts: number;
    errors: string[];
}

export interface SyncEvent {
    table: string;
    recordId: string;
    operation: 'create' | 'update' | 'delete';
    data: any;
    timestamp: string;
    sourceDeviceId: string;
    userId?: string;
}

export interface SmartSyncConfig {
    syncInterval: number;        // How often to sync (ms) - default 30s
    pullOnConnect: boolean;      // Pull changes on connect - default true
    pushOnChange: boolean;       // Push immediately on change - default true
    enableRealTime: boolean;     // Listen for WebSocket updates - default true
    batchSize: number;           // Records per batch - default 50
}

type SyncStatus = 'idle' | 'syncing' | 'pulling' | 'pushing' | 'offline' | 'error';

// Syncable tables configuration - all tables that should sync to server
const SYNCABLE_TABLES = [
    // Core products & inventory
    'products',
    'product_categories',
    'product_units',
    'units',
    'price_types',
    'warehouses',
    // People
    'customers',
    'suppliers',
    'employees',
    'supervisors',     // Added
    'sales_reps',      // Added (snake_case for backend)
    // Users & Permissions (synced from backend)
    'users',
    'roles',
    // Sales
    'invoices',
    'invoice_items',
    'sales_returns',
    // Purchases
    'purchases',
    'purchase_items',
    'purchase_returns',
    // Finance
    'expenses',
    'expense_categories',
    'expense_items',
    'deposits',
    'deposit_sources',
    'payments',
    'payment_methods',
    // Operations
    'shifts',
    // Settings & Audit
    'settings',
    'audit_logs',
];

// Mapping from snake_case table names to camelCase IndexedDB store names
const TABLE_TO_STORE_MAP: Record<string, string> = {
    'product_categories': 'productCategories',
    'product_units': 'productUnits',
    'price_types': 'priceTypes',
    'invoice_items': 'invoiceItems',
    'sales_returns': 'salesReturns',
    'purchase_items': 'purchaseItems',
    'purchase_returns': 'purchaseReturns',
    'expense_categories': 'expenseCategories',
    'expense_items': 'expenseItems',
    'deposit_sources': 'depositSources',
    'payment_methods': 'paymentMethods',
    'audit_logs': 'auditLogs',
    'sales_reps': 'salesReps',    // Added
};

// Helper function to get the store name from table name
function getStoreName(tableName: string): string {
    return TABLE_TO_STORE_MAP[tableName] || tableName;
}

// Helper function to get the table name from store name (reverse mapping)
function getTableName(storeName: string): string {
    const reverseMap = Object.entries(TABLE_TO_STORE_MAP).reduce((acc, [table, store]) => {
        acc[store] = table;
        return acc;
    }, {} as Record<string, string>);
    return reverseMap[storeName] || storeName;
}

export class SmartSyncManager extends EventEmitter {
    private httpClient: FastifyClient;
    private wsClient: WebSocketClient;
    private config: SmartSyncConfig;
    private status: SyncStatus = 'idle';
    private lastSyncTime: number = 0;
    private lastPullTime: number = 0; // Track last pull to avoid excessive syncs
    private deviceId: string;
    // Use 'any' for timer to avoid NodeJS/Browser type conflicts
    private syncTimer: any = null;
    private isOnline: boolean = navigator.onLine;

    constructor(
        httpClient: FastifyClient,
        wsClient: WebSocketClient,
        config?: Partial<SmartSyncConfig>
    ) {
        super();
        this.httpClient = httpClient;
        this.wsClient = wsClient;
        this.deviceId = this.getOrCreateDeviceId();

        this.config = {
            syncInterval: config?.syncInterval ?? 30000,      // 30 seconds
            pullOnConnect: config?.pullOnConnect ?? true,
            pushOnChange: config?.pushOnChange ?? true,
            enableRealTime: config?.enableRealTime ?? true,
            batchSize: config?.batchSize ?? 50,
        };

        this.loadLastSyncTime();
        this.setupEventListeners();
    }

    // Explicit emit definition to fix TS lint error
    public emit(event: string | symbol, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }

    // ==================== Initialization ====================

    /**
     * Start the sync manager
     */
    async start(): Promise<void> {
        console.log('[SmartSync] Starting...');

        // Do initial full sync
        if (this.isOnline) {
            await this.performFullSync();
        }

        // Start periodic sync
        this.startPeriodicSync();

        console.log('[SmartSync] Started successfully');
    }

    /**
     * Stop the sync manager
     */
    stop(): void {
        console.log('[SmartSync] Stopping...');
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    private setupEventListeners(): void {
        // Online/Offline detection
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // App visibility - sync when app comes back to foreground
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isOnline) {
                // Throttle: don't pull if we just pulled recently (within 5 seconds)
                const now = Date.now();
                if (now - this.lastPullTime < 5000) {
                    console.log('[SmartSync] App came to foreground, but skipping sync (throttled)');
                    return;
                }
                console.log('[SmartSync] App came to foreground, syncing...');
                // Pull changes from server when app becomes visible
                this.pullChanges();
            }
        });

        // Window focus - also trigger sync
        window.addEventListener('focus', () => {
            if (this.isOnline && this.status === 'idle') {
                // Throttle: don't pull if we just pulled recently (within 5 seconds)
                const now = Date.now();
                if (now - this.lastPullTime < 5000) {
                    console.log('[SmartSync] Window focused, but skipping sync (throttled)');
                    return;
                }
                console.log('[SmartSync] Window focused, checking for updates...');
                // Pull changes when window gains focus
                this.pullChanges();
            }
        });

        // WebSocket events
        this.wsClient.on('connected', () => {
            if (this.config.pullOnConnect) {
                this.pullChanges();
            }
        });

        // Real-time sync updates from other users
        // WebSocketClient emits 'sync', 'update', 'delete' events
        if (this.config.enableRealTime) {
            // Listen to 'sync' event (matches WebSocketClient.handleMessage)
            this.wsClient.on('sync', (event: SyncEvent) => {
                this.handleRemoteUpdate(event);
            });

            // Also listen for 'update' and 'delete' events
            this.wsClient.on('update', (event: SyncEvent) => {
                this.handleRemoteUpdate(event);
            });

            this.wsClient.on('delete', (event: any) => {
                // Convert delete event to SyncEvent format
                this.handleRemoteUpdate({
                    ...event,
                    operation: 'delete'
                });
            });
        }
    }

    private getOrCreateDeviceId(): string {
        const key = 'pos_device_id';
        let id = localStorage.getItem(key);
        if (!id) {
            id = `device-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
            localStorage.setItem(key, id);
        }
        return id;
    }

    private loadLastSyncTime(): void {
        const stored = localStorage.getItem('pos_last_sync_time');
        this.lastSyncTime = stored ? parseInt(stored, 10) : 0;
    }

    private saveLastSyncTime(time?: number): void {
        this.lastSyncTime = time !== undefined ? time : Date.now();
        localStorage.setItem('pos_last_sync_time', this.lastSyncTime.toString());
    }

    // ==================== Full Sync ====================

    /**
     * Force overwrite local data with server data
     * 1. Stop sync timer
     * 2. Clear ALL local syncable stores
     * 3. Reset sync timestamp to 0
     * 4. Pull everything fresh from server
     * 5. Restart sync timer
     * 
     * WARNING: This destroys all local data and replaces it with server data
     */
    async forceServerOverwrite(): Promise<SyncResult> {
        console.log('[SmartSync] 🔄 Starting FORCE SERVER OVERWRITE...');
        this.setStatus('syncing');
        this.emit('statusChange', 'syncing');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            // 1. Stop periodic sync to avoid interference
            if (this.syncTimer) {
                clearInterval(this.syncTimer);
                this.syncTimer = null;
            }

            // 1.5. Push ALL pending local changes to server first (so nothing is lost)
            console.log('[SmartSync] ⬆️ Pushing pending changes to server before clearing...');
            try {
                const pushResult = await this.pushChanges();
                result.pushed = pushResult.pushed;
                console.log(`[SmartSync] ⬆️ Pushed ${pushResult.pushed} pending records to server`);
                if (pushResult.errors.length > 0) {
                    console.warn('[SmartSync] ⚠️ Some push errors:', pushResult.errors);
                }
            } catch (pushError: any) {
                console.warn('[SmartSync] ⚠️ Push before clear failed (continuing anyway):', pushError.message);
            }

            // 2. Clear ALL local syncable stores
            console.log('[SmartSync] 🗑️ Clearing all local data...');
            const db = getDatabaseService();
            let clearedCount = 0;
            for (const tableName of SYNCABLE_TABLES) {
                try {
                    const storeName = getStoreName(tableName);
                    const repo = db.getRepository(storeName);
                    await repo.clear();
                    clearedCount++;
                    console.log(`[SmartSync] ✅ Cleared store: ${storeName}`);
                } catch (e) {
                    console.warn(`[SmartSync] ⚠️ Failed to clear ${tableName}:`, e);
                    result.errors.push(`Failed to clear ${tableName}: ${(e as Error).message}`);
                }
            }
            console.log(`[SmartSync] 🗑️ Cleared ${clearedCount}/${SYNCABLE_TABLES.length} stores`);

            // Also clear the sync queue
            try {
                const syncQueueRepo = db.getRepository('syncQueue');
                await syncQueueRepo.clear();
                console.log('[SmartSync] ✅ Cleared sync queue');
            } catch (e) {
                console.warn('[SmartSync] ⚠️ No sync queue to clear:', e);
            }

            // 3. Reset sync timestamp to pull everything
            this.lastSyncTime = 0;
            this.saveLastSyncTime(0);
            console.log('[SmartSync] ⏰ Reset sync timestamp to 0');

            // 4. Pull everything fresh from server
            console.log('[SmartSync] ⬇️ Pulling all data from server...');
            const pullResult = await this.pullChanges();
            result.pulled = pullResult.pulled;
            result.conflicts = pullResult.conflicts;
            result.errors.push(...pullResult.errors);

            // 5. Post-pull: reconstruct invoice items arrays
            console.log('[SmartSync] 🔗 Reconstructing invoice items...');
            try {
                await this.reconstructInvoiceItems();
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to reconstruct invoice items:', e);
            }

            // 6. Post-pull: recalculate customer balances from invoices & payments
            console.log('[SmartSync] 💰 Recalculating customer balances...');
            try {
                await this.recalculateCustomerBalances();
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to recalculate customer balances:', e);
            }

            console.log(`[SmartSync] ✅ Force server overwrite complete: pulled ${result.pulled} records`);

            // 5. Restart periodic sync
            this.startPeriodicSync();
            this.setStatus('idle');
            this.emit('syncComplete', result);

        } catch (error: any) {
            console.error('[SmartSync] ❌ Force server overwrite failed:', error);
            result.errors.push(error.message);
            this.setStatus('error');
            this.emit('syncError', error);

            // Still restart periodic sync
            this.startPeriodicSync();
        }

        return result;
    }

    /**
     * Perform a complete bidirectional sync
     * 1. Reset local sync state
     * 2. Mark all local records as unsynced
     * 3. Pull everything from server
     * 4. Push everything to server
     */
    async forceFullSync(): Promise<SyncResult> {
        console.log('[SmartSync] Starting FORCE FULL SYNC...');
        this.setStatus('syncing');

        // 1. Reset last sync time to 0 to pull everything
        this.lastSyncTime = 0;
        this.saveLastSyncTime(0);

        // 2. Mark all local records as unsynced to push everything
        console.log('[SmartSync] Marking all local records as unsynced...');
        const db = getDatabaseService();
        for (const tableName of SYNCABLE_TABLES) {
            try {
                const storeName = getStoreName(tableName);
                const repo = db.getRepository(storeName);
                await repo.markAllAsUnsynced();
            } catch (e) {
                console.warn(`[SmartSync] Failed to mark unsynced for ${tableName}`, e);
            }
        }

        // 3. Perform Pull
        console.log('[SmartSync] Pulling all data from server...');
        const pullResult = await this.pullChanges();

        // 4. Perform Push
        console.log('[SmartSync] Pushing all data to server...');
        const pushResult = await this.pushChanges();

        this.setStatus('idle');

        return {
            pulled: pullResult.pulled,
            pushed: pushResult.pushed,
            conflicts: pullResult.conflicts + pushResult.conflicts,
            errors: [...pullResult.errors, ...pushResult.errors]
        };
    }

    /**
     * Perform a complete bidirectional sync
     */
    async performFullSync(): Promise<SyncResult> {

        console.log('[SmartSync] Performing full sync...');
        this.setStatus('syncing');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            // Step 1: Pull changes from server first
            const pullResult = await this.pullChanges();
            result.pulled = pullResult.pulled;
            result.conflicts += pullResult.conflicts;
            result.errors.push(...pullResult.errors);

            // Step 2: Push local changes to server
            const pushResult = await this.pushChanges();
            result.pushed = pushResult.pushed;
            result.conflicts += pushResult.conflicts;
            result.errors.push(...pushResult.errors);

            this.saveLastSyncTime();
            this.setStatus('idle');
            this.emit('syncComplete', result);

            console.log(`[SmartSync] Full sync complete: pulled=${result.pulled}, pushed=${result.pushed}, conflicts=${result.conflicts}`);

        } catch (error: any) {
            console.error('[SmartSync] Full sync failed:', error);
            result.errors.push(error.message);
            this.setStatus('error');
            this.emit('syncError', error);
        }

        return result;
    }

    // ==================== Pull (Server → Local) ====================

    /**
     * Pull changes from server and apply to local IndexedDB
     */
    async pullChanges(): Promise<SyncResult> {
        console.log('[SmartSync] Pulling changes from server...');
        this.setStatus('pulling');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            let hasMore = true;
            let currentSyncTime = this.lastSyncTime;

            // Loop until all pages are fetched
            while (hasMore) {
                // Get the since timestamp - use ISO string
                const since = currentSyncTime > 0
                    ? new Date(currentSyncTime).toISOString()
                    : '1970-01-01T00:00:00.000Z';

                const response = await this.httpClient.get<{
                    success?: boolean;
                    changes: any[];
                    has_more?: boolean;
                    next_cursor?: string;
                }>(`/api/sync/pull-changes?since=${encodeURIComponent(since)}&tables=${SYNCABLE_TABLES.join(',')}`);

                // Normalize response format - convert array to object keyed by table
                const changesObj: Record<string, any[]> = {};
                if (Array.isArray(response.changes)) {
                    // DEBUG: Log first few changes to understand the response structure
                    if (response.changes.length > 0) {
                        console.log('[SmartSync DEBUG] First change object:', JSON.stringify(response.changes[0]));
                        console.log('[SmartSync DEBUG] First change.data:', JSON.stringify(response.changes[0]?.data));
                    }

                    for (const change of response.changes) {
                        const table = change.table_name;
                        if (!changesObj[table]) {
                            changesObj[table] = [];
                        }
                        // Include is_deleted and server_updated_at in the record
                        const record = {
                            ...(change.data || {}),
                            is_deleted: change.is_deleted,
                            server_updated_at: change.server_updated_at,
                        };
                        changesObj[table].push(record);
                    }
                } else if (response.changes) {
                    Object.assign(changesObj, response.changes);
                }

                let pagePulledCount = 0;
                let pageErrorCount = 0;
                // Apply each table's changes to local IndexedDB
                for (const [tableName, records] of Object.entries(changesObj)) {
                    for (const record of records) {
                        try {
                            await this.applyServerRecord(tableName, record);
                            pagePulledCount++;
                            result.pulled++;
                        } catch (recordError: any) {
                            // Log error but continue with other records
                            pageErrorCount++;
                            const errorMsg = `${tableName}/${record.id}: ${recordError.message}`;
                            console.warn(`[SmartSync] Skipping failed record: ${errorMsg}`);
                            result.errors.push(errorMsg);
                        }
                    }
                }

                console.log(`[SmartSync] Pulled page with ${pagePulledCount} records`);

                // Check pagination
                hasMore = response.has_more || false;

                // Update timestamp for next page if provided, otherwise update lastSyncTime
                if (hasMore && response.next_cursor) {
                    currentSyncTime = new Date(response.next_cursor).getTime();
                } else {
                    // Update global lastSyncTime only when full sync is done
                    this.saveLastSyncTime();
                }
            }

            // Update last pull time for throttling
            this.lastPullTime = Date.now();

            console.log(`[SmartSync] Total pulled: ${result.pulled} records from server`);

        } catch (error: any) {
            console.error('[SmartSync] Pull failed:', error);
            result.errors.push(error.message);
        }

        this.setStatus('idle');
        return result;
    }

    /**
     * Pull a specific record from server
     * Used for real-time sync notifications
     */
    async pullSpecificRecord(tableName: string, recordId: string): Promise<void> {
        console.log(`[SmartSync] Pulling specific record: ${tableName}/${recordId}`);

        try {
            // Call server API to get the specific record
            const response = await this.httpClient.get<{
                success?: boolean;
                data?: any;
            }>(`/api/sync/record/${tableName}/${recordId}`);

            if (response.data) {
                // Apply the server record to local DB
                await this.applyServerRecord(tableName, response.data);
                console.log(`[SmartSync] Successfully pulled ${tableName}/${recordId}`);
            } else {
                console.warn(`[SmartSync] No data returned for ${tableName}/${recordId}`);
            }
        } catch (error: any) {
            console.error(`[SmartSync] Failed to pull ${tableName}/${recordId}:`, error);

            // Fallback: trigger full sync for this table
            console.log('[SmartSync] Falling back to full sync...');
            await this.pullChanges();
        }
    }

    /**
     * Apply a server record to local IndexedDB
     */
    private async applyServerRecord(tableName: string, record: any): Promise<void> {
        const db = getDatabaseService();
        const storeName = getStoreName(tableName);
        const repo = db.getRepository(storeName);

        // Validate record ID - skip records without valid ID
        if (!record.id && record.id !== 0) {
            console.warn(`[SmartSync] Skipping record without ID for ${tableName}:`, record);
            return;
        }

        // ===== Post-process server records =====

        // For products: resolve category_id to category name and ensure numeric fields
        if (tableName === 'products') {
            // Resolve categoryId to category name
            const catVal = String(record.categoryId || record.category || '');
            if (catVal && /^\d+$/.test(catVal)) {
                try {
                    const catRepo = db.getRepository('productCategories');
                    const categories = await catRepo.getAll();
                    const matchedCat = categories.find((c: any) => String(c.id) === catVal);
                    if (matchedCat) {
                        record.category = matchedCat.nameAr || matchedCat.name || catVal;
                        record.categoryId = catVal;
                        console.log(`[SmartSync] Resolved category ID ${catVal} → "${record.category}" for product ${record.id}`);
                    } else {
                        record.categoryId = catVal;
                    }
                } catch (e) {
                    console.warn(`[SmartSync] Error resolving category for product ${record.id}:`, e);
                }
            }
            // Ensure numeric fields are actual numbers
            if (record.price !== undefined) record.price = Number(record.price) || 0;
            if (record.sellingPrice !== undefined) record.sellingPrice = Number(record.sellingPrice) || 0;
            if (record.costPrice !== undefined) record.costPrice = Number(record.costPrice) || 0;
            if (record.stock !== undefined) record.stock = Number(record.stock) || 0;
            if (record.minStock !== undefined) record.minStock = Number(record.minStock) || 0;

            // Reconstruct prices object if null/empty (for products that were stored before prices_json migration)
            if (!record.prices || (typeof record.prices === 'object' && Object.keys(record.prices).length === 0)) {
                const basePrice = Number(record.sellingPrice) || Number(record.price) || 0;
                if (basePrice > 0) {
                    try {
                        const priceTypesRepo = db.getRepository('priceTypes');
                        const priceTypes = await priceTypesRepo.getAll();
                        const defaultPriceType = priceTypes.find((pt: any) => pt.isDefault) || priceTypes[0];
                        if (defaultPriceType) {
                            record.prices = { [defaultPriceType.id]: basePrice };
                            record.defaultPriceTypeId = record.defaultPriceTypeId || defaultPriceType.id;
                            console.log(`[SmartSync] Reconstructed prices for product ${record.id}: ${JSON.stringify(record.prices)}`);
                        }
                    } catch (e) {
                        console.warn(`[SmartSync] Could not reconstruct prices for product ${record.id}:`, e);
                    }
                }
            }
            // Ensure prices values are numbers
            if (record.prices && typeof record.prices === 'object') {
                for (const key of Object.keys(record.prices)) {
                    record.prices[key] = Number(record.prices[key]) || 0;
                }
            }

            // Resolve unitId - if null, try to assign default unit
            if (!record.unitId) {
                try {
                    const unitsRepo = db.getRepository('units');
                    const units = await unitsRepo.getAll();
                    const defaultUnit = units.find((u: any) => u.isDefault || u.isBase) || units[0];
                    if (defaultUnit) {
                        record.unitId = defaultUnit.id;
                        console.log(`[SmartSync] Assigned default unit ${defaultUnit.id} (${defaultUnit.name}) to product ${record.id}`);
                    }
                } catch (e) {
                    console.warn(`[SmartSync] Could not resolve unit for product ${record.id}:`, e);
                }
            }
        }

        // For invoices: ensure numeric fields
        if (tableName === 'invoices') {
            if (record.total !== undefined) record.total = Number(record.total) || 0;
            if (record.discount !== undefined) record.discount = Number(record.discount) || 0;
            if (record.tax !== undefined) record.tax = Number(record.tax) || 0;
            if (record.netTotal !== undefined) record.netTotal = Number(record.netTotal) || 0;
            if (record.paidAmount !== undefined) record.paidAmount = Number(record.paidAmount) || 0;
            if (record.remainingAmount !== undefined) record.remainingAmount = Number(record.remainingAmount) || 0;
            if (record.subtotal !== undefined) record.subtotal = Number(record.subtotal) || 0;
        }

        // For invoice_items: ensure numeric fields
        if (tableName === 'invoice_items') {
            if (record.quantity !== undefined) record.quantity = Number(record.quantity) || 0;
            if (record.price !== undefined) record.price = Number(record.price) || 0;
            if (record.discount !== undefined) record.discount = Number(record.discount) || 0;
            if (record.total !== undefined) record.total = Number(record.total) || 0;
        }

        // For payments: ensure numeric fields
        if (tableName === 'payments') {
            if (record.amount !== undefined) record.amount = Number(record.amount) || 0;
        }

        // For customers: ensure numeric fields
        if (tableName === 'customers') {
            if (record.balance !== undefined) record.balance = Number(record.balance) || 0;
            if (record.currentBalance !== undefined) record.currentBalance = Number(record.currentBalance) || 0;
            if (record.creditLimit !== undefined) record.creditLimit = Number(record.creditLimit) || 0;
            if (record.bonusBalance !== undefined) record.bonusBalance = Number(record.bonusBalance) || 0;
            if (record.previousStatement !== undefined) record.previousStatement = Number(record.previousStatement) || 0;
        }

        // DEBUG: Log incoming record details
        console.log(`[SmartSync DEBUG] Applying record to ${tableName} (store: ${storeName}):`, {
            id: record.id,
            name: record.name || record.key || 'N/A',
            is_deleted: record.is_deleted
        });

        try {
            const localRecord = await repo.getById(record.id);
            console.log(`[SmartSync DEBUG] Local record for ${tableName}/${record.id}:`, localRecord ? 'EXISTS' : 'NEW');

            if (record.is_deleted) {
                // Handle deletion
                if (localRecord) {
                    await repo.deleteFromServer(record.id);
                    console.log(`[SmartSync DEBUG] Deleted ${tableName}/${record.id}`);
                }
                return;
            }

            if (!localRecord) {
                // New record from server - insert locally
                console.log(`[SmartSync DEBUG] Creating new record in ${storeName}:`, record.id);
                await repo.createFromServer(record);
                console.log(`[SmartSync DEBUG] ✅ Created ${tableName}/${record.id} successfully`);
            } else {
                // Existing record - compare timestamps
                const shouldUpdate = this.shouldApplyServerUpdate(localRecord, record);
                console.log(`[SmartSync DEBUG] Should update ${tableName}/${record.id}:`, shouldUpdate);
                if (shouldUpdate) {
                    await repo.updateFromServer(record.id, record);
                    console.log(`[SmartSync DEBUG] ✅ Updated ${tableName}/${record.id} successfully`);
                }
            }
        } catch (error) {
            console.error(`[SmartSync] ❌ Failed to apply server record to ${tableName}/${record.id}:`, error);
            throw error;
        }
    }

    /**
     * Determine if server record is newer than local
     */
    private shouldApplyServerUpdate(local: any, server: any): boolean {
        const localTime = new Date(local.local_updated_at || local.updatedAt || 0).getTime();
        const serverTime = new Date(server.server_updated_at || server.updated_at || 0).getTime();

        // Server is newer → apply update
        return serverTime > localTime;
    }

    /**
     * Reconstruct invoice items arrays from separate invoiceItems store
     * After pulling from server, invoices don't have embedded items array
     * This fetches all invoice_items and attaches them to their parent invoices
     */
    private async reconstructInvoiceItems(): Promise<void> {
        const db = getDatabaseService();
        try {
            const invoiceRepo = db.getRepository('invoices');
            const itemsRepo = db.getRepository('invoiceItems');
            const productsRepo = db.getRepository('products');

            const allInvoices = await invoiceRepo.getAll();
            const allItems = await itemsRepo.getAll();
            const allProducts = await productsRepo.getAll();

            // Build product lookup
            const productMap: Record<string, any> = {};
            allProducts.forEach((p: any) => { productMap[p.id] = p; });

            // Group items by invoice ID
            const itemsByInvoice: Record<string, any[]> = {};
            allItems.forEach((item: any) => {
                const invId = item.invoiceId;
                if (invId) {
                    if (!itemsByInvoice[invId]) itemsByInvoice[invId] = [];
                    // Enrich item with product name if missing
                    if (!item.productName && item.productId && productMap[item.productId]) {
                        item.productName = productMap[item.productId].nameAr || productMap[item.productId].name;
                    }
                    // Ensure numeric fields
                    item.quantity = Number(item.quantity) || 0;
                    item.price = Number(item.price) || 0;
                    item.discount = Number(item.discount) || 0;
                    item.total = Number(item.total) || (item.price * item.quantity);
                    itemsByInvoice[invId].push(item);
                }
            });

            // Attach items to invoices that don't have them
            let updatedCount = 0;
            for (const invoice of allInvoices) {
                const inv = invoice as any;
                if ((!inv.items || inv.items.length === 0) && itemsByInvoice[inv.id]) {
                    inv.items = itemsByInvoice[inv.id];
                    await invoiceRepo.updateFromServer(inv.id, inv);
                    updatedCount++;
                }
            }

            console.log(`[SmartSync] 🔗 Reconstructed items for ${updatedCount} invoices`);
        } catch (error) {
            console.error('[SmartSync] Error reconstructing invoice items:', error);
        }
    }

    /**
     * Recalculate customer balances from invoices, payments, sales returns
     * After pulling from server, the customer.balance field may be stale/zeroed.
     * This recalculates the correct balance using the formula:
     * balance = previousStatement + sum(invoices) - sum(payments) - sum(salesReturns)
     */
    private async recalculateCustomerBalances(): Promise<void> {
        const db = getDatabaseService();
        try {
            const customerRepo = db.getRepository('customers');
            const invoiceRepo = db.getRepository('invoices');
            const paymentRepo = db.getRepository('payments');

            const allCustomers = await customerRepo.getAll();
            const allInvoices = await invoiceRepo.getAll();
            const allPayments = await paymentRepo.getAll();

            // Also try to get sales returns
            let allReturns: any[] = [];
            try {
                const returnsRepo = db.getRepository('salesReturns');
                allReturns = await returnsRepo.getAll();
            } catch { /* store may not exist */ }

            // Build totals per customer
            const invoiceTotals: Record<string, number> = {};
            const paymentTotals: Record<string, number> = {};
            const returnTotals: Record<string, number> = {};

            for (const inv of allInvoices) {
                const i = inv as any;
                if (i.customerId) {
                    invoiceTotals[i.customerId] = (invoiceTotals[i.customerId] || 0) + (Number(i.netTotal) || Number(i.total) || 0);
                }
            }

            for (const pay of allPayments) {
                const p = pay as any;
                if (p.customerId) {
                    paymentTotals[p.customerId] = (paymentTotals[p.customerId] || 0) + (Number(p.amount) || 0);
                }
            }

            for (const ret of allReturns) {
                const r = ret as any;
                if (r.customerId) {
                    returnTotals[r.customerId] = (returnTotals[r.customerId] || 0) + (Number(r.total) || Number(r.netTotal) || 0);
                }
            }

            // Update each customer's balance
            let updatedCount = 0;
            for (const customer of allCustomers) {
                const c = customer as any;
                const previousStatement = Number(c.previousStatement) || 0;
                const totalInvoices = invoiceTotals[c.id] || 0;
                const totalPayments = paymentTotals[c.id] || 0;
                const totalReturns = returnTotals[c.id] || 0;

                const computedBalance = previousStatement + totalInvoices - totalPayments - totalReturns;
                const currentStored = Number(c.balance) || Number(c.currentBalance) || 0;

                // Only update if different
                if (Math.abs(computedBalance - currentStored) > 0.01) {
                    c.balance = computedBalance;
                    c.currentBalance = computedBalance;
                    await customerRepo.updateFromServer(c.id, c);
                    updatedCount++;
                    console.log(`[SmartSync] 💰 Updated balance for ${c.name}: ${currentStored} → ${computedBalance} (invoices: ${totalInvoices}, payments: ${totalPayments}, returns: ${totalReturns})`);
                }
            }

            console.log(`[SmartSync] 💰 Recalculated balances for ${updatedCount} customers`);
        } catch (error) {
            console.error('[SmartSync] Error recalculating customer balances:', error);
        }
    }

    // ==================== Push (Local → Server) ====================

    /**
     * Push local changes to server
     */
    async pushChanges(): Promise<SyncResult> {
        console.log('[SmartSync] Pushing local changes to server...');
        this.setStatus('pushing');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            const db = getDatabaseService();

            // Get all unsynced records from all tables
            const unsyncedRecords: Array<{ table: string; record: any }> = [];

            for (const tableName of SYNCABLE_TABLES) {
                try {
                    const storeName = getStoreName(tableName);
                    const repo = db.getRepository(storeName);
                    const unsynced = await repo.getUnsyncedRecords();

                    for (const record of unsynced) {
                        unsyncedRecords.push({ table: tableName, record });
                    }
                } catch (e) {
                    // Table might not exist locally
                    console.warn(`[SmartSync] Could not get unsynced records for ${tableName}`);
                }
            }

            if (unsyncedRecords.length === 0) {
                console.log('[SmartSync] No local changes to push');
                this.setStatus('idle');
                return result;
            }

            console.log(`[SmartSync] Found ${unsyncedRecords.length} unsynced records`);
            // Log details of unsynced records for debugging
            for (const { table, record } of unsyncedRecords) {
                console.log(`[SmartSync] Unsynced: ${table}/${record.id || record.key} (is_synced=${record.is_synced}, last_synced_at=${record.last_synced_at})`);
            }

            // Send in batches
            const batches = this.createBatches(unsyncedRecords, this.config.batchSize);

            for (const batch of batches) {
                const batchResult = await this.pushBatch(batch);
                result.pushed += batchResult.pushed;
                result.conflicts += batchResult.conflicts;
                result.errors.push(...batchResult.errors);
            }

            console.log(`[SmartSync] Pushed ${result.pushed} records`);
            if (result.errors.length > 0) {
                console.warn(`[SmartSync] Push errors:`, result.errors);
            }

        } catch (error: any) {
            console.error('[SmartSync] Push failed:', error);
            result.errors.push(error.message);
        }

        this.setStatus('idle');
        return result;
    }

    /**
     * Push a batch of records to server
     */
    private async pushBatch(records: Array<{ table: string; record: any }>): Promise<SyncResult> {
        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        const requestRecords = records.map(({ table, record }) => {
            // Settings table uses 'key' as primary key, others use 'id'
            let recordId: string;
            if (table === 'settings') {
                recordId = record.key || record.id || `settings-${Date.now()}`;
            } else {
                recordId = record.id;
            }

            return {
                table_name: table,
                record_id: recordId,
                data: record,
                local_updated_at: record.local_updated_at || new Date().toISOString(),
                is_deleted: record.is_deleted || false,
            };
        });

        try {
            const response = await this.httpClient.post<{
                success: boolean;
                synced_count: number;
                errors: Array<{ table_name: string; record_id: string; error: string }>;
                conflicts: any[];
            }>('/api/sync/batch-push', {
                device_id: this.deviceId,
                records: requestRecords,
            });

            result.pushed = response.synced_count || 0;

            // Mark successfully synced records
            const db = getDatabaseService();
            const errorSet = new Set(
                (response.errors || []).map(e => `${e.table_name}:${e.record_id}`)
            );

            for (const { table, record } of records) {
                // Settings table uses 'key' as primary key
                const recordKey = table === 'settings' ? (record.key || record.id) : record.id;
                const errorKey = `${table}:${recordKey}`;
                if (!errorSet.has(errorKey)) {
                    // Mark as synced
                    try {
                        const storeName = getStoreName(table);
                        const repo = db.getRepository(storeName);
                        await repo.markAsSynced(recordKey);
                    } catch (e) {
                        console.warn(`[SmartSync] Could not mark ${table}:${recordKey} as synced`);
                    }
                }
            }

            // Handle errors
            if (response.errors) {
                for (const err of response.errors) {
                    result.errors.push(`${err.table_name}:${err.record_id} - ${err.error}`);
                }
            }

            // Handle conflicts
            if (response.conflicts) {
                result.conflicts = response.conflicts.length;
                for (const conflict of response.conflicts) {
                    await this.resolveConflict(conflict);
                }
            }

        } catch (error: any) {
            result.errors.push(error.message);
        }

        return result;
    }

    // ==================== Real-time Updates ====================

    /**
     * Handle real-time update notification from another user/device
     * NOTIFICATION-BASED: We don't apply data from the event directly.
     * Instead, we pull the fresh data from the server.
     */
    private async handleRemoteUpdate(event: SyncEvent): Promise<void> {
        // Skip if we are the source of this update
        if (event.sourceDeviceId === this.deviceId) {
            return;
        }

        console.log(`[SmartSync] Notification received: ${event.table}/${event.recordId} (${event.operation})`);

        try {
            // For create/update: pull fresh data from server
            if (event.operation === 'create' || event.operation === 'update') {
                // Pull the specific record from server (single source of truth)
                await this.pullSpecificRecord(event.table, event.recordId);
            }
            // For delete: apply directly (no need to fetch)
            else if (event.operation === 'delete') {
                const db = getDatabaseService();
                const storeName = getStoreName(event.table);
                const repo = db.getRepository(storeName);
                await repo.deleteFromServer(event.recordId);
                console.log(`[SmartSync] Deleted ${event.table}/${event.recordId} from local DB`);
            }

            // Emit event for UI refresh
            this.emit('remoteUpdate', {
                table: event.table,
                recordId: event.recordId,
                operation: event.operation,
            });

        } catch (error) {
            console.error('[SmartSync] Failed to handle remote notification:', error);
        }
    }

    /**
     * Notify server of a local change (for broadcasting to other users)
     * NOTIFICATION-BASED: Save to server FIRST, then broadcast notification (no data)
     */
    async notifyLocalChange(
        table: string,
        recordId: string,
        operation: 'create' | 'update' | 'delete',
        data: any
    ): Promise<void> {
        if (!this.isOnline) {
            console.log('[SmartSync] Offline - change will sync later');
            return;
        }

        try {
            // STEP 1: Push to server FIRST (single source of truth)
            if (this.config.pushOnChange) {
                console.log(`[SmartSync] Saving ${table}/${recordId} to server...`);
                const result = await this.pushBatch([{ table, record: data }]);

                if (result.errors.length > 0) {
                    console.warn('[SmartSync] Server save failed:', result.errors);
                    // Don't broadcast if server save failed
                    return;
                }

                console.log(`[SmartSync] Successfully saved ${table}/${recordId} to server`);
            }

            // STEP 2: Send notification only (NO DATA) via WebSocket
            // MOVED TO SERVER: We rely on server broadcast (which uses correct snake_case table names)
            // This prevents race conditions and ensures data is committed before notification
            /*
            this.wsClient.send({
                type: 'sync:notification',
                payload: {
                    table,
                    recordId,
                    operation,
                    // ✅ NO DATA - just notification
                    timestamp: new Date().toISOString(),
                    sourceDeviceId: this.deviceId,
                }
            });
            */

            console.log(`[SmartSync] Broadcasted notification for ${table}/${recordId}`);

        } catch (error) {
            console.error('[SmartSync] Failed to notify local change:', error);
        }
    }

    // ==================== Conflict Resolution ====================

    /**
     * Resolve a sync conflict using Last Write Wins
     * Conflict structure from server:
     * { table_name, record_id, local_data, server_data, local_updated_at, server_updated_at }
     */
    private async resolveConflict(conflict: any): Promise<void> {
        const { table_name, record_id, local_updated_at, server_updated_at } = conflict;

        const localTime = new Date(local_updated_at || 0).getTime();
        const serverTime = new Date(server_updated_at || 0).getTime();

        console.log(`[SmartSync] Resolving conflict for ${table_name}/${record_id}: local=${localTime}, server=${serverTime}`);

        const db = getDatabaseService();
        const storeName = getStoreName(table_name);

        try {
            if (serverTime >= localTime) {
                // Server wins - mark local record as synced (don't re-push)
                const repo = db.getRepository(storeName);
                await repo.markAsSynced(record_id);
                console.log(`[SmartSync] Conflict resolved: Server wins, marked ${table_name}/${record_id} as synced`);
            } else {
                // Local wins - will be pushed in next sync cycle
                console.log(`[SmartSync] Conflict resolved: Local wins (will push)`);
            }
        } catch (e) {
            console.warn(`[SmartSync] Could not resolve conflict for ${table_name}/${record_id}:`, e);
        }
    }

    // ==================== Online/Offline ====================

    private handleOnline(): void {
        console.log('[SmartSync] Back online');
        this.isOnline = true;
        this.setStatus('idle');

        // Perform full sync when back online
        this.performFullSync();

        this.emit('online');
    }

    private handleOffline(): void {
        console.log('[SmartSync] Gone offline');
        this.isOnline = false;
        this.setStatus('offline');
        this.emit('offline');
    }

    // ==================== Helpers ====================

    private startPeriodicSync(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }

        this.syncTimer = setInterval(() => {
            if (this.isOnline && this.status === 'idle') {
                this.performFullSync();
            }
        }, this.config.syncInterval);
    }

    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    private setStatus(status: SyncStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.emit('statusChange', status);
        }
    }

    // ==================== Public API ====================

    getStatus(): SyncStatus {
        return this.status;
    }

    getLastSyncTime(): number {
        return this.lastSyncTime;
    }

    isConnected(): boolean {
        return this.isOnline;
    }

    getDeviceId(): string {
        return this.deviceId;
    }
}

// ==================== Singleton ====================

let smartSyncInstance: SmartSyncManager | null = null;

export function initializeSmartSync(
    httpClient: FastifyClient,
    wsClient: WebSocketClient,
    config?: Partial<SmartSyncConfig>
): SmartSyncManager {
    smartSyncInstance = new SmartSyncManager(httpClient, wsClient, config);
    return smartSyncInstance;
}

export function getSmartSync(): SmartSyncManager {
    if (!smartSyncInstance) {
        throw new Error('SmartSyncManager not initialized. Call initializeSmartSync first.');
    }
    return smartSyncInstance;
}

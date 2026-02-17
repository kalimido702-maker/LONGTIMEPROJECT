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

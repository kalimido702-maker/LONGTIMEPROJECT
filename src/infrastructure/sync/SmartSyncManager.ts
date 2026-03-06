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

export interface SyncProgressEvent {
    phase: 'pulling' | 'pushing' | 'processing';
    message: string;
    /** Current step within this phase */
    current?: number;
    /** Total steps in this phase */
    total?: number;
    /** Per-table detail when available */
    table?: string;
    /** Total records pulled/pushed so far */
    recordCount?: number;
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
    'supervisor_bonuses',
    'customer_bonuses',
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
    'supervisor_bonuses': 'supervisorBonuses',  // Added
    'customer_bonuses': 'customerBonuses',  // Added
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
    // Mutex to prevent concurrent sync operations
    private isSyncing: boolean = false;
    // Circuit breaker: stop retrying after consecutive auth failures
    private consecutiveAuthFailures: number = 0;
    private readonly MAX_AUTH_FAILURES = 3;
    // Queue for batching WebSocket notifications
    private pendingNotifications: Map<string, SyncEvent> = new Map();
    private notificationFlushTimer: any = null;
    private readonly NOTIFICATION_BATCH_DELAY = 2000; // 2 seconds
    // When true, applyServerRecord bypasses the pending-local-changes guard
    // Used by forceFullSync / forceServerOverwrite
    private isForceMode: boolean = false;

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
                // Push local changes first, then pull server updates
                this.performFullSync();
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
                // Push local changes first, then pull server updates
                this.performFullSync();
            }
        });

        // WebSocket events
        this.wsClient.on('connected', () => {
            if (this.config.pullOnConnect) {
                // Push local changes first, then pull server updates
                this.performFullSync();
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

            // 1.5. Force push ALL local records to server (not just unsynced)
            // This ensures new server columns (prices_json, unit_id, etc.) get populated
            console.log('[SmartSync] ⬆️ Force pushing ALL records to server before clearing...');
            try {
                const forceResult = await this.forceRePushAllRecords();
                result.pushed = forceResult.pushed;
                console.log(`[SmartSync] ⬆️ Force pushed ${forceResult.pushed} records to server`);
                if (forceResult.errors.length > 0) {
                    console.warn('[SmartSync] ⚠️ Some push errors:', forceResult.errors);
                }
            } catch (pushError: any) {
                console.warn('[SmartSync] ⚠️ Force push failed, trying regular push...', pushError.message);
                try {
                    const pushResult = await this.pushChanges();
                    result.pushed = pushResult.pushed;
                } catch (e: any) {
                    console.warn('[SmartSync] ⚠️ Regular push also failed (continuing anyway):', e.message);
                }
            }

            // 2. Backup local-only records that might not be on server yet
            // (records in sync queue that haven't been pushed successfully)
            console.log('[SmartSync] 💾 Backing up unsynced local records...');
            const db = getDatabaseService();
            const localBackups: { storeName: string; records: any[] }[] = [];
            try {
                const syncQueueRepo = db.getRepository('syncQueue');
                const syncQueue = await syncQueueRepo.getAll();
                const pendingByStore: Record<string, Set<string>> = {};
                for (const item of syncQueue as any[]) {
                    const store = item.storeName || item.tableName;
                    if (store) {
                        if (!pendingByStore[store]) pendingByStore[store] = new Set();
                        if (item.recordId) pendingByStore[store].add(String(item.recordId));
                    }
                }
                // Backup the actual records that are pending sync
                for (const [store, ids] of Object.entries(pendingByStore)) {
                    try {
                        const repo = db.getRepository(store);
                        const backedUp: any[] = [];
                        for (const id of ids) {
                            try {
                                const record = await repo.get(id);
                                if (record) backedUp.push(record);
                            } catch { /* skip */ }
                        }
                        if (backedUp.length > 0) {
                            localBackups.push({ storeName: store, records: backedUp });
                            console.log(`[SmartSync] 💾 Backed up ${backedUp.length} unsynced records from ${store}`);
                        }
                    } catch { /* skip */ }
                }
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Could not backup sync queue:', e);
            }

            // 3. Clear ALL local syncable stores
            console.log('[SmartSync] 🗑️ Clearing all local data...');
            this.emit('syncProgress', {
                phase: 'processing',
                message: 'جاري مسح البيانات المحلية...',
            } as SyncProgressEvent);
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

            // 4. Pull everything fresh from server (force mode: bypass pending-changes protection)
            console.log('[SmartSync] ⬇️ Pulling all data from server...');
            this.emit('syncProgress', {
                phase: 'pulling',
                message: 'جاري تحميل جميع البيانات من السيرفر...',
            } as SyncProgressEvent);
            this.isForceMode = true;
            const pullResult = await this.pullChanges(true);
            this.isForceMode = false;
            result.pulled = pullResult.pulled;
            result.conflicts = pullResult.conflicts;
            result.errors.push(...pullResult.errors);

            // 5. Post-pull: reconstruct invoice items arrays
            console.log('[SmartSync] 🔗 Reconstructing invoice items...');
            this.emit('syncProgress', {
                phase: 'processing',
                message: 'جاري ربط عناصر الفواتير...',
                current: 1,
                total: 3,
            } as SyncProgressEvent);
            try {
                await this.reconstructInvoiceItems();
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to reconstruct invoice items:', e);
            }

            // 6. Post-pull: fix products (category names, prices, units)
            console.log('[SmartSync] 📦 Post-processing products...');
            this.emit('syncProgress', {
                phase: 'processing',
                message: 'جاري معالجة المنتجات...',
                current: 2,
                total: 3,
            } as SyncProgressEvent);
            try {
                await this.postProcessProducts();
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to post-process products:', e);
            }

            // 7. Post-pull: recalculate customer balances from invoices & payments
            console.log('[SmartSync] 💰 Recalculating customer balances...');
            this.emit('syncProgress', {
                phase: 'processing',
                message: 'جاري حساب أرصدة العملاء...',
                current: 3,
                total: 3,
            } as SyncProgressEvent);
            try {
                await this.recalculateCustomerBalances();
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to recalculate customer balances:', e);
            }

            // 8. Post-pull: restore any local-only records that weren't on the server
            if (localBackups.length > 0) {
                console.log('[SmartSync] 🔄 Restoring unsynced local records...');
                for (const backup of localBackups) {
                    try {
                        const repo = db.getRepository(backup.storeName);
                        for (const record of backup.records) {
                            try {
                                const existing = await repo.get(record.id);
                                if (!existing) {
                                    await repo.createFromServer(record);
                                    console.log(`[SmartSync] ✅ Restored ${backup.storeName}/${record.id}`);
                                }
                            } catch { /* skip duplicate */ }
                        }
                    } catch (e) {
                        console.warn(`[SmartSync] ⚠️ Failed to restore records for ${backup.storeName}:`, e);
                    }
                }
            }

            // 9. Post-pull: restore collection payments from localStorage
            // localStorage is never cleared by sync, so it's a reliable backup for collections
            console.log('[SmartSync] 🔄 Restoring collection payments from localStorage...');
            try {
                const saved = localStorage.getItem('pos-collections');
                if (saved) {
                    const localCollections = JSON.parse(saved) as any[];
                    const paymentRepo = db.getRepository('payments');
                    let restoredCount = 0;
                    for (const lc of localCollections) {
                        if (!lc.id) continue;
                        try {
                            const existing = await paymentRepo.get(lc.id);
                            if (!existing) {
                                const dbRecord = {
                                    id: lc.id,
                                    customerId: String(lc.customerId || ''),
                                    customerName: lc.customerName || '',
                                    amount: Number(lc.amount) || 0,
                                    paymentMethodId: lc.paymentMethodId || '',
                                    paymentMethodName: lc.paymentMethodName || '',
                                    paymentType: 'collection',
                                    paymentDate: lc.createdAt || new Date().toISOString(),
                                    createdAt: lc.createdAt || new Date().toISOString(),
                                    userId: lc.userId || '',
                                    userName: lc.userName || '',
                                    notes: lc.notes,
                                };
                                await paymentRepo.createFromServer(dbRecord);
                                restoredCount++;
                            }
                        } catch { /* skip */ }
                    }
                    if (restoredCount > 0) {
                        console.log(`[SmartSync] ✅ Restored ${restoredCount} collection payments from localStorage`);
                    }
                }
            } catch (e) {
                console.warn('[SmartSync] ⚠️ Failed to restore collections from localStorage:', e);
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

        // 3. Perform Pull (force mode: bypass pending-changes protection since we explicitly want all data)
        console.log('[SmartSync] Pulling all data from server...');
        this.isForceMode = true;
        const pullResult = await this.pullChanges(true);
        this.isForceMode = false;

        // 3.5 Post-process products (resolve categories, prices, units)
        try { await this.postProcessProducts(); } catch { /* ignore */ }

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
        // Guard against concurrent sync operations
        if (this.isSyncing) {
            console.log('[SmartSync] Sync already in progress, skipping performFullSync...');
            return { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
        }

        // Circuit breaker: skip sync if too many consecutive auth failures
        if (this.consecutiveAuthFailures >= this.MAX_AUTH_FAILURES) {
            console.warn(`[SmartSync] Circuit breaker OPEN: ${this.consecutiveAuthFailures} consecutive auth failures. Skipping sync until re-authenticated.`);
            this.setStatus('error');
            return { pulled: 0, pushed: 0, conflicts: 0, errors: ['Auth circuit breaker open - too many 401 failures'] };
        }

        // Check if we have auth tokens before attempting sync
        if (!this.httpClient.isAuthenticated()) {
            console.warn('[SmartSync] Not authenticated - skipping sync. Will retry when tokens are available.');
            this.setStatus('idle');
            return { pulled: 0, pushed: 0, conflicts: 0, errors: ['Not authenticated'] };
        }

        console.log('[SmartSync] Performing full sync...');
        this.setStatus('syncing');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            // Step 1: Push local changes to server FIRST
            // This ensures pending edits reach the server before we pull,
            // preventing server data from overwriting unsaved local changes
            const pushResult = await this.pushChanges();
            result.pushed = pushResult.pushed;
            result.conflicts += pushResult.conflicts;
            result.errors.push(...pushResult.errors);

            // Step 2: Pull changes from server
            const pullResult = await this.pullChanges();
            result.pulled = pullResult.pulled;
            result.conflicts += pullResult.conflicts;
            result.errors.push(...pullResult.errors);

            this.saveLastSyncTime();
            this.setStatus('idle');
            this.emit('syncComplete', result);

            // Reset auth failure counter on successful sync
            this.consecutiveAuthFailures = 0;

            console.log(`[SmartSync] Full sync complete: pulled=${result.pulled}, pushed=${result.pushed}, conflicts=${result.conflicts}`);

        } catch (error: any) {
            console.error('[SmartSync] Full sync failed:', error);
            result.errors.push(error.message);

            // Detect auth failures (401 / token errors) and increment circuit breaker
            const errorMsg = error.message?.toLowerCase() || '';
            const isAuthError = error.response?.status === 401 
                || errorMsg.includes('401')
                || errorMsg.includes('unauthorized')
                || errorMsg.includes('no refresh token')
                || errorMsg.includes('failed to refresh token');
            
            if (isAuthError) {
                this.consecutiveAuthFailures++;
                console.warn(`[SmartSync] Auth failure #${this.consecutiveAuthFailures}/${this.MAX_AUTH_FAILURES}. ${this.consecutiveAuthFailures >= this.MAX_AUTH_FAILURES ? 'Circuit breaker will OPEN.' : 'Will retry.'}`);
            }

            this.setStatus('error');
            this.emit('syncError', error);
        }

        return result;
    }

    // ==================== Pull (Server → Local) ====================

    /**
     * Pull changes from server and apply to local IndexedDB
     */
    async pullChanges(force: boolean = false): Promise<SyncResult> {
        // Prevent concurrent pull operations (unless forced by forceServerOverwrite/forceFullSync)
        if (this.isSyncing && !force) {
            console.log('[SmartSync] Pull already in progress, skipping...');
            return { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
        }
        this.isSyncing = true;
        console.log('[SmartSync] Pulling changes from server...');
        this.setStatus('pulling');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            const since = this.lastSyncTime > 0
                ? new Date(this.lastSyncTime).toISOString()
                : '1970-01-01T00:00:00.000Z';

            console.log(`[SmartSync] Pulling with since=${since}`);

            this.emit('syncProgress', {
                phase: 'pulling',
                message: 'جاري تحميل البيانات من السيرفر...',
            } as SyncProgressEvent);

            const response = await this.httpClient.get<{
                success?: boolean;
                changes: any[];
                has_more?: boolean;
                next_cursor?: string;
            }>(`/api/sync/pull-changes?since=${encodeURIComponent(since)}&tables=${SYNCABLE_TABLES.join(',')}`);

            // Normalize response format - convert array to object keyed by table
            const changesObj: Record<string, any[]> = {};
            if (Array.isArray(response.changes)) {
                // DEBUG: Log table counts
                const tableCounts: Record<string, number> = {};
                for (const change of response.changes) {
                    const table = change.table_name;
                    tableCounts[table] = (tableCounts[table] || 0) + 1;
                    if (!changesObj[table]) {
                        changesObj[table] = [];
                    }
                    const record = {
                        ...(change.data || {}),
                        is_deleted: change.is_deleted,
                        server_updated_at: change.server_updated_at,
                    };
                    changesObj[table].push(record);
                }
                console.log('[SmartSync] Records per table:', JSON.stringify(tableCounts));
            } else if (response.changes) {
                Object.assign(changesObj, response.changes);
            }

            let pulledCount = 0;
            const tableEntries = Object.entries(changesObj);
            let tableIndex = 0;
            // Apply each table's changes to local IndexedDB
            for (const [tableName, records] of tableEntries) {
                tableIndex++;
                console.log(`[SmartSync] Applying ${records.length} records for ${tableName}...`);
                this.emit('syncProgress', {
                    phase: 'pulling',
                    message: `جاري تطبيق ${records.length} سجل من ${tableName}...`,
                    current: tableIndex,
                    total: tableEntries.length,
                    table: tableName,
                    recordCount: pulledCount,
                } as SyncProgressEvent);
                for (const record of records) {
                    try {
                        await this.applyServerRecord(tableName, record);
                        pulledCount++;
                        result.pulled++;
                    } catch (recordError: any) {
                        const errorMsg = `${tableName}/${record.id}: ${recordError.message}`;
                        console.warn(`[SmartSync] Skipping failed record: ${errorMsg}`);
                        result.errors.push(errorMsg);
                    }
                }
            }

            console.log(`[SmartSync] Pulled ${pulledCount} records from server`);

            // Update global lastSyncTime
            this.saveLastSyncTime();

            // Update last pull time for throttling
            this.lastPullTime = Date.now();

            console.log(`[SmartSync] Total pulled: ${result.pulled} records from server`);

            this.emit('syncProgress', {
                phase: 'pulling',
                message: `تم تحميل ${result.pulled} سجل بنجاح`,
                current: tableEntries.length,
                total: tableEntries.length,
                recordCount: result.pulled,
            } as SyncProgressEvent);

        } catch (error: any) {
            console.error('[SmartSync] Pull failed:', error);
            result.errors.push(error.message);
        } finally {
            this.isSyncing = false;
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
            console.error(`[SmartSync] Failed to pull ${tableName}/${recordId}:`, error?.message || error);
            // Do NOT fallback to full pullChanges() - it causes infinite loops with large datasets
            // The periodic sync will pick up any missed records
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

        // For products: only safe numeric coercion here
        // Category resolution, prices reconstruction, unit assignment happen in postProcessProducts()
        if (tableName === 'products') {
            if (record.price !== undefined) record.price = Number(record.price) || 0;
            if (record.sellingPrice !== undefined) record.sellingPrice = Number(record.sellingPrice) || 0;
            if (record.costPrice !== undefined) record.costPrice = Number(record.costPrice) || 0;
            if (record.stock !== undefined) record.stock = Number(record.stock) || 0;
            if (record.minStock !== undefined) record.minStock = Number(record.minStock) || 0;
            // Ensure prices values are numbers if they exist
            if (record.prices && typeof record.prices === 'object') {
                for (const key of Object.keys(record.prices)) {
                    record.prices[key] = Number(record.prices[key]) || 0;
                }
            }
        }

        // For invoices: ensure numeric fields and parse JSON fields
        if (tableName === 'invoices') {
            if (record.total !== undefined) record.total = Number(record.total) || 0;
            if (record.discount !== undefined) record.discount = Number(record.discount) || 0;
            if (record.tax !== undefined) record.tax = Number(record.tax) || 0;
            if (record.netTotal !== undefined) record.netTotal = Number(record.netTotal) || 0;
            if (record.paidAmount !== undefined) record.paidAmount = Number(record.paidAmount) || 0;
            if (record.remainingAmount !== undefined) record.remainingAmount = Number(record.remainingAmount) || 0;
            if (record.subtotal !== undefined) record.subtotal = Number(record.subtotal) || 0;
            // Ensure items is an array (may come from items_json via FieldMapper)
            if (record.items && typeof record.items === 'string') {
                try { record.items = JSON.parse(record.items); } catch { record.items = []; }
            }
            if (record.items === null || record.items === undefined) record.items = [];
            // Ensure paymentMethodAmounts is an object (may come from JSON)
            if (record.paymentMethodAmounts && typeof record.paymentMethodAmounts === 'string') {
                try { record.paymentMethodAmounts = JSON.parse(record.paymentMethodAmounts); } catch { record.paymentMethodAmounts = {}; }
            }

            // Reconstruct customerName from customers store if missing
            if (!record.customerName && record.customerId) {
                try {
                    const customerRepo = db.getRepository('customers');
                    const customer = await customerRepo.get(record.customerId);
                    if (customer) {
                        record.customerName = (customer as any).name || '';
                    }
                } catch (e) { /* ignore */ }
            }

            // Reconstruct userName from users store if missing
            if (!record.userName && record.userId) {
                try {
                    const userRepo = db.getRepository('users');
                    const u = await userRepo.get(record.userId);
                    if (u) {
                        record.userName = (u as any).name || (u as any).fullName || '';
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // For purchases: ensure items is parsed
        if (tableName === 'purchases') {
            if (record.items && typeof record.items === 'string') {
                try { record.items = JSON.parse(record.items); } catch { record.items = []; }
            }
            if (record.items === null || record.items === undefined) record.items = [];
        }

        // For invoice_items: ensure numeric fields
        if (tableName === 'invoice_items') {
            if (record.quantity !== undefined) record.quantity = Number(record.quantity) || 0;
            if (record.price !== undefined) record.price = Number(record.price) || 0;
            if (record.discount !== undefined) record.discount = Number(record.discount) || 0;
            if (record.total !== undefined) record.total = Number(record.total) || 0;
        }

        // For payments: ensure numeric fields and reconstruct names if missing
        if (tableName === 'payments') {
            if (record.amount !== undefined) record.amount = Number(record.amount) || 0;

            // Reconstruct customerName from customers store if missing
            if (!record.customerName && record.customerId) {
                try {
                    const customerRepo = db.getRepository('customers');
                    const customer = await customerRepo.get(record.customerId);
                    if (customer) {
                        record.customerName = (customer as any).name || '';
                    }
                } catch (e) { /* ignore */ }
            }

            // Reconstruct paymentMethodName from paymentMethods store if missing
            if (!record.paymentMethodName && record.paymentMethodId) {
                try {
                    const pmRepo = db.getRepository('paymentMethods');
                    const pm = await pmRepo.get(record.paymentMethodId);
                    if (pm) {
                        record.paymentMethodName = (pm as any).name || '';
                    }
                } catch (e) { /* ignore */ }
            }

            // Reconstruct userName from users store if missing
            if (!record.userName && record.userId) {
                try {
                    const userRepo = db.getRepository('users');
                    const user = await userRepo.get(record.userId);
                    if (user) {
                        record.userName = (user as any).name || (user as any).fullName || '';
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // For sales_returns: ensure numeric fields and defaults
        if (tableName === 'sales_returns') {
            if (record.total !== undefined) record.total = Number(record.total) || 0;
            if (record.subtotal !== undefined) record.subtotal = Number(record.subtotal) || 0;
            if (record.tax !== undefined) record.tax = Number(record.tax) || 0;
            if (record.totalAmount !== undefined) record.totalAmount = Number(record.totalAmount) || 0;
            // Default refundStatus to 'completed' if missing
            if (!record.refundStatus) record.refundStatus = 'completed';
            // Default refundMethod to 'cash' if missing
            if (!record.refundMethod) record.refundMethod = 'cash';
            // Default deliveryStatus to 'delivered' if missing
            if (!record.deliveryStatus) record.deliveryStatus = 'delivered';
            // Ensure items is an array (may come from items_json via FieldMapper)
            if (record.items && typeof record.items === 'string') {
                try { record.items = JSON.parse(record.items); } catch { record.items = []; }
            }
            if (!Array.isArray(record.items)) record.items = [];
        }

        // For users: keep roleId in sync with role (roleId is used client-side but not synced to server)
        if (tableName === 'users') {
            if (record.role) {
                record.roleId = record.role;
            }
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
                try {
                    await repo.createFromServer(record);
                    console.log(`[SmartSync DEBUG] ✅ Created ${tableName}/${record.id} successfully`);
                } catch (createError: any) {
                    const errorMsg = createError?.message || '';
                    const isConstraintError = createError?.name === 'ConstraintError';
                    const isUniqueViolation = errorMsg.includes('uniqueness');
                    const isKeyExists = errorMsg.includes('Key already exists');

                    if (isConstraintError || isUniqueViolation || isKeyExists) {
                        // Case 1: Primary key already exists (race condition - concurrent sync)
                        // Another sync operation already inserted this record while we were checking
                        if (isKeyExists && !isUniqueViolation) {
                            console.warn(`[SmartSync] Record ${tableName}/${record.id} already exists (race condition), updating instead...`);
                            try {
                                await repo.updateFromServer(record.id, record);
                                console.log(`[SmartSync DEBUG] ✅ Updated ${tableName}/${record.id} after key-exists conflict`);
                            } catch (updateError) {
                                console.error(`[SmartSync] ❌ Could not update after key-exists for ${tableName}/${record.id}:`, updateError);
                                throw updateError;
                            }
                            return;
                        }

                        // Case 2: Unique index constraint violation
                        // Server sends a record with a name/nameAr that already exists locally under a different ID
                        console.warn(`[SmartSync] Unique constraint conflict for ${tableName}/${record.id}, attempting to resolve...`);
                        
                        // Find and remove ALL conflicting local records by unique indexed fields
                        const uniqueFields = this.getUniqueIndexFields(storeName);
                        let conflictsRemoved = false;

                        // First try via index lookup (faster)
                        for (const field of uniqueFields) {
                            if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
                                try {
                                    const conflicts = await repo.getByIndex(field, record[field]);
                                    if (conflicts && conflicts.length > 0) {
                                        for (const conflict of conflicts) {
                                            if ((conflict as any).id !== record.id) {
                                                console.log(`[SmartSync] Removing conflicting local record ${tableName}/${(conflict as any).id} (${field}="${record[field]}")`);
                                                await repo.deleteFromServer((conflict as any).id);
                                                conflictsRemoved = true;
                                            }
                                        }
                                    }
                                } catch (_indexError) {
                                    // Index lookup failed, will fallback to scan
                                }
                            }
                        }

                        // If index lookup didn't find conflicts, do a full scan
                        if (!conflictsRemoved) {
                            try {
                                const allRecords = await repo.getAll();
                                for (const field of uniqueFields) {
                                    if (record[field] !== undefined && record[field] !== null) {
                                        const conflictingRecords = allRecords.filter((r: any) => r[field] === record[field] && r.id !== record.id);
                                        for (const conflict of conflictingRecords) {
                                            console.log(`[SmartSync] Removing conflicting record ${tableName}/${(conflict as any).id} found by scan`);
                                            await repo.deleteFromServer((conflict as any).id);
                                            conflictsRemoved = true;
                                        }
                                    }
                                }
                            } catch (_scanError) {
                                // Scan failed too
                            }
                        }

                        // Retry create after removing conflicts
                        try {
                            await repo.createFromServer(record);
                            console.log(`[SmartSync DEBUG] ✅ Created ${tableName}/${record.id} after conflict resolution`);
                        } catch (retryError: any) {
                            // If still fails with key-exists, the record was created by a concurrent operation
                            if (retryError?.message?.includes('Key already exists')) {
                                console.warn(`[SmartSync] Record ${tableName}/${record.id} created by concurrent sync, updating...`);
                                await repo.updateFromServer(record.id, record);
                                console.log(`[SmartSync DEBUG] ✅ Updated ${tableName}/${record.id} after retry key-exists`);
                            } else {
                                console.error(`[SmartSync] ❌ Could not resolve conflict for ${tableName}/${record.id}:`, retryError);
                                throw retryError;
                            }
                        }
                    } else {
                        throw createError;
                    }
                }
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
     * Get the unique index field names for a given store
     * Used to resolve unique constraint conflicts during sync
     */
    private getUniqueIndexFields(storeName: string): string[] {
        const uniqueFieldsMap: Record<string, string[]> = {
            productCategories: ['nameAr'],
            units: ['name'],
            priceTypes: ['name'],
            paymentMethods: ['name'],
            warehouses: ['nameAr'],
            roles: ['nameEn'],
            users: ['username'],
            whatsappAccounts: ['phone'],
        };
        return uniqueFieldsMap[storeName] || [];
    }

    /**
     * Determine if server record should overwrite local record.
     * Protects records with pending local changes from being overwritten.
     */
    private shouldApplyServerUpdate(local: any, server: any): boolean {
        // In normal (non-force) mode: never overwrite records with pending local changes
        if (!this.isForceMode) {
            // Check is_synced flag (set to false by SyncableRepository.update/add)
            if (local.is_synced === false) {
                console.log(`[SmartSync] ⏳ Skipping server update - record has pending local changes (is_synced=false)`);
                return false;
            }

            // Also check timestamp: if local was modified after last sync, it has pending changes
            // This catches edits where is_synced wasn't properly set (e.g., legacy records)
            if (local.last_synced_at && local.local_updated_at) {
                const localModifiedAt = new Date(local.local_updated_at).getTime();
                const lastSyncedAt = new Date(local.last_synced_at).getTime();
                if (localModifiedAt > lastSyncedAt) {
                    console.log(`[SmartSync] ⏳ Skipping server update - local changes newer than last sync (modified=${local.local_updated_at}, synced=${local.last_synced_at})`);
                    return false;
                }
            }
        }

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
                    const cid = String(i.customerId);
                    invoiceTotals[cid] = (invoiceTotals[cid] || 0) + (Number(i.netTotal) || Number(i.total) || 0);
                }
            }

            for (const pay of allPayments) {
                const p = pay as any;
                if (p.customerId) {
                    const cid = String(p.customerId);
                    paymentTotals[cid] = (paymentTotals[cid] || 0) + (Number(p.amount) || 0);
                }
            }

            for (const ret of allReturns) {
                const r = ret as any;
                if (r.customerId) {
                    const cid = String(r.customerId);
                    returnTotals[cid] = (returnTotals[cid] || 0) + (Number(r.total) || Number(r.netTotal) || 0);
                }
            }

            // Update each customer's balance
            let updatedCount = 0;
            for (const customer of allCustomers) {
                const c = customer as any;
                const custId = String(c.id);
                const previousStatement = Number(c.previousStatement) || 0;
                const totalInvoices = invoiceTotals[custId] || 0;
                const totalPayments = paymentTotals[custId] || 0;
                const totalReturns = returnTotals[custId] || 0;

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

    /**
     * Post-process products after ALL tables have been pulled.
     * Resolves category IDs to names, reconstructs prices from sellingPrice,
     * and assigns default units — all dependent on other stores being populated first.
     */
    private async postProcessProducts(): Promise<void> {
        const db = getDatabaseService();
        try {
            const productsRepo = db.getRepository('products');
            const allProducts = await productsRepo.getAll();

            if (allProducts.length === 0) return;

            // Load lookup data
            let categories: any[] = [];
            let priceTypes: any[] = [];
            let units: any[] = [];
            try { categories = await db.getRepository('productCategories').getAll(); } catch { /* empty */ }
            try { priceTypes = await db.getRepository('priceTypes').getAll(); } catch { /* empty */ }
            try { units = await db.getRepository('units').getAll(); } catch { /* empty */ }

            const categoryMap: Record<string, any> = {};
            categories.forEach((c: any) => { categoryMap[String(c.id)] = c; });

            const defaultPriceType = priceTypes.find((pt: any) => pt.isDefault) || priceTypes[0];
            const defaultUnit = units.find((u: any) => u.isDefault || u.isBase) || units[0];

            let updatedCount = 0;

            for (const product of allProducts) {
                const p = product as any;
                let changed = false;

                // 1. Resolve category ID to category name
                const catVal = String(p.categoryId || p.category || '');
                if (catVal && /^\d+$/.test(catVal) && categoryMap[catVal]) {
                    const cat = categoryMap[catVal];
                    p.category = cat.nameAr || cat.name || catVal;
                    p.categoryId = catVal;
                    changed = true;
                }

                // 2. Reconstruct prices if null/empty
                if (!p.prices || (typeof p.prices === 'object' && Object.keys(p.prices).length === 0)) {
                    const basePrice = Number(p.sellingPrice) || Number(p.price) || 0;
                    if (basePrice > 0 && defaultPriceType) {
                        p.prices = { [defaultPriceType.id]: basePrice };
                        p.defaultPriceTypeId = p.defaultPriceTypeId || defaultPriceType.id;
                        changed = true;
                        console.log(`[SmartSync] 📦 Reconstructed prices for "${p.name}": ${JSON.stringify(p.prices)}`);
                    }
                }

                // 3. Assign default unit if missing
                if (!p.unitId && defaultUnit) {
                    p.unitId = defaultUnit.id;
                    changed = true;
                    console.log(`[SmartSync] 📦 Assigned unit "${defaultUnit.name}" to "${p.name}"`);
                }

                // 4. Ensure numeric fields
                if (p.prices && typeof p.prices === 'object') {
                    for (const key of Object.keys(p.prices)) {
                        p.prices[key] = Number(p.prices[key]) || 0;
                    }
                }

                if (changed) {
                    await productsRepo.updateFromServer(p.id, p);
                    updatedCount++;
                }
            }

            console.log(`[SmartSync] 📦 Post-processed ${updatedCount}/${allProducts.length} products (categories: ${categories.length}, priceTypes: ${priceTypes.length}, units: ${units.length})`);
        } catch (error) {
            console.error('[SmartSync] Error post-processing products:', error);
        }
    }

    // ==================== Push (Local → Server) ====================

    /**
     * Force re-push ALL records to server (not just unsynced ones)
     * This is used before forceServerOverwrite to ensure new server columns
     * (like prices_json, unit_id, etc.) get populated from existing local data.
     */
    private async forceRePushAllRecords(): Promise<SyncResult> {
        console.log('[SmartSync] ⬆️ Force re-pushing ALL records...');

        const result: SyncResult = {
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            errors: [],
        };

        try {
            const db = getDatabaseService();
            const allRecords: Array<{ table: string; record: any }> = [];

            for (const tableName of SYNCABLE_TABLES) {
                try {
                    const storeName = getStoreName(tableName);
                    const repo = db.getRepository(storeName);
                    const records = await repo.getAll();

                    for (const record of records) {
                        allRecords.push({ table: tableName, record });
                    }
                    console.log(`[SmartSync] 📦 ${tableName}: ${records.length} records to push`);
                } catch (e) {
                    console.warn(`[SmartSync] ⚠️ Could not read ${tableName} for re-push`);
                }
            }

            if (allRecords.length === 0) {
                console.log('[SmartSync] No records to re-push');
                return result;
            }

            console.log(`[SmartSync] ⬆️ Force re-pushing ${allRecords.length} total records...`);

            // Send in batches
            const batches = this.createBatches(allRecords, this.config.batchSize);

            for (const batch of batches) {
                const batchResult = await this.pushBatch(batch);
                result.pushed += batchResult.pushed;
                result.conflicts += batchResult.conflicts;
                result.errors.push(...batchResult.errors);
            }

            console.log(`[SmartSync] ✅ Force re-pushed ${result.pushed} records`);
        } catch (error: any) {
            console.error('[SmartSync] Force re-push failed:', error);
            result.errors.push(error.message);
        }

        return result;
    }

    /**
     * Push local changes to server
     */
    async pushChanges(): Promise<SyncResult> {
        console.log('[SmartSync] Pushing local changes to server...');

        // Skip push if not authenticated
        if (!this.httpClient.isAuthenticated()) {
            console.warn('[SmartSync] Not authenticated - skipping push.');
            return { pulled: 0, pushed: 0, conflicts: 0, errors: ['Not authenticated'] };
        }

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

            this.emit('syncProgress', {
                phase: 'pushing',
                message: `جاري رفع ${unsyncedRecords.length} سجل إلى السيرفر...`,
                current: 0,
                total: unsyncedRecords.length,
                recordCount: 0,
            } as SyncProgressEvent);

            // Log details of unsynced records for debugging
            for (const { table, record } of unsyncedRecords) {
                console.log(`[SmartSync] Unsynced: ${table}/${record.id || record.key} (is_synced=${record.is_synced}, last_synced_at=${record.last_synced_at})`);
            }

            // Send in batches
            const batches = this.createBatches(unsyncedRecords, this.config.batchSize);
            let batchIndex = 0;

            for (const batch of batches) {
                batchIndex++;
                this.emit('syncProgress', {
                    phase: 'pushing',
                    message: `جاري رفع الدفعة ${batchIndex} من ${batches.length}...`,
                    current: batchIndex,
                    total: batches.length,
                    recordCount: result.pushed,
                } as SyncProgressEvent);
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

            // Build sets of records that SHOULD NOT be marked as synced:
            // - Records that had errors (server rejected them)
            // - Records that had conflicts (need separate handling by resolveConflict)
            const db = getDatabaseService();
            const skipSet = new Set<string>();

            // Add error records to skip set
            if (response.errors) {
                for (const err of response.errors) {
                    skipSet.add(`${err.table_name}:${err.record_id}`);
                    result.errors.push(`${err.table_name}:${err.record_id} - ${err.error}`);
                }
            }

            // Add conflicted records to skip set (resolveConflict will handle their sync state)
            if (response.conflicts) {
                for (const conflict of response.conflicts) {
                    skipSet.add(`${conflict.table_name}:${conflict.record_id}`);
                }
            }

            // Mark only SUCCESSFULLY synced records (not errors, not conflicts)
            for (const { table, record } of records) {
                // Settings table uses 'key' as primary key
                const recordKey = table === 'settings' ? (record.key || record.id) : record.id;
                const skipKey = `${table}:${recordKey}`;
                if (!skipSet.has(skipKey)) {
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

            // Handle conflicts AFTER marking synced records
            // resolveConflict decides whether to mark as synced (server wins)
            // or leave as unsynced (local wins → re-pushed in next cycle)
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

        // For delete: apply directly (no need to batch)
        if (event.operation === 'delete') {
            try {
                const db = getDatabaseService();
                const storeName = getStoreName(event.table);
                const repo = db.getRepository(storeName);
                await repo.deleteFromServer(event.recordId);
                console.log(`[SmartSync] Deleted ${event.table}/${event.recordId} from local DB`);
                this.emit('remoteUpdate', {
                    table: event.table,
                    recordId: event.recordId,
                    operation: event.operation,
                });
            } catch (error) {
                console.error('[SmartSync] Failed to handle remote delete:', error);
            }
            return;
        }

        // For create/update: batch notifications and do a single pull
        // This prevents flooding the server with hundreds of individual record pulls
        const key = `${event.table}/${event.recordId}`;
        this.pendingNotifications.set(key, event);

        // Debounce: wait for more notifications before pulling
        if (this.notificationFlushTimer) {
            clearTimeout(this.notificationFlushTimer);
        }
        this.notificationFlushTimer = setTimeout(() => {
            this.flushPendingNotifications();
        }, this.NOTIFICATION_BATCH_DELAY);
    }

    /**
     * Flush pending notifications by doing a single pull instead of individual record fetches
     */
    private async flushPendingNotifications(): Promise<void> {
        const count = this.pendingNotifications.size;
        if (count === 0) return;

        console.log(`[SmartSync] Flushing ${count} batched notifications...`);
        const notifications = new Map(this.pendingNotifications);
        this.pendingNotifications.clear();

        // If we have many notifications (> 5), just do a full pull - much more efficient
        if (count > 5) {
            console.log(`[SmartSync] Too many notifications (${count}), doing full pull instead of individual fetches...`);
            await this.pullChanges();
        } else {
            // Few notifications - pull each specific record
            for (const [key, event] of notifications) {
                try {
                    await this.pullSpecificRecord(event.table, event.recordId);
                } catch (error) {
                    console.error(`[SmartSync] Failed to pull ${key}:`, error);
                }
            }
        }

        // Emit UI refresh event
        this.emit('remoteUpdate', { count });
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
            const repo = db.getRepository(storeName);
            if (serverTime >= localTime) {
                // Server wins - mark local record as synced so it doesn't get re-pushed.
                // The next pull will overwrite local data with the server version.
                await repo.markAsSynced(record_id);
                console.log(`[SmartSync] Conflict resolved: Server wins, marked ${table_name}/${record_id} as synced`);
            } else {
                // Local wins - ensure record stays UNSYNCED so it gets re-pushed in the next cycle.
                // pushBatch already skipped marking it as synced (via skipSet),
                // but be explicit: use batchUpdateFromServer to set is_synced=false
                // WITHOUT triggering the sync queue (we don't want a circular re-queue).
                const existing = await repo.getById(record_id);
                if (existing && (existing as any).is_synced !== false) {
                    const updated = { ...existing, is_synced: false, last_synced_at: null } as any;
                    await repo.batchUpdateFromServer([updated]);
                }
                console.log(`[SmartSync] Conflict resolved: Local wins, ${table_name}/${record_id} will be re-pushed`);
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

        // Push first (save local edits), then pull (get server updates)
        if (!this.isSyncing) {
            this.performFullSync();
        }

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
            if (this.isOnline && this.status === 'idle' && !this.isSyncing && this.httpClient.isAuthenticated()) {
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

    /**
     * Reset the auth circuit breaker (call after successful re-authentication)
     */
    resetAuthCircuitBreaker(): void {
        if (this.consecutiveAuthFailures > 0) {
            console.log(`[SmartSync] Auth circuit breaker RESET (was at ${this.consecutiveAuthFailures} failures)`);
            this.consecutiveAuthFailures = 0;
            this.setStatus('idle');
        }
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

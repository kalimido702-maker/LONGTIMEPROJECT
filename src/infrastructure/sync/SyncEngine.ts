import { EventEmitter } from "events";
import { FastifyClient, getFastifyClient } from "../http/FastifyClient";
import {
  WebSocketClient,
  getWebSocketClient,
  ConnectionState,
} from "../http/WebSocketClient";
import { SyncQueue, getSyncQueue, SyncQueueItem } from "./SyncQueue";
import { getDatabaseService } from "../database/DatabaseService";

import { TABLE_TO_STORE_MAP as TABLE_TO_STORE } from './syncConstants';

export enum SyncStatus {
  IDLE = "idle",
  SYNCING = "syncing",
  ERROR = "error",
  PAUSED = "paused",
}

export interface SyncConfig {
  syncInterval?: number; // Default: 5 minutes
  batchSize?: number; // Default: 50
  retryDelay?: number; // Default: 10 seconds
  maxRetries?: number; // Default: 3
  enableAutoSync?: boolean; // Default: true
}

export interface SyncStats {
  lastSyncTime: number | null;
  totalSynced: number;
  totalFailed: number;
  pendingCount: number;
  isOnline: boolean;
  status: SyncStatus;
}

export class SyncEngine extends EventEmitter {
  private httpClient: FastifyClient;
  private wsClient: WebSocketClient;
  private syncQueue: SyncQueue;
  private config: Required<SyncConfig>;
  private syncTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private currentStatus: SyncStatus = SyncStatus.IDLE;
  private stats: SyncStats = {
    lastSyncTime: null,
    totalSynced: 0,
    totalFailed: 0,
    pendingCount: 0,
    isOnline: navigator.onLine,
    status: SyncStatus.IDLE,
  };

  constructor(
    httpClient: FastifyClient,
    wsClient: WebSocketClient,
    syncQueue: SyncQueue,
    config?: SyncConfig
  ) {
    super();
    this.httpClient = httpClient;
    this.wsClient = wsClient;
    this.syncQueue = syncQueue;

    this.config = {
      syncInterval: config?.syncInterval || 5 * 60 * 1000, // 5 minutes
      batchSize: config?.batchSize || 50,
      retryDelay: config?.retryDelay || 10 * 1000, // 10 seconds
      maxRetries: config?.maxRetries || 3,
      enableAutoSync: config?.enableAutoSync !== false,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Monitor online/offline status
    window.addEventListener("online", () => {
      console.log("Network: Online");
      this.stats.isOnline = true;
      this.emit("online");
      this.triggerSync();
    });

    window.addEventListener("offline", () => {
      console.log("Network: Offline");
      this.stats.isOnline = false;
      this.emit("offline");
      this.stopAutoSync();
    });

    // WebSocket events
    this.wsClient.on("connected", () => {
      console.log("SyncEngine: WebSocket connected");
      this.emit("websocketConnected");
    });

    this.wsClient.on("disconnected", () => {
      console.log("SyncEngine: WebSocket disconnected");
      this.emit("websocketDisconnected");
    });

    this.wsClient.on("sync", (data: any) => {
      console.log("SyncEngine: Received sync notification", data);
      this.handleRemoteSync(data);
    });

    this.wsClient.on("update", (data: any) => {
      console.log("SyncEngine: Received update notification", data);
      this.emit("remoteUpdate", data);
    });

    this.wsClient.on("delete", (data: any) => {
      console.log("SyncEngine: Received delete notification", data);
      this.emit("remoteDelete", data);
    });
  }

  public async start(): Promise<void> {
    console.log("Starting SyncEngine...");

    // Connect WebSocket
    if (!this.wsClient.isConnected()) {
      this.wsClient.connect();
    }

    // Start auto-sync if enabled and online
    if (this.config.enableAutoSync && this.stats.isOnline) {
      this.startAutoSync();
    }

    // Trigger initial sync
    await this.triggerSync();

    this.emit("started");
  }

  public async stop(): Promise<void> {
    console.log("Stopping SyncEngine...");

    this.stopAutoSync();
    this.wsClient.disconnect();

    this.emit("stopped");
  }

  private startAutoSync(): void {
    if (this.syncTimer) return;

    console.log(`Starting auto-sync (interval: ${this.config.syncInterval}ms)`);
    this.syncTimer = setInterval(() => {
      this.triggerSync();
    }, this.config.syncInterval);
  }

  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log("Auto-sync stopped");
    }
  }

  public async triggerSync(): Promise<void> {
    if (!this.stats.isOnline) {
      console.log("Cannot sync: Offline");
      return;
    }

    if (this.isProcessing) {
      console.log("Sync already in progress");
      return;
    }

    try {
      this.isProcessing = true;
      this.setStatus(SyncStatus.SYNCING);

      await this.processQueue();
      await this.pullFromServer();

      this.stats.lastSyncTime = Date.now();
      this.setStatus(SyncStatus.IDLE);
    } catch (error) {
      console.error("Sync error:", error);
      this.setStatus(SyncStatus.ERROR);
      this.emit("syncError", error);
    } finally {
      this.isProcessing = false;
      this.emit("syncComplete", this.stats);
    }
  }

  // Alias for triggerSync
  public async syncNow(): Promise<void> {
    return this.triggerSync();
  }

  private async processQueue(): Promise<void> {
    const pendingItems = await this.syncQueue.getPending();
    this.stats.pendingCount = pendingItems.length;

    if (pendingItems.length === 0) {
      console.log("No pending items to sync");
      return;
    }

    console.log(`Processing ${pendingItems.length} pending items`);
    const batches = this.createBatches(pendingItems, this.config.batchSize);

    for (const batch of batches) {
      await this.processBatch(batch);
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(items: SyncQueueItem[]): Promise<void> {
    // Prepare batch body for /api/sync/batch-push
    const deviceId = this.getDeviceId();

    const records = items.map((item) => ({
      table_name: item.table,
      record_id: item.recordId,
      data: item.data,
      local_updated_at: item.data?.local_updated_at || new Date().toISOString(),
      is_deleted: item.operation === "delete",
    }));

    // Mark items as processing
    await Promise.all(
      items.map((item) => this.syncQueue.updateStatus(item.id, "processing"))
    );

    try {
      const response = await this.httpClient.post<{
        success: boolean;
        synced_count: number;
        errors: Array<{ table_name: string; record_id: string; error: string }>;
        conflicts: any[];
      }>("/api/sync/batch-push", {
        device_id: deviceId,
        records,
      });

      // Handle per-record results from server response
      const errorMap = new Map<string, string>();
      if (response.errors) {
        for (const err of response.errors) {
          errorMap.set(`${err.table_name}:${err.record_id}`, err.error);
        }
      }

      // Process each item based on server response
      for (const item of items) {
        const errorKey = `${item.table}:${item.recordId}`;
        const error = errorMap.get(errorKey);

        if (error) {
          // This specific item failed
          const retryCount = await this.syncQueue.incrementRetry(item.id);
          if (retryCount >= item.maxRetries) {
            await this.syncQueue.updateStatus(item.id, "failed", error);
            this.stats.totalFailed++;
            this.emit("itemFailed", item, new Error(error));
            console.error(`Sync failed: ${item.table} - ${item.recordId}: ${error}`);
          } else {
            await this.syncQueue.updateStatus(item.id, "pending");
            this.emit("itemRetry", item, retryCount);
            console.warn(`Sync retry ${retryCount}/${item.maxRetries}: ${item.table} - ${item.recordId}`);
          }
        } else {
          // This item synced successfully
          await this.syncQueue.updateStatus(item.id, "completed");
          this.stats.totalSynced++;
          this.emit("itemSynced", item);

          // Also mark the IndexedDB record as synced so SmartSyncManager
          // won't re-push it (avoiding unnecessary conflicts)
          try {
            const storeName = TABLE_TO_STORE[item.table] || item.table;
            const db = getDatabaseService();
            const repo = db.getRepository(storeName);
            await repo.markAsSynced(item.recordId);
          } catch (markErr) {
            // Non-fatal: SmartSyncManager will handle it later
            console.warn(`[SyncEngine] Could not mark ${item.table}:${item.recordId} as synced:`, markErr);
          }

          console.log(`Synced: ${item.table} - ${item.operation} - ${item.recordId}`);
        }
      }

      console.log(`Batch result: ${response.synced_count} synced, ${response.errors?.length || 0} errors`);

    } catch (error: any) {
      console.error("Failed to sync batch (network error):", error);

      // Network/HTTP error - retry all items
      for (const item of items) {
        const retryCount = await this.syncQueue.incrementRetry(item.id);

        if (retryCount >= item.maxRetries) {
          await this.syncQueue.updateStatus(
            item.id,
            "failed",
            error.message || "Max retries reached"
          );
          this.stats.totalFailed++;
          this.emit("itemFailed", item, error);
        } else {
          await this.syncQueue.updateStatus(item.id, "pending");
          this.emit("itemRetry", item, retryCount);
        }
      }
    }
  }


  private getDeviceId(): string {
    const key = "pos_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  private async pullFromServer(): Promise<void> {
    try {
      // SmartSyncManager handles pulling. SyncEngine only handles push queue.
      // Skip pull here to avoid dual-pull loops.
      console.log('SyncEngine: Skipping pull (handled by SmartSyncManager)');
    } catch (error) {
      console.error("Failed to pull from server:", error);
      throw error;
    }
  }

  private async handleRemoteSync(data: any): Promise<void> {
    // Handle real-time sync notifications from WebSocket
    this.emit("remoteChange", data);

    // Optionally trigger a pull sync
    if (data.forceSync) {
      await this.pullFromServer();
    }
  }

  public async addToQueue(
    table: string,
    recordId: string,
    operation: "create" | "update" | "delete",
    data: any
  ): Promise<string> {
    console.debug(`[SyncEngine] Adding to queue: ${table} ${recordId} ${operation}`);
    // console.trace('Trace for addToQueue'); // Uncomment for deep debugging

    const id = await this.syncQueue.add({
      table,
      recordId,
      operation,
      data,
      maxRetries: this.config.maxRetries,
    });

    this.stats.pendingCount++;
    this.emit("queueItemAdded", { table, recordId, operation });

    // Trigger sync if online
    if (this.stats.isOnline && !this.isProcessing) {
      setTimeout(() => this.triggerSync(), 1000);
    }

    return id;
  }

  public getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Retry all failed sync items
   */
  public async retryFailedItems(): Promise<number> {
    const count = await this.syncQueue.retryFailed();
    if (count > 0 && this.stats.isOnline) {
      this.triggerSync();
    }
    return count;
  }

  /**
   * Get failed items for debugging
   */
  public async getFailedItems() {
    return await this.syncQueue.getFailed();
  }

  public getStatus(): SyncStatus {

    return this.currentStatus;
  }

  private setStatus(status: SyncStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.stats.status = status;
      this.emit("statusChange", status);
    }
  }

  public async clearCompleted(): Promise<void> {
    await this.syncQueue.clearCompleted();
    this.emit("clearedCompleted");
  }

  public isOnline(): boolean {
    return this.stats.isOnline;
  }

  public pause(): void {
    this.setStatus(SyncStatus.PAUSED);
    this.stopAutoSync();
    this.emit("paused");
  }

  public resume(): void {
    if (this.stats.isOnline) {
      this.setStatus(SyncStatus.IDLE);
      this.startAutoSync();
      this.triggerSync();
      this.emit("resumed");
    }
  }
}

// Singleton instance
let syncEngineInstance: SyncEngine | null = null;

export async function createSyncEngine(
  config?: SyncConfig
): Promise<SyncEngine> {
  const httpClient = getFastifyClient();
  const wsClient = getWebSocketClient();
  const syncQueue = getSyncQueue();

  syncEngineInstance = new SyncEngine(httpClient, wsClient, syncQueue, config);
  return syncEngineInstance;
}

export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    throw new Error("SyncEngine not initialized. Call createSyncEngine first.");
  }
  return syncEngineInstance;
}

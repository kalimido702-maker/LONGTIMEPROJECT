import { openDB, IDBPDatabase } from "idb";

export interface SyncQueueItem {
  id: string;
  table: string;
  recordId: string;
  operation: "create" | "update" | "delete";
  data: any;
  retryCount: number;
  maxRetries: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  createdAt: number;
  processedAt?: number;
}

export class SyncQueue {
  private db: IDBPDatabase | null = null;
  private readonly dbName = "pos_sync_queue";
  private readonly storeName = "queue";
  private readonly dbVersion = 1;

  async initialize(): Promise<void> {
    this.db = await openDB(this.dbName, this.dbVersion, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("queue")) {
          const store = db.createObjectStore("queue", { keyPath: "id" });
          store.createIndex("status", "status");
          store.createIndex("createdAt", "createdAt");
          store.createIndex("table", "table");
        }
      },
    });
  }

  private ensureInitialized(): void {
    if (!this.db) {
      throw new Error("SyncQueue not initialized. Call initialize() first.");
    }
  }

  async add(
    item: Omit<SyncQueueItem, "id" | "retryCount" | "status" | "createdAt">
  ): Promise<string> {
    this.ensureInitialized();

    const queueItem: SyncQueueItem = {
      ...item,
      id: this.generateId(),
      retryCount: 0,
      status: "pending",
      createdAt: Date.now(),
    };

    await this.db!.add(this.storeName, queueItem);
    return queueItem.id;
  }

  async getAll(): Promise<SyncQueueItem[]> {
    this.ensureInitialized();
    return await this.db!.getAll(this.storeName);
  }

  async getPending(): Promise<SyncQueueItem[]> {
    this.ensureInitialized();
    const allItems = await this.db!.getAllFromIndex(
      this.storeName,
      "status",
      "pending"
    );
    return allItems.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getByTable(table: string): Promise<SyncQueueItem[]> {
    this.ensureInitialized();
    return await this.db!.getAllFromIndex(this.storeName, "table", table);
  }

  async get(id: string): Promise<SyncQueueItem | undefined> {
    this.ensureInitialized();
    return await this.db!.get(this.storeName, id);
  }

  async updateStatus(
    id: string,
    status: SyncQueueItem["status"],
    error?: string
  ): Promise<void> {
    this.ensureInitialized();
    const item = await this.get(id);
    if (!item) {
      throw new Error(`Queue item not found: ${id}`);
    }

    item.status = status;
    if (error) {
      item.error = error;
    }
    if (status === "completed" || status === "failed") {
      item.processedAt = Date.now();
    }

    await this.db!.put(this.storeName, item);
  }

  async incrementRetry(id: string): Promise<number> {
    this.ensureInitialized();
    const item = await this.get(id);
    if (!item) {
      throw new Error(`Queue item not found: ${id}`);
    }

    item.retryCount++;
    await this.db!.put(this.storeName, item);
    return item.retryCount;
  }

  async remove(id: string): Promise<void> {
    this.ensureInitialized();
    await this.db!.delete(this.storeName, id);
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    await this.db!.clear(this.storeName);
  }

  async clearCompleted(): Promise<void> {
    this.ensureInitialized();
    const completed = await this.db!.getAllFromIndex(
      this.storeName,
      "status",
      "completed"
    );
    const tx = this.db!.transaction(this.storeName, "readwrite");
    await Promise.all([
      ...completed.map((item) => tx.store.delete(item.id)),
      tx.done,
    ]);
  }

  /**
   * Reset all failed items to pending so they can be retried
   */
  async retryFailed(): Promise<number> {
    this.ensureInitialized();
    const failed = await this.db!.getAllFromIndex(
      this.storeName,
      "status",
      "failed"
    );

    const tx = this.db!.transaction(this.storeName, "readwrite");
    for (const item of failed) {
      item.status = "pending";
      item.retryCount = 0;
      item.error = undefined;
      await tx.store.put(item);
    }
    await tx.done;

    console.log(`Reset ${failed.length} failed items to pending`);
    return failed.length;
  }

  /**
   * Get all failed items
   */
  async getFailed(): Promise<SyncQueueItem[]> {
    this.ensureInitialized();
    return await this.db!.getAllFromIndex(
      this.storeName,
      "status",
      "failed"
    );
  }


  async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    this.ensureInitialized();
    const allItems = await this.getAll();

    return {
      total: allItems.length,
      pending: allItems.filter((i) => i.status === "pending").length,
      processing: allItems.filter((i) => i.status === "processing").length,
      completed: allItems.filter((i) => i.status === "completed").length,
      failed: allItems.filter((i) => i.status === "failed").length,
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let syncQueueInstance: SyncQueue | null = null;

export async function createSyncQueue(): Promise<SyncQueue> {
  syncQueueInstance = new SyncQueue();
  await syncQueueInstance.initialize();
  return syncQueueInstance;
}

export function getSyncQueue(): SyncQueue {
  if (!syncQueueInstance) {
    throw new Error("SyncQueue not initialized. Call createSyncQueue first.");
  }
  return syncQueueInstance;
}

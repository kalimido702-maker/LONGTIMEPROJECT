import { IndexedDBRepository } from "./IndexedDBRepository";
import { IndexedDBClient } from "./IndexedDBClient";
import { getSyncEngine } from "../sync/SyncEngine";

/**
 * SyncableRepository - Extends IndexedDBRepository with automatic sync queue integration
 *
 * Automatically adds changes to sync queue when data is modified
 * Tracks local_updated_at timestamp for conflict detection
 */
export class SyncableRepository<
  T extends { id: string | number; local_updated_at?: string }
> extends IndexedDBRepository<T> {
  constructor(
    client: IndexedDBClient,
    storeName: string,
    private readonly enableSync: boolean = true
  ) {
    super(client, storeName);
  }

  /**
   * Add new record and queue for sync
   */
  async add(data: T): Promise<void> {
    // Add timestamp and mark as unsynced
    const recordWithTimestamp = {
      ...data,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
    };

    // Add to local database
    await super.add(recordWithTimestamp);

    // Add to sync queue if sync is enabled
    if (this.enableSync) {
      try {
        const syncEngine = getSyncEngine();
        if (syncEngine) {
          await syncEngine.addToQueue(
            this.storeName,
            String(recordWithTimestamp.id),
            "create",
            recordWithTimestamp
          );
        }
      } catch (error) {
        console.warn("Failed to add to sync queue:", error);
        // Don't fail the operation if sync queue fails
      }
    }
  }

  /**
   * Update existing record and queue for sync
   */
  async update(data: T): Promise<void> {
    // Update timestamp and mark as unsynced
    const recordWithTimestamp = {
      ...data,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
    };

    // Update in local database
    await super.update(recordWithTimestamp);

    // Add to sync queue if sync is enabled
    if (this.enableSync) {
      try {
        const syncEngine = getSyncEngine();
        if (syncEngine) {
          await syncEngine.addToQueue(
            this.storeName,
            String(recordWithTimestamp.id),
            "update",
            recordWithTimestamp
          );
        }
      } catch (error) {
        console.warn("Failed to add to sync queue:", error);
      }
    }
  }

  /**
   * Delete record and queue for sync
   */
  async delete(id: string | number): Promise<void> {
    // Delete from local database
    await super.delete(id);

    // Add to sync queue if sync is enabled
    if (this.enableSync) {
      try {
        const syncEngine = getSyncEngine();
        if (syncEngine) {
          await syncEngine.addToQueue(this.storeName, String(id), "delete", {
            id,
          });
        }
      } catch (error) {
        console.warn("Failed to add to sync queue:", error);
      }

      // Also push delete immediately via SmartSyncManager (since pushChanges
      // only scans existing records and deleted records are already gone)
      try {
        const { getSmartSync } = await import("../sync/SmartSyncManager");
        const smartSync = getSmartSync();
        await smartSync.notifyLocalChange(
          this.storeName,
          String(id),
          'delete',
          { id, is_deleted: true, local_updated_at: new Date().toISOString() }
        );
      } catch (error) {
        console.warn("Failed to notify SmartSync of delete:", error);
      }
    }
  }

  /**
   * Batch add with sync
   */
  async batchAdd(items: T[]): Promise<void> {
    // Add timestamps and mark as unsynced
    const itemsWithTimestamps = items.map((item) => ({
      ...item,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
    }));

    // Add to local database
    await super.batchAdd(itemsWithTimestamps);

    // Add to sync queue if sync is enabled
    if (this.enableSync) {
      try {
        const syncEngine = getSyncEngine();
        if (syncEngine) {
          for (const item of itemsWithTimestamps) {
            await syncEngine.addToQueue(
              this.storeName,
              String(item.id),
              "create",
              item
            );
          }
        }
      } catch (error) {
        console.warn("Failed to add batch to sync queue:", error);
      }
    }
  }

  /**
   * Batch update with sync
   */
  async batchUpdate(items: T[]): Promise<void> {
    // Update timestamps and mark as unsynced
    const itemsWithTimestamps = items.map((item) => ({
      ...item,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
    }));

    // Update in local database
    await super.batchUpdate(itemsWithTimestamps);

    // Add to sync queue if sync is enabled
    if (this.enableSync) {
      try {
        const syncEngine = getSyncEngine();
        if (syncEngine) {
          for (const item of itemsWithTimestamps) {
            await syncEngine.addToQueue(
              this.storeName,
              String(item.id),
              "update",
              item
            );
          }
        }
      } catch (error) {
        console.warn("Failed to add batch to sync queue:", error);
      }
    }
  }

  // Note: updateFromServer with id parameter is defined below in Smart Sync Methods

  /**
   * Batch update from server (no sync queue)
   */
  async batchUpdateFromServer(items: T[]): Promise<void> {
    await super.batchUpdate(items);
  }

  /**
   * Delete from server (no sync queue)
   */
  async deleteFromServer(id: string | number): Promise<void> {
    await super.delete(id);
  }

  // ==================== Smart Sync Methods ====================

  /**
   * Get all records that have been modified locally but not synced
   * These are records where local_updated_at > last_synced_at (or is_synced = false)
   */
  async getUnsyncedRecords(): Promise<T[]> {
    const allRecords = await super.getAll();
    return allRecords.filter((record: any) => {
      // If is_synced field exists and is false, it's unsynced
      if (record.is_synced === false) return true;

      // If last_synced_at exists and local_updated_at is newer, it's unsynced
      if (record.last_synced_at && record.local_updated_at) {
        return new Date(record.local_updated_at).getTime() > new Date(record.last_synced_at).getTime();
      }

      // If no last_synced_at at all, assume unsynced
      if (!record.last_synced_at && record.local_updated_at) {
        return true;
      }

      return false;
    });
  }

  /**
   * Mark a record as synced (update last_synced_at)
   */
  async markAsSynced(id: string | number): Promise<void> {
    const record = await this.getById(id);
    if (record) {
      const updated = {
        ...record,
        is_synced: true,
        last_synced_at: new Date().toISOString(),
      };
      await super.update(updated as T);
    }
  }

  /**
   * Create a record from server (no sync queue)
   * Used when pulling new records from server
   */
  async createFromServer(data: T): Promise<void> {
    const recordWithSyncStatus = {
      ...data,
      is_synced: true,
      last_synced_at: new Date().toISOString(),
    };
    await super.add(recordWithSyncStatus);
  }

  /**
   * Update record from server by ID (no sync queue)
   * Used when receiving updates from server to avoid circular sync
   */
  async updateFromServer(id: string | number, data: Partial<T>): Promise<void> {
    const existing = await this.getById(id);
    if (existing) {
      const updated = {
        ...existing,
        ...data,
        is_synced: true,
        last_synced_at: new Date().toISOString(),
      };
      await super.update(updated as T);
    } else {
      // Create if doesn't exist
      await this.createFromServer({ id, ...data } as T);
    }
  }

  /**
   * Get record by ID
   */
  async getById(id: string | number): Promise<T | undefined> {
    return await super.get(id);
  }


  /**
   * Mark all records as unsynced to force a full push
   */
  async markAllAsUnsynced(): Promise<void> {
    const allRecords = await super.getAll();
    const updates = allRecords.map((record: any) => ({
      ...record,
      is_synced: false,
      last_synced_at: null,
    }));
    await super.batchUpdate(updates);
  }

  /**
   * Get all records
   */
  async getAll(): Promise<T[]> {
    return await super.getAll();
  }
}


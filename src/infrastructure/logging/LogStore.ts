/**
 * LogStore - IndexedDB storage for logs
 * Uses a SEPARATE database from the main app to avoid migration issues
 */

import { LogEntry, LogFilter, LogStats, LogLevel, LogCategory, LOG_LEVEL_PRIORITY } from './types';

const DB_NAME = 'MASRPOS_LOGS';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

export class LogStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initPromise = null;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });

          // Indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('level_timestamp', ['level', 'timestamp'], { unique: false });
          store.createIndex('category_timestamp', ['category', 'timestamp'], { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private getDB(): IDBDatabase {
    if (!this.db) throw new Error('LogStore not initialized');
    return this.db;
  }

  /**
   * Add a single log entry
   */
  async add(entry: LogEntry): Promise<number> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(entry);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add multiple log entries in batch
   */
  async addBatch(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const entry of entries) {
        store.add(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get logs with filtering, sorting and pagination
   */
  async query(filter: LogFilter = {}): Promise<LogEntry[]> {
    const db = this.getDB();
    const limit = filter.limit || 500;
    const offset = filter.offset || 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const results: LogEntry[] = [];

      // Use cursor going backwards (newest first)
      const request = index.openCursor(null, 'prev');
      let skipped = 0;
      let collected = 0;

      // Prepare filter sets
      const levelFilter = filter.level
        ? Array.isArray(filter.level) ? new Set(filter.level) : new Set([filter.level])
        : null;
      const categoryFilter = filter.category
        ? Array.isArray(filter.category) ? new Set(filter.category) : new Set([filter.category])
        : null;
      const searchLower = filter.search?.toLowerCase();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || collected >= limit) {
          resolve(results);
          return;
        }

        const entry = cursor.value as LogEntry;

        // Apply filters
        let pass = true;

        if (levelFilter && !levelFilter.has(entry.level)) pass = false;
        if (pass && categoryFilter && !categoryFilter.has(entry.category)) pass = false;
        if (pass && filter.startDate && entry.timestamp < filter.startDate) pass = false;
        if (pass && filter.endDate && entry.timestamp > filter.endDate) pass = false;
        if (pass && searchLower) {
          const msgMatch = entry.message?.toLowerCase().includes(searchLower);
          const srcMatch = entry.source?.toLowerCase().includes(searchLower);
          const dataMatch = entry.data ? JSON.stringify(entry.data).toLowerCase().includes(searchLower) : false;
          if (!msgMatch && !srcMatch && !dataMatch) pass = false;
        }

        if (pass) {
          if (skipped < offset) {
            skipped++;
          } else {
            results.push(entry);
            collected++;
          }
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get total count of logs (optionally filtered by level)
   */
  async count(level?: LogLevel): Promise<number> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      let request: IDBRequest<number>;

      if (level) {
        const index = store.index('level');
        request = index.count(IDBKeyRange.only(level));
      } else {
        request = store.count();
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get statistics about stored logs
   */
  async getStats(): Promise<LogStats> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const total: IDBRequest<number> = store.count();
      const byLevel: Record<string, number> = {} as any;
      const byCategory: Record<string, number> = {} as any;

      // Initialize
      for (const level of Object.values(LogLevel)) byLevel[level] = 0;
      for (const cat of Object.values(LogCategory)) byCategory[cat] = 0;

      // Count by level
      const levelIndex = store.index('level');
      const levelPromises: Promise<void>[] = [];
      for (const level of Object.values(LogLevel)) {
        levelPromises.push(new Promise<void>((res) => {
          const req = levelIndex.count(IDBKeyRange.only(level));
          req.onsuccess = () => { byLevel[level] = req.result; res(); };
          req.onerror = () => res();
        }));
      }

      // Count by category
      const catIndex = store.index('category');
      const catPromises: Promise<void>[] = [];
      for (const cat of Object.values(LogCategory)) {
        catPromises.push(new Promise<void>((res) => {
          const req = catIndex.count(IDBKeyRange.only(cat));
          req.onsuccess = () => { byCategory[cat] = req.result; res(); };
          req.onerror = () => res();
        }));
      }

      // Get oldest and newest
      const timestampIndex = store.index('timestamp');
      let oldest: string | undefined;
      let newest: string | undefined;

      const oldestReq = timestampIndex.openCursor(null, 'next');
      oldestReq.onsuccess = () => {
        if (oldestReq.result) oldest = oldestReq.result.value.timestamp;
      };

      const newestReq = timestampIndex.openCursor(null, 'prev');
      newestReq.onsuccess = () => {
        if (newestReq.result) newest = newestReq.result.value.timestamp;
      };

      tx.oncomplete = () => {
        resolve({
          total: total.result,
          byLevel: byLevel as Record<LogLevel, number>,
          byCategory: byCategory as Record<LogCategory, number>,
          oldestEntry: oldest,
          newestEntry: newest,
        });
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete logs older than given date
   */
  async deleteOlderThan(dateString: string): Promise<number> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(dateString, true);
      let deleted = 0;

      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete all logs
   */
  async clear(): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Enforce max entries by deleting oldest
   */
  async enforceMaxEntries(maxEntries: number): Promise<number> {
    const currentCount = await this.count();
    if (currentCount <= maxEntries) return 0;

    const toDelete = currentCount - maxEntries;
    const db = this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      let deleted = 0;

      const request = index.openCursor(null, 'next');
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Export all logs as JSON array
   */
  async exportAll(): Promise<LogEntry[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

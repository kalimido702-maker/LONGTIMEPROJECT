import { IndexedDBClient } from "./IndexedDBClient";
import { QueryOptions, TransactionMode } from "./types";

/**
 * IndexedDBRepository - Generic CRUD operations
 * Single Responsibility: Data access operations
 * Open/Closed Principle: Extensible through inheritance
 */
export class IndexedDBRepository<T = any> {
  constructor(
    protected readonly client: IndexedDBClient,
    protected readonly storeName: string
  ) {}

  /**
   * Add new record
   */
  async add(data: T): Promise<void> {
    const db = this.client.getDatabase();

    if (!db.objectStoreNames.contains(this.storeName)) {
      console.error(`Store '${this.storeName}' not found. Needs migration.`);
      throw new Error(`Store '${this.storeName}' does not exist`);
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.add(data);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Update existing record
   */
  async update(data: T): Promise<void> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete record by ID
   */
  async delete(id: string | number): Promise<void> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get record by ID
   */
  async get(id: string | number): Promise<T | undefined> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all records
   */
  async getAll(): Promise<T[]> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get records by index
   */
  async getByIndex(indexName: string, value: any): Promise<T[]> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Find records with query options
   */
  async find(options: QueryOptions = {}): Promise<T[]> {
    const db = this.client.getDatabase();
    const results: T[] = [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      let source: IDBObjectStore | IDBIndex = store;
      if (options.index) {
        source = store.index(options.index);
      }

      const request = source.openCursor(options.range, options.direction);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);

          if (options.limit && results.length >= options.limit) {
            resolve(results);
            return;
          }

          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count records
   */
  async count(): Promise<number> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all records from store
   */
  async clear(): Promise<void> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Batch operations
   */
  async batchAdd(items: T[]): Promise<void> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      let completed = 0;
      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      for (const item of items) {
        const request = store.add(item);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Batch update
   */
  async batchUpdate(items: T[]): Promise<void> {
    const db = this.client.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      let completed = 0;
      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      for (const item of items) {
        const request = store.put(item);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      }
    });
  }
}

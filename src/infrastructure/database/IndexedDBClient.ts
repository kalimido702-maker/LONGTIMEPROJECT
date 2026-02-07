import { DatabaseConfig, StoreConfig } from "./types";

/**
 * IndexedDBClient - المسؤول عن الاتصال الأساسي بقاعدة البيانات
 * Single Responsibility: إدارة الاتصال والمعاملات فقط
 */
export class IndexedDBClient {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database connection
   */
  async init(
    onUpgrade: (db: IDBDatabase, event: IDBVersionChangeEvent) => void
  ): Promise<void> {
    if (this.db) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.name, this.config.version);

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
        this.db = (event.target as IDBOpenDBRequest).result;
        onUpgrade(this.db, event);
      };
    });

    return this.initPromise;
  }

  /**
   * Reset database (delete and recreate)
   */
  async reset(
    onUpgrade: (db: IDBDatabase, event: IDBVersionChangeEvent) => void
  ): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.initPromise = null;

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.config.name);

      deleteRequest.onsuccess = async () => {
        console.log("✅ Database deleted successfully");
        await this.init(onUpgrade);
        console.log("✅ Database recreated successfully");
        resolve();
      };

      deleteRequest.onerror = () => {
        console.error("❌ Failed to delete database");
        reject(deleteRequest.error);
      };

      deleteRequest.onblocked = () => {
        console.warn("⚠️ Database delete blocked. Please close all tabs.");
      };
    });
  }

  /**
   * Get database instance
   */
  getDatabase(): IDBDatabase {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Create object store with indexes
   */
  static createStore(db: IDBDatabase, config: StoreConfig): IDBObjectStore {
    if (db.objectStoreNames.contains(config.name)) {
      return null as any; // Store already exists
    }

    const store = db.createObjectStore(config.name, {
      keyPath: config.keyPath,
      autoIncrement: config.autoIncrement,
    });

    // Create indexes
    if (config.indexes) {
      for (const indexConfig of config.indexes) {
        store.createIndex(indexConfig.name, indexConfig.keyPath, {
          unique: indexConfig.unique || false,
        });
      }
    }

    return store;
  }

  /**
   * Check if store exists
   */
  hasStore(storeName: string): boolean {
    return this.db ? this.db.objectStoreNames.contains(storeName) : false;
  }
}

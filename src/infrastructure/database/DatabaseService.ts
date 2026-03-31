import { IndexedDBClient } from "./IndexedDBClient";
import { IndexedDBRepository } from "./IndexedDBRepository";
import { SyncableRepository } from "./SyncableRepository";
import { MigrationRunner } from "./migrations/MigrationRunner";
import { SeederRunner } from "./seeders/SeederRunner";
import { migration_v5 } from "./migrations/v5-shift-purchase-returns";
import { UserSeeder } from "./seeders/UserSeeder";
import { RoleSeeder } from "./seeders/RoleSeeder";
import { SettingsSeeder } from "./seeders/SettingsSeeder";
import { DB_VERSION } from "./migrations/schema.config";

/**
 * DatabaseService - Facade pattern للوصول لقاعدة البيانات
 * Single Responsibility: تنسيق بين المكونات المختلفة
 * 
 * Updated: Now uses SyncableRepository to enable automatic sync with backend
 */
export class DatabaseService {
  private client: IndexedDBClient;
  private migrationRunner: MigrationRunner;
  private seederRunner: SeederRunner;
  private repositories: Map<string, SyncableRepository<any>> = new Map();

  constructor(dbName: string = "MASRPOS", dbVersion: number = DB_VERSION) {
    this.client = new IndexedDBClient({ name: dbName, version: dbVersion });
    this.migrationRunner = new MigrationRunner();
    this.seederRunner = new SeederRunner(this.client);

    // Register migrations
    this.registerMigrations();

    // Register seeders
    this.registerSeeders();
  }

  /**
   * Initialize database
   */
  async initialize(): Promise<void> {
    await this.client.init((db, event) => {
      this.migrationRunner.run(db, event);
    });

    // Run seeders after initialization
    await this.seederRunner.runAll();

    console.log("✅ Database initialized successfully");
  }

  /**
   * Reset database
   */
  async reset(): Promise<void> {
    await this.client.reset((db, event) => {
      this.migrationRunner.run(db, event);
    });

    // Run seeders after reset
    await this.seederRunner.runAll();

    console.log("✅ Database reset successfully");
  }

  /**
   * Get repository for a store
   * Returns SyncableRepository to enable automatic sync with backend
   * 
   * @param storeName - Name of the IndexedDB store
   * @param enableSync - Enable sync (default: true). Set to false for stores that shouldn't sync
   */
  getRepository<T extends { id: string | number; local_updated_at?: string }>(
    storeName: string,
    enableSync: boolean = true
  ): SyncableRepository<T> {
    if (!this.repositories.has(storeName)) {
      this.repositories.set(
        storeName,
        new SyncableRepository<T>(this.client, storeName, enableSync)
      );
    }
    return this.repositories.get(storeName) as SyncableRepository<T>;
  }

  /**
   * Get client (for advanced operations)
   */
  getClient(): IndexedDBClient {
    return this.client;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.client.isInitialized();
  }

  /**
   * Register all migrations
   */
  private registerMigrations(): void {
    this.migrationRunner.register(migration_v5);
    // Add more migrations here as needed
  }

  /**
   * Register all seeders
   */
  private registerSeeders(): void {
    this.seederRunner.register(new UserSeeder());
    this.seederRunner.register(new RoleSeeder());
    this.seederRunner.register(new SettingsSeeder());
    // Add more seeders here as needed
  }
}

// Singleton instance
let databaseServiceInstance: DatabaseService | null = null;

/**
 * Get DatabaseService singleton instance
 */
export function getDatabaseService(): DatabaseService {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}

/**
 * Initialize database (convenience function)
 */
export async function initializeDatabase(): Promise<DatabaseService> {
  const service = getDatabaseService();
  if (!service.isInitialized()) {
    await service.initialize();
  }
  return service;
}

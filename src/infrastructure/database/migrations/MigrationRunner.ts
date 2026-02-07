import { Migration } from "./Migration.interface";
import { IndexedDBClient } from "../IndexedDBClient";
import { STORES_SCHEMA } from "./schema.config";

/**
 * MigrationRunner - إدارة الـ migrations
 * Single Responsibility: تشغيل وإدارة migrations فقط
 */
export class MigrationRunner {
  private migrations: Migration[] = [];

  /**
   * Register migration
   */
  register(migration: Migration): void {
    this.migrations.push(migration);
    // Sort by version
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Run all migrations
   */
  run(db: IDBDatabase, event: IDBVersionChangeEvent): void {
    const oldVersion = event.oldVersion;
    const newVersion = event.newVersion || 0;

    console.log(`🔄 Running migrations from v${oldVersion} to v${newVersion}`);

    // Create all stores from schema
    for (const storeConfig of STORES_SCHEMA) {
      IndexedDBClient.createStore(db, storeConfig);
    }

    // Run version-specific migrations
    const transaction = (event.target as IDBOpenDBRequest).transaction!;

    for (const migration of this.migrations) {
      if (migration.version > oldVersion && migration.version <= newVersion) {
        console.log(
          `📝 Running migration: ${migration.name} (v${migration.version})`
        );
        migration.up(db, transaction);
      }
    }

    console.log("✅ Migrations completed");
  }

  /**
   * Get migration by version
   */
  getMigration(version: number): Migration | undefined {
    return this.migrations.find((m) => m.version === version);
  }

  /**
   * Get all migrations
   */
  getAllMigrations(): Migration[] {
    return [...this.migrations];
  }
}

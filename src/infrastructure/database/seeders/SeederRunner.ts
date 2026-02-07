import { BaseSeeder, Seeder } from "./Seeder.interface";
import { IndexedDBClient } from "../IndexedDBClient";
import { IndexedDBRepository } from "../IndexedDBRepository";

/**
 * SeederRunner - إدارة تشغيل الـ Seeders
 */
export class SeederRunner {
  private seeders: Seeder[] = [];

  constructor(private client: IndexedDBClient) {}

  /**
   * Register seeder
   */
  register(seeder: Seeder): void {
    this.seeders.push(seeder);
  }

  /**
   * Run all seeders
   */
  async runAll(): Promise<void> {
    console.log("🌱 Running seeders...");

    for (const seeder of this.seeders) {
      try {
        // Create repository for this seeder's store
        // We'll need to infer the store name from the seeder
        const storeName = this.getStoreNameForSeeder(seeder);
        const repository = new IndexedDBRepository(this.client, storeName);

        const shouldRun = await seeder.shouldRun(repository);

        if (shouldRun) {
          console.log(`🌱 Running: ${seeder.name}`);
          await seeder.seed(repository);
        } else {
          console.log(`⏭️  Skipping: ${seeder.name} (already seeded)`);
        }
      } catch (error) {
        console.error(`❌ Error in ${seeder.name}:`, error);
      }
    }

    console.log("✅ Seeders completed");
  }

  /**
   * Get store name for seeder (based on seeder name convention)
   */
  private getStoreNameForSeeder(seeder: Seeder): string {
    const name = seeder.name.toLowerCase();

    if (name.includes("user")) return "users";
    if (name.includes("role")) return "roles";
    if (name.includes("setting")) return "settings";
    if (name.includes("unit")) return "units";
    if (name.includes("pricetype")) return "priceTypes";
    if (name.includes("paymentmethod")) return "paymentMethods";

    // Default fallback
    return "settings";
  }
}

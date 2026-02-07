import { IndexedDBRepository } from "../IndexedDBRepository";
import { User, Unit, PriceType, PaymentMethod } from "@/domain/entities/Index";

/**
 * Seeder interface
 */
export interface Seeder {
  name: string;
  shouldRun(repository: IndexedDBRepository): Promise<boolean>;
  seed(repository: IndexedDBRepository): Promise<void>;
}

/**
 * Base Seeder class
 */
export abstract class BaseSeeder implements Seeder {
  abstract name: string;
  abstract shouldRun(repository: IndexedDBRepository): Promise<boolean>;
  abstract seed(repository: IndexedDBRepository): Promise<void>;

  protected log(message: string): void {
    console.log(`[${this.name}] ${message}`);
  }
}

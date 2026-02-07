import { BaseSeeder } from "./Seeder.interface";
import { IndexedDBRepository } from "../IndexedDBRepository";
import { User } from "@/domain/entities/Index";

/**
 * UserSeeder - إضافة مستخدم admin افتراضي
 */
export class UserSeeder extends BaseSeeder {
  name = "UserSeeder";

  async shouldRun(repository: IndexedDBRepository<User>): Promise<boolean> {
    const count = await repository.count();
    return count === 0;
  }

  async seed(repository: IndexedDBRepository<User>): Promise<void> {
    const adminUser: User = {
      id: "1",
      username: "admin",
      password: "admin123", // TODO: Hash password in production
      name: "المدير العام",
      role: "admin",
      active: true,
      createdAt: new Date().toISOString(),
    };

    await repository.add(adminUser);
    this.log("✅ Admin user created");
  }
}

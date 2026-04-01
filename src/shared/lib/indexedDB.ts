import {
  getDatabaseService,
  initializeDatabase,
} from "@/infrastructure/database/DatabaseService";
import type { Role } from "@/domain/entities/Index";

/**
 * Legacy IndexedDBService wrapper for backward compatibility
 * This provides the same interface as the old IndexedDBService
 * but uses the new Clean Architecture implementation under the hood
 */
class IndexedDBService {
  private get service() {
    return getDatabaseService();
  }

  async init(): Promise<void> {
    await initializeDatabase();
  }

  async resetDatabase(): Promise<void> {
    await this.service.reset();
  }

  async add<T extends { id: string | number; local_updated_at?: string }>(storeName: string, data: T): Promise<void> {
    const repo = this.service.getRepository<T>(storeName);
    return repo.add(data);
  }

  async update<T extends { id: string | number; local_updated_at?: string }>(storeName: string, data: T): Promise<void> {
    const repo = this.service.getRepository<T>(storeName);
    return repo.update(data);
  }

  async delete(storeName: string, id: string): Promise<void> {
    const repo = this.service.getRepository(storeName);
    return repo.delete(id);
  }

  async get<T extends { id: string | number; local_updated_at?: string }>(storeName: string, id: string): Promise<T | undefined> {
    const repo = this.service.getRepository<T>(storeName);
    return repo.get(id);
  }

  async getAll<T extends { id: string | number; local_updated_at?: string }>(storeName: string): Promise<T[]> {
    const repo = this.service.getRepository<T>(storeName);
    return repo.getAll();
  }

  async getByIndex<T extends { id: string | number; local_updated_at?: string }>(
    storeName: string,
    indexName: string,
    value: any
  ): Promise<T[]> {
    const repo = this.service.getRepository<T>(storeName);
    return repo.getByIndex(indexName, value);
  }

  async clear(storeName: string): Promise<void> {
    const repo = this.service.getRepository(storeName);
    return repo.clear();
  }

  // Legacy methods that are now handled by seeders
  async initDefaultData(): Promise<void> {
    // Data is now seeded automatically during initialization
    console.log("ℹ️  initDefaultData is now handled by seeders");
  }

  async initializeDefaultRoles(): Promise<void> {
    // Roles are now seeded automatically during initialization
    console.log("ℹ️  initializeDefaultRoles is now handled by seeders");
  }

  async migrateRolesPermissions(): Promise<void> {
    // Add Viewer role if it doesn't exist
    // Update Admin Role
    const adminRole = await this.get<Role>("roles", "admin");
    if (adminRole) {
      const currentInvoicePerms = adminRole.permissions.invoices || [];
      const newInvoicePerms = ["edit", "delete"];
      const updatedInvoicePerms = [...new Set([...currentInvoicePerms, ...newInvoicePerms])];

      const currentReturnsPerms = adminRole.permissions.returns || [];
      const updatedReturnsPerms = [...new Set([...currentReturnsPerms, "edit", "delete"])];

      const currentPaymentsPerms = adminRole.permissions.payments || [];
      const updatedPaymentsPerms = [...new Set([...currentPaymentsPerms, "view", "edit"])];

      // إضافة صلاحيات القبض
      const currentCollectionsPerms = adminRole.permissions.collections || [];
      const updatedCollectionsPerms = [...new Set([...currentCollectionsPerms, "view", "create", "edit", "delete"])];

      // إضافة صلاحيات تطبيق الجوال
      const currentMobileAppPerms = adminRole.permissions.mobile_app || [];
      const updatedMobileAppPerms = [...new Set([...currentMobileAppPerms, "home", "due", "invoices", "payments", "statement", "customers", "sales_reps", "supervisors", "create_invoice", "create_payment"])];

      const needsUpdate = updatedInvoicePerms.length !== currentInvoicePerms.length ||
        updatedReturnsPerms.length !== currentReturnsPerms.length ||
        updatedPaymentsPerms.length !== currentPaymentsPerms.length ||
        updatedCollectionsPerms.length !== currentCollectionsPerms.length ||
        updatedMobileAppPerms.length !== currentMobileAppPerms.length;

      if (needsUpdate) {
        await this.update("roles", {
          ...adminRole,
          permissions: {
            ...adminRole.permissions,
            invoices: updatedInvoicePerms,
            returns: updatedReturnsPerms,
            payments: updatedPaymentsPerms,
            collections: updatedCollectionsPerms,
            mobile_app: updatedMobileAppPerms,
          }
        });
      }
    }
    try {
      const existingViewer = await this.get<any>("roles", "viewer");
      if (!existingViewer) {
        const viewerRole = {
          id: "viewer",
          name: "مطّلع",
          nameEn: "viewer",
          description: "صلاحيات الاطلاع فقط - للعرض بدون تعديل",
          color: "bg-gray-500",
          isDefault: true,
          createdAt: new Date().toISOString(),
          permissions: {
            invoices: ["view"],
            products: ["view"],
            customers: ["view"],
            suppliers: ["view"],
            purchases: ["view"],
            employees: ["view"],
            reports: ["view"],
            settings: [],
            shifts: ["view"],
            credit: ["view"],
            installments: ["view"],
            promotions: ["view"],
            restaurant: ["view"],
            collections: ["view"],
            returns: ["view"],
            depositSources: ["view"],
            deposits: ["view"],
            expenseCategories: ["view"],
            expenses: ["view"],
            employeeAdvances: ["view"],
            mobile_app: ["home", "due", "invoices", "payments", "statement"],
          },
        };
        await this.add("roles", viewerRole);
        console.log("✅ Added Viewer role to existing database");
      }
    } catch (error) {
      console.warn("Could not migrate Viewer role:", error);
    }
  }

  async migrateToV12(): Promise<void> {
    // Handled by migrations
    console.log("ℹ️  migrateToV12 is now handled by migrations");
  }

  // Domain-specific methods (these should eventually move to services)
  async isCategoryNameExists(
    nameAr: string,
    excludeId?: string
  ): Promise<boolean> {
    const repo = this.service.getRepository("productCategories");
    const categories = await repo.getAll();
    return categories.some(
      (cat: any) =>
        cat.nameAr.toLowerCase() === nameAr.toLowerCase() &&
        cat.id !== excludeId
    );
  }

  async getProductsByCategory(categoryName: string): Promise<any[]> {
    const repo = this.service.getRepository("products");
    const products = await repo.getAll();
    return products.filter((product: any) => product.category === categoryName);
  }

  async clearCategoryFromProducts(categoryName: string): Promise<void> {
    const products = await this.getProductsByCategory(categoryName);
    const repo = this.service.getRepository("products");

    for (const product of products) {
      product.category = "";
      await repo.update(product);
    }
  }
}

export const db = new IndexedDBService();

// Re-export types for backward compatibility
export type {
  User,
  Unit,
  ProductUnit,
  Warehouse,
  Employee,
  ProductStock,
  PriceType,
  PaymentMethod,
  Customer,
  ProductCategory,
  Product,
  Invoice,
  InvoiceItem,
  Payment,
  Expense,
  ExpenseCategory,
  ExpenseItem,
  Supplier,
  Purchase,
  PurchaseItem,
  PurchasePayment,
  RestaurantTable,
  Hall,
  Promotion,
  Role,
  Printer,
  PaymentApp,
  Setting,
  SalesReturn,
  SalesReturnItem,
  PurchaseReturn,
  PurchaseReturnItem,
  Shift,
  ShiftSales,
  AuditLog,
  CashMovement,
  DepositSource,
  Deposit,
  EmployeeAdvance,
  EmployeeDeduction,
  WhatsAppAccount,
  WhatsAppMessage,
  WhatsAppCampaign,
  WhatsAppTask,
  CartItem,
  PendingOrder,
  Supervisor,
  SalesRep,
  CustomerPhone,
  CustomerIdentification,
} from "@/domain/entities/Index";



import { StoreConfig } from "../types";

// DB Version
export const DB_VERSION = 20;
export const DB_NAME = "MyPOS_DB";

// تعريف كل الـ Object Stores بشكل منظم
export const STORES_SCHEMA: StoreConfig[] = [
  {
    name: "users",
    keyPath: "id",
    indexes: [{ name: "username", keyPath: "username", unique: true }],
  },
  {
    name: "customers",
    keyPath: "id",
    indexes: [{ name: "phone", keyPath: "phone", unique: false }],
  },
  {
    name: "products",
    keyPath: "id",
    indexes: [
      { name: "barcode", keyPath: "barcode", unique: false },
      { name: "category", keyPath: "category", unique: false },
    ],
  },
  {
    name: "invoices",
    keyPath: "id",
    indexes: [
      { name: "customerId", keyPath: "customerId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "invoiceItems",
    keyPath: "id",
    indexes: [
      { name: "invoiceId", keyPath: "invoiceId", unique: false },
      { name: "productId", keyPath: "productId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "payments",
    keyPath: "id",
    indexes: [
      { name: "invoiceId", keyPath: "invoiceId", unique: false },
      { name: "customerId", keyPath: "customerId", unique: false },
    ],
  },
  {
    name: "expenses",
    keyPath: "id",
    indexes: [{ name: "createdAt", keyPath: "createdAt", unique: false }],
  },
  {
    name: "suppliers",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "employees",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "tables",
    keyPath: "id",
    indexes: [{ name: "hallId", keyPath: "hallId", unique: false }],
  },
  {
    name: "halls",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "promotions",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "printers",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "paymentApps",
    keyPath: "id",
    indexes: [],
  },
  {
    name: "settings",
    keyPath: "key",
    indexes: [{ name: "category", keyPath: "category", unique: false }],
  },
  {
    name: "salesReturns",
    keyPath: "id",
    indexes: [
      {
        name: "originalInvoiceId",
        keyPath: "originalInvoiceId",
        unique: false,
      },
      { name: "customerId", keyPath: "customerId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "purchaseReturns",
    keyPath: "id",
    indexes: [
      {
        name: "originalPurchaseId",
        keyPath: "originalPurchaseId",
        unique: false,
      },
      { name: "supplierId", keyPath: "supplierId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "shifts",
    keyPath: "id",
    indexes: [
      { name: "employeeId", keyPath: "employeeId", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "startTime", keyPath: "startTime", unique: false },
    ],
  },
  {
    name: "auditLogs",
    keyPath: "id",
    indexes: [
      { name: "action", keyPath: "action", unique: false },
      { name: "entity", keyPath: "entity", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
      { name: "refId", keyPath: "refId", unique: false },
    ],
  },
  {
    name: "cashMovements",
    keyPath: "id",
    indexes: [
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "type", keyPath: "type", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "roles",
    keyPath: "id",
    indexes: [
      { name: "nameEn", keyPath: "nameEn", unique: true },
      { name: "isDefault", keyPath: "isDefault", unique: false },
    ],
  },
  {
    name: "depositSources",
    keyPath: "id",
    indexes: [{ name: "active", keyPath: "active", unique: false }],
  },
  {
    name: "deposits",
    keyPath: "id",
    indexes: [
      { name: "sourceId", keyPath: "sourceId", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "expenseCategories",
    keyPath: "id",
    indexes: [{ name: "active", keyPath: "active", unique: false }],
  },
  {
    name: "expenseItems",
    keyPath: "id",
    indexes: [
      { name: "categoryId", keyPath: "categoryId", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "employeeAdvances",
    keyPath: "id",
    indexes: [
      { name: "employeeId", keyPath: "employeeId", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "employeeDeductions",
    keyPath: "id",
    indexes: [
      { name: "employeeId", keyPath: "employeeId", unique: false },
      { name: "type", keyPath: "type", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "startDate", keyPath: "startDate", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "productCategories",
    keyPath: "id",
    indexes: [
      { name: "name", keyPath: "name", unique: false },
      { name: "nameAr", keyPath: "nameAr", unique: true },
      { name: "active", keyPath: "active", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "whatsappAccounts",
    keyPath: "id",
    indexes: [
      { name: "phone", keyPath: "phone", unique: true },
      { name: "status", keyPath: "status", unique: false },
      { name: "isActive", keyPath: "isActive", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "whatsappMessages",
    keyPath: "id",
    indexes: [
      { name: "accountId", keyPath: "accountId", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "to", keyPath: "to", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "whatsappCampaigns",
    keyPath: "id",
    indexes: [
      { name: "accountId", keyPath: "accountId", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "targetType", keyPath: "targetType", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "whatsappTasks",
    keyPath: "id",
    indexes: [
      { name: "accountId", keyPath: "accountId", unique: false },
      { name: "type", keyPath: "type", unique: false },
      { name: "status", keyPath: "status", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "units",
    keyPath: "id",
    indexes: [
      { name: "name", keyPath: "name", unique: true },
      { name: "isDefault", keyPath: "isDefault", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "priceTypes",
    keyPath: "id",
    indexes: [
      { name: "name", keyPath: "name", unique: true },
      { name: "displayOrder", keyPath: "displayOrder", unique: false },
      { name: "isDefault", keyPath: "isDefault", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "paymentMethods",
    keyPath: "id",
    indexes: [
      { name: "name", keyPath: "name", unique: true },
      { name: "type", keyPath: "type", unique: false },
      { name: "isActive", keyPath: "isActive", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "productUnits",
    keyPath: "id",
    indexes: [
      { name: "productId", keyPath: "productId", unique: false },
      { name: "unitId", keyPath: "unitId", unique: false },
      { name: "barcode", keyPath: "barcode", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "warehouses",
    keyPath: "id",
    indexes: [
      { name: "nameAr", keyPath: "nameAr", unique: true },
      { name: "isDefault", keyPath: "isDefault", unique: false },
      { name: "isActive", keyPath: "isActive", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "productStock",
    keyPath: "id",
    indexes: [
      { name: "productId", keyPath: "productId", unique: false },
      { name: "warehouseId", keyPath: "warehouseId", unique: false },
      {
        name: "productWarehouse",
        keyPath: ["productId", "warehouseId"],
        unique: true,
      },
      { name: "updatedAt", keyPath: "updatedAt", unique: false },
    ],
  },
  {
    name: "purchases",
    keyPath: "id",
    indexes: [
      { name: "supplierId", keyPath: "supplierId", unique: false },
      { name: "paymentStatus", keyPath: "paymentStatus", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "purchasePayments",
    keyPath: "id",
    indexes: [
      { name: "purchaseId", keyPath: "purchaseId", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "shiftId", keyPath: "shiftId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "supervisors",
    keyPath: "id",
    indexes: [
      { name: "phone", keyPath: "phone", unique: false },
      { name: "isActive", keyPath: "isActive", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "salesReps",
    keyPath: "id",
    indexes: [
      { name: "supervisorId", keyPath: "supervisorId", unique: false },
      { name: "phone", keyPath: "phone", unique: false },
      { name: "isActive", keyPath: "isActive", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "purchaseItems",
    keyPath: "id",
    indexes: [
      { name: "purchaseId", keyPath: "purchaseId", unique: false },
      { name: "productId", keyPath: "productId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "supervisorBonuses",
    keyPath: "id",
    indexes: [
      { name: "supervisorId", keyPath: "supervisorId", unique: false },
      { name: "periodStart", keyPath: "periodStart", unique: false },
      { name: "periodEnd", keyPath: "periodEnd", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
  {
    name: "customerBonuses",
    keyPath: "id",
    indexes: [
      { name: "customerId", keyPath: "customerId", unique: false },
      { name: "type", keyPath: "type", unique: false },
      { name: "periodStart", keyPath: "periodStart", unique: false },
      { name: "periodEnd", keyPath: "periodEnd", unique: false },
      { name: "userId", keyPath: "userId", unique: false },
      { name: "createdAt", keyPath: "createdAt", unique: false },
    ],
  },
];


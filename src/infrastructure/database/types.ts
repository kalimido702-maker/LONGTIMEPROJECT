// Database configuration types
export interface DatabaseConfig {
  name: string;
  version: number;
}

// Store configuration for object stores
export interface StoreConfig {
  name: string;
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: IndexConfig[];
}

export interface IndexConfig {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
}

// Transaction types
export type TransactionMode = "readonly" | "readwrite" | "versionchange";

// Query options
export interface QueryOptions {
  index?: string;
  direction?: IDBCursorDirection;
  range?: IDBKeyRange;
  limit?: number;
}

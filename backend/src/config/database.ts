import mysql from "mysql2/promise";
import { env } from "./env.js";

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
}

const config: DatabaseConfig = {
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  database: env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Create connection pool
export const pool = mysql.createPool(config);

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL connection established successfully");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ MySQL connection failed:", error);
    return false;
  }
}

// Execute query with streaming support
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

// Execute query with streaming for large results
export async function queryStream(sql: string, params?: any[]): Promise<any> {
  const connection = await pool.getConnection();
  const queryable = connection as any;
  return queryable
    .query(sql, params)
    .stream({
      highWaterMark: 5,
    })
    .on("end", () => {
      connection.release();
    });
}

// Database object for compatibility
export const db = {
  query: pool.query.bind(pool),
  execute: pool.execute.bind(pool),
  getConnection: pool.getConnection.bind(pool),
  streamQuery: queryStream,
};

// Begin transaction
export async function beginTransaction() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  console.log("✅ MySQL pool closed");
}

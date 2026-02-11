/**
 * Database Factory - Auto-detection with SQLite fallback
 * 
 * Tries MySQL first, falls back to SQLite if MySQL is unavailable.
 * Provides unified query interface for both databases.
 */

import mysql from "mysql2/promise";
import BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";
import { env } from "./env.js";

// Database type
export type DatabaseType = "mysql" | "sqlite";

// Unified query result types
export interface QueryResult<T = any> {
    rows: T[];
    affectedRows?: number;
    insertId?: number;
}

// Database connection interface
export interface DatabaseConnection {
    type: DatabaseType;
    query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
    execute<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
    close(): Promise<void>;
    isConnected(): boolean;
}

// Pool connection interface (for transactions)
export interface PoolConnection {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
    release(): void;
}

// MySQL connection wrapper
class MySQLConnection implements DatabaseConnection {
    type: DatabaseType = "mysql";
    private pool: mysql.Pool;

    constructor(pool: mysql.Pool) {
        this.pool = pool;
    }

    // Convert ISO datetime strings (2026-02-11T01:32:20.749Z) to MySQL format (2026-02-11 01:32:20)
    private sanitizeParams(params?: any[]): any[] {
        if (!params) return [];
        return params.map(p => {
            if (p === undefined) return null;
            if (p instanceof Date) return p.toISOString().slice(0, 19).replace('T', ' ');
            if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p)) {
                return p.slice(0, 19).replace('T', ' ');
            }
            return p;
        });
    }

    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        const [rows, fields] = await this.pool.query(sql, this.sanitizeParams(params));
        return {
            rows: rows as T[],
            affectedRows: (rows as any).affectedRows,
            insertId: (rows as any).insertId,
        };
    }

    async execute<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        const [rows] = await this.pool.execute(sql, this.sanitizeParams(params));
        return {
            rows: rows as T[],
            affectedRows: (rows as any).affectedRows,
            insertId: (rows as any).insertId,
        };
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    isConnected(): boolean {
        return true;
    }
}

// SQLite connection wrapper
class SQLiteConnection implements DatabaseConnection {
    type: DatabaseType = "sqlite";
    private db: BetterSqlite3.Database;

    constructor(dbPath: string) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new BetterSqlite3(dbPath);

        // Enable foreign keys
        this.db.pragma("foreign_keys = ON");

        // Enable WAL mode for better performance
        this.db.pragma("journal_mode = WAL");

        logger.info(`SQLite database opened at: ${dbPath}`);
    }

    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        return this.execute<T>(sql, params);
    }

    async execute<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        try {
            // Handle MySQL ?? identifier placeholders (for table/column names)
            // Replace ?? with the actual table/column name from params
            let processedSql = sql;
            let processedParams = params ? [...params] : [];

            // Replace all ?? placeholders with quoted identifiers
            let paramIndex = 0;
            processedSql = sql.replace(/\?\?/g, () => {
                if (processedParams && paramIndex < processedParams.length) {
                    const identifier = processedParams[paramIndex];
                    // Remove this param from the array
                    processedParams.splice(paramIndex, 1);
                    // Return quoted identifier for SQLite (using double quotes)
                    return `"${identifier}"`;
                }
                return '??'; // Keep as-is if no param available
            });

            // Convert MySQL placeholders to SQLite format
            const sqliteSql = this.convertMySQLToSQLite(processedSql);
            const sqliteParams = this.convertParams(processedParams);

            // Debug: log first 500 chars of converted SQL
            if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE')) {
                logger.debug({ originalSql: sql.substring(0, 200), convertedSql: sqliteSql.substring(0, 500) }, "SQL conversion debug");
            }

            // Check if conversion produced multiple statements (semicolon-separated)
            // This happens with multi-column ALTER TABLE
            const statements = sqliteSql.split(/;\s*\n/).filter(s => s.trim() && !s.trim().startsWith('--'));

            let totalAffectedRows = 0;
            let lastInsertId = 0;

            for (const stmtSql of statements) {
                const trimmedSql = stmtSql.trim();
                if (!trimmedSql || trimmedSql.length < 5) continue;

                // Determine if it's a SELECT query
                const isSelect = trimmedSql.toUpperCase().startsWith("SELECT");

                if (isSelect) {
                    const stmt = this.db.prepare(trimmedSql);
                    const rows = stmt.all(...sqliteParams) as T[];
                    return { rows };
                } else {
                    const stmt = this.db.prepare(trimmedSql);
                    // Only pass params to first statement (others are generated)
                    const result = statements.indexOf(stmtSql) === 0
                        ? stmt.run(...sqliteParams)
                        : stmt.run();
                    totalAffectedRows += result.changes;
                    lastInsertId = result.lastInsertRowid as number;
                }
            }

            return {
                rows: [] as T[],
                affectedRows: totalAffectedRows,
                insertId: lastInsertId,
            };
        } catch (error: any) {
            // Skip certain non-fatal errors
            if (error.message?.includes("duplicate column") ||
                error.message?.includes("already exists") ||
                error.message?.includes("no such table") && sql.includes("ALTER TABLE")) {
                logger.debug({ sql: sql.substring(0, 100) }, "SQLite: skipping non-fatal error");
                return { rows: [] as T[], affectedRows: 0, insertId: 0 };
            }
            logger.error({ error: { code: error.code, message: error.message }, sql, params }, "SQLite query error");
            throw error;
        }
    }

    private convertMySQLToSQLite(sql: string): string {
        // Process line by line to remove INDEX and FOREIGN KEY statements
        const lines = sql.split('\n');
        const cleanedLines: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim().toUpperCase();

            // Skip lines that are INDEX, KEY, or FOREIGN KEY definitions
            if (trimmed.startsWith('INDEX ') ||
                trimmed.startsWith('KEY ') ||
                trimmed.startsWith('UNIQUE KEY ') ||
                trimmed.startsWith('UNIQUE INDEX ') ||
                trimmed.startsWith('FOREIGN KEY') ||
                trimmed.startsWith('CONSTRAINT ')) {
                continue;
            }

            // Skip lines that start with comma and are INDEX/FK
            if (trimmed.startsWith(',') && (
                trimmed.includes('INDEX ') ||
                trimmed.includes(' KEY ') ||
                trimmed.includes('FOREIGN KEY') ||
                trimmed.includes('CONSTRAINT ')
            )) {
                continue;
            }

            cleanedLines.push(line);
        }

        let converted = cleanedLines.join('\n');

        // Remove backticks (SQLite doesn't use them, uses double quotes)
        converted = converted.replace(/`/g, '');

        // Remove "IF NOT EXISTS" from ADD COLUMN (SQLite doesn't support it)
        // Must run BEFORE multi-column ALTER handling
        converted = converted.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, "ADD COLUMN");

        // Remove AFTER clause in ADD COLUMN (SQLite doesn't support it)
        // Must run BEFORE multi-column ALTER handling
        converted = converted.replace(/\s+AFTER\s+\w+/gi, "");

        // Handle multi-column ALTER TABLE - SQLite only supports one column per ALTER
        // Match patterns like: ALTER TABLE x ADD COLUMN y..., ADD COLUMN z...
        if (/ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN.+,\s*\n?\s*ADD\s+COLUMN/i.test(converted)) {
            const match = converted.match(/ALTER\s+TABLE\s+(\w+)\s+/i);
            if (match) {
                const tableName = match[1];
                const addClauses = converted.match(/ADD\s+COLUMN\s+[^,]+(?:,|$)/gi);
                if (addClauses && addClauses.length > 1) {
                    const statements = addClauses.map(clause => {
                        let cleanClause = clause.replace(/,\s*$/, '');
                        return `ALTER TABLE ${tableName} ${cleanClause}`;
                    });
                    converted = statements.join(';\n');
                }
            }
        }

        // Remove ALTER TABLE MODIFY/CHANGE (SQLite doesn't support)
        if (/ALTER\s+TABLE\s+\w+\s+(MODIFY|CHANGE)\s+/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Remove ALTER TABLE DROP INDEX/DROP COLUMN (SQLite doesn't support)
        if (/ALTER\s+TABLE\s+\w+\s+DROP\s+(INDEX|COLUMN)\s+/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Remove ALTER TABLE ADD INDEX (SQLite doesn't support inline)
        if (/ALTER\s+TABLE\s+\w+\s+ADD\s+INDEX\s+/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Remove ALTER TABLE ADD CONSTRAINT (SQLite doesn't support adding constraints after creation)
        if (/ALTER\s+TABLE\s+\w+\s+ADD\s+CONSTRAINT\s+/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip DESCRIBE/SHOW statements (MySQL only)
        if (/^\s*(DESCRIBE|SHOW)/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip SET statements with variables (@) - MySQL only
        if (/^\s*SET\s+@/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip INFORMATION_SCHEMA queries - MySQL only
        if (/INFORMATION_SCHEMA/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip DELIMITER statements - MySQL only
        if (/^\s*DELIMITER/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip MySQL prepared statements (PREPARE, EXECUTE, DEALLOCATE)
        if (/^\s*(PREPARE|EXECUTE|DEALLOCATE)/i.test(converted)) {
            return '-- SQLite: skipped';
        }

        // Skip CREATE INDEX without IF NOT EXISTS (may fail on re-run)
        // Just convert to IF NOT EXISTS
        converted = converted.replace(/CREATE\s+INDEX\s+(?!IF)/gi, "CREATE INDEX IF NOT EXISTS ");

        // Remove "IF NOT EXISTS" from ADD COLUMN (SQLite doesn't support it)
        converted = converted.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, "ADD COLUMN");

        // Remove AFTER clause in ADD COLUMN (SQLite doesn't support it)
        converted = converted.replace(/\s+AFTER\s+\w+/gi, "");

        // Now apply the simpler regex transformations

        // Special case: INT AUTO_INCREMENT PRIMARY KEY -> INTEGER PRIMARY KEY AUTOINCREMENT
        converted = converted.replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");

        // INT -> INTEGER (generic, must come after AUTO_INCREMENT handling)
        converted = converted.replace(/\bINT\b(?!\s*\()/gi, "INTEGER");

        // AUTO_INCREMENT -> AUTOINCREMENT (for any remaining cases)
        converted = converted.replace(/AUTO_INCREMENT/gi, "AUTOINCREMENT");

        // UNSIGNED -> (remove)
        converted = converted.replace(/\s+UNSIGNED/gi, "");

        // DATETIME/TIMESTAMP -> TEXT (only when used as column type, not as function)
        // Match DATETIME or TIMESTAMP only when NOT followed by ( which would indicate function call
        converted = converted.replace(/\bDATETIME\b(?!\s*\()/gi, "TEXT");
        converted = converted.replace(/\bTIMESTAMP\b(?!\s*\()/gi, "TEXT");

        // DEFAULT CURRENT_TIMESTAMP -> DEFAULT (datetime('now'))
        converted = converted.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, "DEFAULT (datetime('now'))");

        // ON UPDATE CURRENT_TIMESTAMP -> (remove)
        converted = converted.replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, "");

        // ENGINE, CHARSET, COLLATE -> (remove)
        converted = converted.replace(/ENGINE\s*=\s*\w+/gi, "");
        converted = converted.replace(/DEFAULT\s+CHARSET\s*=\s*\w+/gi, "");
        converted = converted.replace(/COLLATE\s*=?\s*[\w_]+/gi, "");
        converted = converted.replace(/CHARACTER\s+SET\s+\w+/gi, "");

        // DECIMAL(x,y) -> REAL
        converted = converted.replace(/DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "REAL");

        // ENUM(...) -> TEXT
        converted = converted.replace(/ENUM\s*\([^)]+\)/gi, "TEXT");

        // COMMENT '...' -> (remove)
        converted = converted.replace(/COMMENT\s+'[^']*'/gi, "");

        // MySQL specific INSERT handling
        // UUID() -> lower(hex(randomblob(4))) || '-' || ... (generate a pseudo-UUID)
        converted = converted.replace(/\bUUID\(\)/gi, "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))");

        // ON DUPLICATE KEY UPDATE ... -> Convert to INSERT OR IGNORE (simpler approach)
        converted = converted.replace(/\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE\s+[^;]+/gi, ") ON CONFLICT DO NOTHING");

        // INSERT IGNORE -> INSERT OR IGNORE
        converted = converted.replace(/INSERT\s+IGNORE/gi, "INSERT OR IGNORE");

        // INT(n) -> INTEGER
        converted = converted.replace(/\bINT\s*\(\s*\d+\s*\)/gi, "INTEGER");
        converted = converted.replace(/\bBIGINT\s*\(\s*\d+\s*\)/gi, "INTEGER");
        converted = converted.replace(/\bTINYINT\s*\(\s*\d+\s*\)/gi, "INTEGER");
        converted = converted.replace(/\bSMALLINT\s*\(\s*\d+\s*\)/gi, "INTEGER");
        converted = converted.replace(/\bMEDIUMINT\s*\(\s*\d+\s*\)/gi, "INTEGER");

        // DOUBLE/FLOAT -> REAL
        converted = converted.replace(/\bDOUBLE\b/gi, "REAL");
        converted = converted.replace(/\bFLOAT\b/gi, "REAL");

        // Clean up trailing commas before closing parenthesis
        converted = converted.replace(/,\s*\)/g, ")");
        converted = converted.replace(/,\s*\n\s*\)/g, "\n)");

        // Clean up double commas
        converted = converted.replace(/,\s*,/g, ",");

        // Clean up multiple empty lines
        converted = converted.replace(/\n\s*\n\s*\n/g, "\n\n");

        return converted;
    }

    private convertParams(params?: any[]): any[] {
        if (!params) return [];

        return params.map(p => {
            // Convert undefined/null
            if (p === undefined) return null;
            if (p === null) return null;
            // Convert Date objects to ISO strings
            if (p instanceof Date) return p.toISOString();
            // Convert boolean to 1/0
            if (typeof p === "boolean") return p ? 1 : 0;
            // Handle objects that might be dates (from JSON parsing)
            if (typeof p === 'object' && p !== null && typeof p.toISOString === 'function') {
                return p.toISOString();
            }
            return p;
        });
    }

    async close(): Promise<void> {
        this.db.close();
    }

    isConnected(): boolean {
        return this.db.open;
    }

    // Direct access to database for special operations
    getDatabase(): BetterSqlite3.Database {
        return this.db;
    }
}

// Singleton database connection
let databaseConnection: DatabaseConnection | null = null;
let databaseType: DatabaseType = "mysql";

/**
 * Initialize database connection
 * Tries MySQL first, falls back to SQLite
 */
export async function initializeDatabase(): Promise<DatabaseConnection> {
    if (databaseConnection) {
        return databaseConnection;
    }

    // Try MySQL first
    try {
        logger.info("Attempting MySQL connection...");

        const pool = mysql.createPool({
            host: env.DATABASE_HOST,
            port: env.DATABASE_PORT,
            user: env.DATABASE_USER,
            password: env.DATABASE_PASSWORD,
            database: env.DATABASE_NAME,
            connectionLimit: 10,
            waitForConnections: true,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
        });

        // Test connection
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        databaseConnection = new MySQLConnection(pool);
        databaseType = "mysql";

        logger.info("✅ MySQL connection established");
        return databaseConnection;

    } catch (mysqlError: any) {
        logger.warn({ error: mysqlError.message }, "MySQL connection failed, falling back to SQLite");

        // Fallback to SQLite
        try {
            const sqlitePath = path.join(process.cwd(), "data", "pos.sqlite");
            databaseConnection = new SQLiteConnection(sqlitePath);
            databaseType = "sqlite";

            logger.info("✅ SQLite connection established (fallback mode)");
            return databaseConnection;

        } catch (sqliteError: any) {
            logger.error({ error: sqliteError }, "SQLite connection also failed");
            throw new Error("Failed to connect to any database");
        }
    }
}

/**
 * Get the current database connection
 */
export function getDatabase(): DatabaseConnection {
    if (!databaseConnection) {
        throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    return databaseConnection;
}

/**
 * Get the current database type
 */
export function getDatabaseType(): DatabaseType {
    return databaseType;
}

/**
 * Check if using SQLite (fallback mode)
 */
export function isUsingSQLite(): boolean {
    return databaseType === "sqlite";
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
    if (databaseConnection) {
        await databaseConnection.close();
        databaseConnection = null;
    }
}

/**
 * MySQL-compatible db wrapper for backward compatibility with existing routes.
 * This provides query() and getConnection() methods that work with both MySQL and SQLite.
 */
export const db = {
    async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
        const database = getDatabase();
        const result = await database.execute(sql, params);
        // Return in MySQL format: [rows, fields]
        // T is expected to be RowDataPacket[] or ResultSetHeader, so result.rows is T
        return [result.rows as unknown as T, null];
    },

    // Alias for query - some routes use execute instead of query
    async execute<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
        const database = getDatabase();
        const result = await database.execute(sql, params);
        return [result.rows as unknown as T, null];
    },

    async getConnection(): Promise<PoolConnection> {
        // For SQLite, transactions are handled differently
        // Return a mock connection object that works with existing code
        const database = getDatabase();

        if (isUsingSQLite()) {
            // SQLite doesn't really need connection pooling
            // Return an object that mimics MySQL connection interface
            const sqliteConnection: PoolConnection = {
                async beginTransaction() {
                    await database.execute("BEGIN TRANSACTION");
                },
                async commit() {
                    await database.execute("COMMIT");
                },
                async rollback() {
                    await database.execute("ROLLBACK");
                },
                async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
                    const result = await database.execute(sql, params);
                    return [result.rows as unknown as T, null];
                },
                release() {
                    // No-op for SQLite
                }
            };
            return sqliteConnection;
        } else {
            // For MySQL, wrap the raw pool connection to sanitize params (ISO datetime → MySQL format)
            const pool = (database as any).pool;
            const rawConn = await pool.getConnection();
            const sanitize = (params?: any[]): any[] => {
                if (!params) return [];
                return params.map((p: any) => {
                    if (p === undefined) return null;
                    if (p instanceof Date) return p.toISOString().slice(0, 19).replace('T', ' ');
                    if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p)) {
                        return p.slice(0, 19).replace('T', ' ');
                    }
                    return p;
                });
            };
            const originalQuery = rawConn.query.bind(rawConn);
            const originalExecute = rawConn.execute.bind(rawConn);
            rawConn.query = (sql: string, params?: any[]) => originalQuery(sql, sanitize(params));
            rawConn.execute = (sql: string, params?: any[]) => originalExecute(sql, sanitize(params));
            return rawConn;
        }
    }
};

/**
 * Standalone query function for backward compatibility
 * Used by auth.ts, license.ts, updates.ts
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const database = getDatabase();
    const result = await database.execute<T>(sql, params);
    return result.rows;
}

/**
 * BeginTransaction function for backward compatibility
 * Returns a connection object with transaction methods
 */
export async function beginTransaction() {
    return db.getConnection();
}

/**
 * Pool export for backward compatibility (used by migrator.ts) 
 */
export const pool = {
    async getConnection() {
        return db.getConnection();
    },
    async end() {
        await closeDatabase();
    }
};

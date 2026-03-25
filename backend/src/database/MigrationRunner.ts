/**
 * Migration Runner - Auto-run SQL migrations
 * 
 * Reads .sql files from migrations folder, tracks applied migrations,
 * and runs pending migrations automatically on startup.
 * 
 * Uses the "migrations" table (created in 001_initial_schema.sql) to track applied migrations.
 */

import fs from "fs";
import path from "path";
import { getDatabase, getDatabaseType, DatabaseConnection } from "../config/database-factory.js";
import { logger } from "../config/logger.js";

interface MigrationRecord {
    id: number;
    name: string;
    applied_at: string;
}

export class MigrationRunner {
    private migrationsPath: string;
    private db: DatabaseConnection;
    // Table name must match the one created in 001_initial_schema.sql
    private tableName = "migrations";

    constructor(migrationsPath?: string) {
        this.migrationsPath = migrationsPath || path.join(process.cwd(), "src", "database", "migrations");
        this.db = getDatabase();
    }

    /**
     * Run all pending migrations
     */
    async runMigrations(): Promise<void> {
        logger.info("🔄 Checking for pending migrations...");
        logger.info(`📂 Migrations path: ${this.migrationsPath}`);
        logger.info(`📂 Path exists: ${fs.existsSync(this.migrationsPath)}`);

        // Ensure migrations table exists
        await this.ensureMigrationsTable();

        // Get list of applied migrations
        const applied = await this.getAppliedMigrations();
        const appliedNames = applied.map(m => m.name);
        const appliedSet = new Set(appliedNames);
        logger.info(`📋 Already applied migrations (${applied.length}): ${appliedNames.join(', ') || 'none'}`);

        // Get all migration files
        const files = this.getMigrationFiles();
        logger.info(`📄 Found migration files (${files.length}): ${files.join(', ') || 'none'}`);

        // Filter pending migrations
        const pending = files.filter(f => {
            // Check both with and without .sql extension
            const nameWithoutExt = f.replace('.sql', '');
            return !appliedSet.has(f) && !appliedSet.has(nameWithoutExt);
        });

        if (pending.length === 0) {
            logger.info("✅ No pending migrations");
            return;
        }

        logger.info(`📦 Found ${pending.length} pending migrations: ${pending.join(', ')}`);

        // Run each pending migration
        for (const file of pending) {
            try {
                await this.runMigration(file);
            } catch (err: any) {
                logger.error(`❌ Migration ${file} failed, stopping migration runner. Error: ${err.message}`);
                // Don't throw - let the server continue starting even if a migration fails
                break;
            }
        }
    }

    /**
     * Ensure the migrations tracking table exists.
     * First checks if the "migrations" table already exists (created by 001_initial_schema),
     * if not, creates it. Also checks for legacy "_migrations" table and migrates records.
     */
    private async ensureMigrationsTable(): Promise<void> {
        const dbType = getDatabaseType();

        // First, try to create the migrations table if it doesn't exist
        try {
            if (dbType === "sqlite") {
                await this.db.execute(`
                    CREATE TABLE IF NOT EXISTS ${this.tableName} (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        applied_at TEXT DEFAULT (datetime('now'))
                    )
                `);
            } else {
                await this.db.execute(`
                    CREATE TABLE IF NOT EXISTS ${this.tableName} (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(255) NOT NULL UNIQUE,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            }
            logger.info(`✅ Migrations table "${this.tableName}" ready`);
        } catch (err: any) {
            logger.error(`❌ Failed to create migrations table: ${err.message} (code: ${err.code})`);
        }

        // Check for legacy "_migrations" table and migrate records
        try {
            const legacyResult = await this.db.query<MigrationRecord>(
                "SELECT * FROM _migrations ORDER BY id"
            );
            if (legacyResult.rows.length > 0) {
                logger.info(`🔄 Found ${legacyResult.rows.length} records in legacy "_migrations" table, migrating...`);
                for (const record of legacyResult.rows) {
                    try {
                        await this.db.execute(
                            `INSERT IGNORE INTO ${this.tableName} (name) VALUES (?)`,
                            [record.name]
                        );
                    } catch (e) {
                        // Ignore duplicates
                    }
                }
                logger.info(`✅ Legacy migration records migrated`);
            }
        } catch (e) {
            // Legacy table doesn't exist, that's fine
        }
    }

    /**
     * Get list of already applied migrations
     */
    private async getAppliedMigrations(): Promise<MigrationRecord[]> {
        try {
            const result = await this.db.query<MigrationRecord>(
                `SELECT * FROM ${this.tableName} ORDER BY id`
            );
            return result.rows;
        } catch (error: any) {
            logger.warn(`⚠️ Could not read migrations table: ${error.message}`);
            return [];
        }
    }

    /**
     * Get all migration SQL files
     */
    private getMigrationFiles(): string[] {
        if (!fs.existsSync(this.migrationsPath)) {
            logger.warn(`⚠️ Migrations path not found: ${this.migrationsPath}`);
            // Try listing parent to debug
            const parent = path.dirname(this.migrationsPath);
            if (fs.existsSync(parent)) {
                logger.info(`📂 Parent dir contents: ${fs.readdirSync(parent).join(', ')}`);
            }
            return [];
        }

        const allFiles = fs.readdirSync(this.migrationsPath);
        logger.info(`📂 All files in migrations dir: ${allFiles.join(', ')}`);

        const files = allFiles
            .filter(f => f.endsWith(".sql"))
            .sort();

        return files;
    }

    /**
     * Run a single migration file
     */
    private async runMigration(filename: string): Promise<void> {
        const filePath = path.join(this.migrationsPath, filename);
        const migrationName = filename.replace('.sql', '');

        logger.info(`  ⏳ Running migration: ${filename}`);
        logger.info(`  📄 File path: ${filePath}`);
        logger.info(`  📄 File exists: ${fs.existsSync(filePath)}`);

        try {
            // Read the SQL file
            const sql = fs.readFileSync(filePath, "utf8");
            logger.info(`  📄 File size: ${sql.length} chars`);

            // Split into individual statements
            const statements = this.splitStatements(sql);
            logger.info(`  📄 Found ${statements.length} SQL statements`);

            let executedCount = 0;
            let skippedCount = 0;

            // Execute each statement
            for (let i = 0; i < statements.length; i++) {
                const trimmed = statements[i].trim();
                if (!trimmed || trimmed.startsWith("--")) continue;

                // Skip self-referencing INSERT INTO migrations - the runner handles this
                if (trimmed.toLowerCase().includes("insert into migrations") ||
                    trimmed.toLowerCase().includes("insert into _migrations") ||
                    trimmed.toLowerCase().includes("insert ignore into migrations")) {
                    logger.info(`  ⏭️ Skipping self-referencing migration record INSERT (runner handles this)`);
                    skippedCount++;
                    continue;
                }

                try {
                    // Split sub-statements (for multi-statement lines)
                    const subStatements = trimmed
                        .split(/;\s*\n?/)
                        .filter(s => s.trim() && !s.trim().startsWith("--"));

                    for (const subStmt of subStatements) {
                        const cleanStmt = subStmt.trim().replace(/;$/, '').trim();
                        if (!cleanStmt || cleanStmt.length <= 5) continue;

                        // Also skip INSERT INTO migrations in sub-statements
                        if (cleanStmt.toLowerCase().includes("insert into migrations") ||
                            cleanStmt.toLowerCase().includes("insert into _migrations")) {
                            logger.info(`  ⏭️ Skipping migration record INSERT in sub-statement`);
                            skippedCount++;
                            continue;
                        }

                        logger.info(`  🔧 [${i + 1}/${statements.length}] Executing: ${cleanStmt.substring(0, 120)}${cleanStmt.length > 120 ? '...' : ''}`);
                        await this.db.execute(cleanStmt);
                        executedCount++;
                        logger.info(`  ✅ Statement executed successfully`);
                    }
                } catch (stmtError: any) {
                    const msg = (stmtError.message || "").toLowerCase();
                    const code = stmtError.code || "";

                    logger.warn(`  ⚠️ Statement error - Code: "${code}", Message: "${stmtError.message}"`);
                    logger.warn(`  ⚠️ Failed SQL: ${trimmed.substring(0, 200)}`);

                    // Check if error is ignorable
                    const isIgnorable =
                        msg.includes("already exists") ||
                        msg.includes("duplicate column") ||
                        msg.includes("duplicate key name") ||
                        msg.includes("duplicate entry") ||
                        msg.includes("can't drop") ||
                        msg.includes("check that column/key exists") ||
                        msg.includes("unknown column") ||
                        msg.includes("doesn't exist") ||
                        msg.includes("not supported in the prepared statement") ||
                        code === "ER_TABLE_EXISTS_ERROR" ||
                        code === "ER_DUP_FIELDNAME" ||
                        code === "ER_DUP_KEYNAME" ||
                        code === "ER_DUP_ENTRY" ||
                        code === "ER_CANT_DROP_FIELD_OR_KEY" ||
                        code === "ER_NO_SUCH_TABLE" ||
                        code === "ER_BAD_FIELD_ERROR" ||
                        code === "ER_UNSUPPORTED_PS" ||
                        (code === "SQLITE_ERROR" && msg.includes("already exists"));

                    if (isIgnorable) {
                        logger.info(`  ⏭️ Ignorable error (${code || 'known pattern'}), continuing...`);
                        skippedCount++;
                    } else {
                        logger.error(`  ❌ NON-IGNORABLE error in migration ${filename}!`);
                        logger.error(`  ❌ Code: ${code}`);
                        logger.error(`  ❌ Message: ${stmtError.message}`);
                        logger.error(`  ❌ SQL: ${trimmed}`);
                        logger.error(`  ❌ Full error:`, stmtError);
                        throw stmtError;
                    }
                }
            }

            logger.info(`  📊 Migration stats: ${executedCount} executed, ${skippedCount} skipped`);

            // Record the migration as applied (use the filename as-is for consistency)
            // Also insert without .sql extension for backward compatibility
            try {
                await this.db.execute(
                    `INSERT INTO ${this.tableName} (name) VALUES (?)`,
                    [filename]
                );
                logger.info(`  📝 Recorded migration: ${filename}`);
            } catch (e: any) {
                // Try without extension
                if (e.code === 'ER_DUP_ENTRY') {
                    logger.info(`  📝 Migration already recorded: ${filename}`);
                } else {
                    logger.warn(`  ⚠️ Could not record migration with filename, trying without extension...`);
                    try {
                        await this.db.execute(
                            `INSERT INTO ${this.tableName} (name) VALUES (?)`,
                            [migrationName]
                        );
                        logger.info(`  📝 Recorded migration: ${migrationName}`);
                    } catch (e2: any) {
                        if (e2.code === 'ER_DUP_ENTRY') {
                            logger.info(`  📝 Migration already recorded: ${migrationName}`);
                        } else {
                            logger.error(`  ❌ Failed to record migration: ${e2.message}`);
                        }
                    }
                }
            }

            logger.info(`  ✅ Migration completed: ${filename}`);

        } catch (error: any) {
            logger.error(`  ❌ Migration FAILED: ${filename}`);
            logger.error(`  ❌ Error type: ${error.constructor?.name}`);
            logger.error(`  ❌ Error code: ${error.code}`);
            logger.error(`  ❌ Error message: ${error.message}`);
            logger.error(`  ❌ Error stack: ${error.stack}`);
            throw new Error(`Migration ${filename} failed: ${error.message}`);
        }
    }

    /**
     * Split SQL file into individual statements
     */
    private splitStatements(sql: string): string[] {
        // Remove comments (but keep inline comments)
        const lines = sql.split("\n");
        const cleanedLines: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            // Skip full-line comments
            if (trimmed.startsWith("--")) continue;
            if (trimmed.startsWith("/*") && trimmed.endsWith("*/")) continue;
            cleanedLines.push(line);
        }

        const cleaned = cleanedLines.join("\n");

        // Split by semicolons followed by newline
        const statements = cleaned.split(/;\s*\n/);

        return statements
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith("--"));
    }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
    const runner = new MigrationRunner();
    try {
        await runner.runMigrations();
    } catch (error: any) {
        // Log but don't crash the server
        logger.error(`❌ Migration runner failed: ${error.message}`);
        logger.error(`❌ Stack: ${error.stack}`);
        logger.error(`❌ The server will continue starting, but some features may not work correctly.`);
    }
}

/**
 * Migration Runner - Auto-run SQL migrations
 * 
 * Reads .sql files from migrations folder, tracks applied migrations,
 * and runs pending migrations automatically on startup.
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

    constructor(migrationsPath?: string) {
        this.migrationsPath = migrationsPath || path.join(process.cwd(), "src", "database", "migrations");
        this.db = getDatabase();
    }

    /**
     * Run all pending migrations
     */
    async runMigrations(): Promise<void> {
        logger.info("🔄 Checking for pending migrations...");

        // Ensure migrations table exists
        await this.createMigrationsTable();

        // Get list of applied migrations
        const applied = await this.getAppliedMigrations();
        const appliedSet = new Set(applied.map(m => m.name));

        // Get all migration files
        const files = this.getMigrationFiles();

        // Filter pending migrations
        const pending = files.filter(f => !appliedSet.has(f));

        if (pending.length === 0) {
            logger.info("✅ No pending migrations");
            return;
        }

        logger.info(`📦 Found ${pending.length} pending migrations`);

        // Run each pending migration
        for (const file of pending) {
            await this.runMigration(file);
        }

        logger.info(`✅ Completed ${pending.length} migrations`);
    }

    /**
     * Create the migrations tracking table
     */
    private async createMigrationsTable(): Promise<void> {
        const dbType = getDatabaseType();

        let sql: string;
        if (dbType === "sqlite") {
            sql = `
        CREATE TABLE IF NOT EXISTS _migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `;
        } else {
            sql = `
        CREATE TABLE IF NOT EXISTS _migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
        }

        await this.db.execute(sql);
    }

    /**
     * Get list of already applied migrations
     */
    private async getAppliedMigrations(): Promise<MigrationRecord[]> {
        try {
            const result = await this.db.query<MigrationRecord>(
                "SELECT * FROM _migrations ORDER BY id"
            );
            return result.rows;
        } catch (error) {
            // Table might not exist yet
            return [];
        }
    }

    /**
     * Get all migration SQL files
     */
    private getMigrationFiles(): string[] {
        if (!fs.existsSync(this.migrationsPath)) {
            logger.warn(`Migrations path not found: ${this.migrationsPath}`);
            return [];
        }

        const files = fs.readdirSync(this.migrationsPath)
            .filter(f => f.endsWith(".sql"))
            .sort(); // Sort by name (assumes numeric prefix like 001_, 002_)

        return files;
    }

    /**
     * Run a single migration file
     */
    private async runMigration(filename: string): Promise<void> {
        const filePath = path.join(this.migrationsPath, filename);

        logger.info(`  ⏳ Running migration: ${filename}`);

        try {
            // Read the SQL file
            const sql = fs.readFileSync(filePath, "utf8");

            // Split into individual statements
            const statements = this.splitStatements(sql);

            // Execute each statement
            for (const statement of statements) {
                const trimmed = statement.trim();
                if (trimmed && !trimmed.startsWith("--")) {
                    try {
                        // The SQLite conversion may create multiple semicolon-separated statements
                        // (e.g., multi-column ALTER TABLE gets split)
                        // So we need to execute each sub-statement separately
                        const subStatements = trimmed.split(/;\s*\n?/).filter(s => s.trim() && !s.trim().startsWith("--"));

                        for (const subStmt of subStatements) {
                            const cleanStmt = subStmt.trim();
                            if (cleanStmt && cleanStmt.length > 5) {
                                await this.db.execute(cleanStmt);
                            }
                        }
                    } catch (stmtError: any) {
                        // Log but continue for certain errors (like "already exists")
                        if (stmtError.message?.includes("already exists") ||
                            stmtError.message?.includes("duplicate column") ||
                            stmtError.code === "ER_TABLE_EXISTS_ERROR" ||
                            stmtError.code === "SQLITE_ERROR" && stmtError.message?.includes("already exists")) {
                            logger.debug(`  ⚠️ Skipping (already exists): ${trimmed.substring(0, 50)}...`);
                        } else {
                            throw stmtError;
                        }
                    }
                }
            }

            // Record the migration
            await this.db.execute(
                "INSERT INTO _migrations (name) VALUES (?)",
                [filename]
            );

            logger.info(`  ✅ Migration completed: ${filename}`);

        } catch (error: any) {
            logger.error({ error, filename }, `  ❌ Migration failed: ${filename}`);
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

        // Split by semicolons, but be careful with delimiters
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
    await runner.runMigrations();
}

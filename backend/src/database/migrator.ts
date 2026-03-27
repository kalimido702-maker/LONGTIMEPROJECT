import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool, query } from "../config/database-factory.js";
import logger from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  name: string;
  path: string;
}

const migrations: Migration[] = [
  {
    name: "001_initial_schema",
    path: join(__dirname, "migrations", "001_initial_schema.sql"),
  },
  {
    name: "021_add_missing_product_payment_fields",
    path: join(__dirname, "migrations", "021_add_missing_product_payment_fields.sql"),
  },
  {
    name: "031_sub_accounts",
    path: join(__dirname, "migrations", "031_sub_accounts.sql"),
  },
  {
    name: "034_whatsapp_bot_per_account_company_info",
    path: join(__dirname, "migrations", "034_whatsapp_bot_per_account_company_info.sql"),
  },
  // Add more migrations here
];

export async function runMigrations(): Promise<void> {
  try {
    // Check if migrations table exists
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Get executed migrations
    const executedMigrations = await query<{ name: string }>(
      "SELECT name FROM migrations"
    );
    const executedNames = new Set(executedMigrations.map((m) => m.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (executedNames.has(migration.name)) {
        logger.info(`⏭️  Migration ${migration.name} already executed`);
        continue;
      }

      logger.info(`🔄 Running migration: ${migration.name}`);

      const connection = await pool.getConnection();
      try {
        // Read and execute SQL file
        // NOTE: No transaction for DDL (ALTER TABLE) — MySQL auto-commits DDL
        const sql = readFileSync(migration.path, "utf8");
        const statements = sql
          .split(";")
          .map((s) =>
            s
              .split("\n")
              .filter((line) => !line.trim().startsWith("--"))
              .join("\n")
              .trim()
          )
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          if (statement.toLowerCase().includes("insert into migrations")) {
            continue; // Skip migration record from SQL file
          }
          try {
            await connection.query(statement);
          } catch (stmtError: any) {
            // Ignore duplicate column/table errors (idempotent migrations)
            const code = stmtError.code || "";
            if (code === "ER_DUP_FIELDNAME" || code === "ER_TABLE_EXISTS_ERROR" || code === "ER_DUP_KEYNAME") {
              logger.info(`⚠️ Skipping (${code}): ${statement.substring(0, 80)}...`);
            } else {
              throw stmtError;
            }
          }
        }

        // Record migration
        await connection.query(
          "INSERT INTO migrations (name) VALUES (?) ON DUPLICATE KEY UPDATE name=name",
          [migration.name]
        );

        logger.info(`✅ Migration ${migration.name} completed`);
      } catch (error: any) {
        logger.error(`❌ Migration ${migration.name} failed: ${error?.message || error?.sqlMessage || String(error)} (code: ${error?.code})`);
        throw error;
      } finally {
        connection.release();
      }
    }

    logger.info("✅ All migrations completed successfully");
  } catch (error: any) {
    logger.error(`Migration error: ${error?.message || error?.sqlMessage || String(error)} (code: ${error?.code})`);
    throw error;
  }
}

// Run migrations if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info("Migration process completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Migration process failed:", error);
      process.exit(1);
    });
}

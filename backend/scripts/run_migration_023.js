const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'host.docker.internal',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306')
  });

  const statements = [
    "ALTER TABLE invoices ADD COLUMN items_json LONGTEXT",
    "ALTER TABLE invoices ADD COLUMN payment_method_amounts_json TEXT",
    "ALTER TABLE invoices ADD COLUMN customer_name VARCHAR(255)",
    "ALTER TABLE invoices ADD COLUMN user_name VARCHAR(255)",
    "ALTER TABLE purchases ADD COLUMN items_json LONGTEXT",
    "INSERT INTO migrations (name) VALUES ('023_add_items_json_to_invoices')"
  ];

  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      console.log('OK:', stmt);
    } catch(e) {
      if (e.code === 'ER_DUP_COLUMN_NAME' || e.code === 'ER_DUP_ENTRY') {
        console.log('SKIP (exists):', stmt);
      } else {
        console.error('ERR:', e.message);
      }
    }
  }
  await conn.end();
  console.log('Migration 023 complete!');
}
run();

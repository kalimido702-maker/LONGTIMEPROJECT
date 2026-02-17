const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'coffee',
    password: 'Hesham@2025',
    database: 'coffeenet'
  });
  const alters = [
    'ALTER TABLE products ADD COLUMN prices_json TEXT DEFAULT NULL',
    'ALTER TABLE products ADD COLUMN unit_id VARCHAR(36) DEFAULT NULL',
    'ALTER TABLE products ADD COLUMN default_price_type_id VARCHAR(36) DEFAULT NULL',
    'ALTER TABLE products ADD COLUMN expiry_date DATETIME DEFAULT NULL',
    'ALTER TABLE products ADD COLUMN has_multiple_units BOOLEAN DEFAULT FALSE',
    'ALTER TABLE invoices ADD COLUMN sales_rep_id VARCHAR(36) DEFAULT NULL',
    'ALTER TABLE invoices ADD COLUMN shift_id VARCHAR(36) DEFAULT NULL',
    'ALTER TABLE invoices ADD COLUMN payment_type VARCHAR(50) DEFAULT NULL',
    'ALTER TABLE invoices ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0',
    'ALTER TABLE payments ADD COLUMN payment_type VARCHAR(50) DEFAULT NULL',
    'ALTER TABLE payments ADD COLUMN user_id VARCHAR(36) DEFAULT NULL'
  ];
  for (const sql of alters) {
    try {
      await conn.query(sql);
      console.log('OK: ' + sql.substring(0, 60));
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('SKIP: ' + sql.substring(0, 60));
      } else {
        console.log('ERR: ' + e.message);
      }
    }
  }
  await conn.end();
  console.log('Migration 021 complete!');
})().catch(e => { console.error(e); process.exit(1); });

-- Migration 022: Add missing columns to sales_returns table
-- Fixes: items lost after sync, refundStatus showing as rejected, customerName missing

-- Store return items as JSON (like prices_json for products)
ALTER TABLE sales_returns ADD COLUMN items_json TEXT;

-- Customer name for display
ALTER TABLE sales_returns ADD COLUMN customer_name VARCHAR(255);

-- Refund status tracking
ALTER TABLE sales_returns ADD COLUMN refund_status VARCHAR(50) DEFAULT 'completed';

-- Refund method
ALTER TABLE sales_returns ADD COLUMN refund_method VARCHAR(50) DEFAULT 'cash';

-- Delivery status
ALTER TABLE sales_returns ADD COLUMN delivery_status VARCHAR(50) DEFAULT 'delivered';

-- User who created the return
ALTER TABLE sales_returns ADD COLUMN user_id VARCHAR(36);
ALTER TABLE sales_returns ADD COLUMN user_name VARCHAR(255);

-- Tax amount
ALTER TABLE sales_returns ADD COLUMN tax DECIMAL(10,2) DEFAULT 0;

-- Subtotal
ALTER TABLE sales_returns ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0;

-- Original invoice ID (may differ from invoice_id naming)
ALTER TABLE sales_returns ADD COLUMN original_invoice_id VARCHAR(36);

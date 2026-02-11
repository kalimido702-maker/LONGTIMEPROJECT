-- Migration: 020_fix_settings_id_size.sql
-- Fix settings table id column size to accommodate composite keys (client_id + setting_key)

ALTER TABLE settings MODIFY COLUMN id VARCHAR(255) NOT NULL;

-- Record this migration
INSERT INTO migrations (name) VALUES ('020_fix_settings_id_size');

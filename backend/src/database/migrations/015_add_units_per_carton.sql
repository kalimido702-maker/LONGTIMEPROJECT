-- ==================== Add units_per_carton to products ====================
-- Migration to add units_per_carton column for carton quantity tracking
-- Created: 2026-01-31
-- Database: SQLite

-- Add units_per_carton column to products table
ALTER TABLE products ADD COLUMN units_per_carton INTEGER;

-- Record this migration
INSERT INTO migrations (name) VALUES ('015_add_units_per_carton');

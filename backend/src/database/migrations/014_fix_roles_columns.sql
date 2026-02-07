-- ==================== Fix Missing Columns Migration ====================
-- Add missing columns for auth and roles (SQLite compatible)
-- Created: 2026-01-19

-- Note: SQLite doesn't support IF NOT EXISTS for columns
-- These will be run and errors ignored if columns exist

-- Add is_system to roles table
ALTER TABLE roles ADD COLUMN is_system BOOLEAN DEFAULT FALSE;

-- The is_deleted column should already exist from initial migration
-- but just in case:
-- ALTER TABLE roles ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

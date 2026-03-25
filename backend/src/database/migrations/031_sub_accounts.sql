-- Migration: 031_sub_accounts.sql
-- Add parent_user_id to users table for sub-account linking
-- A child user's parent_user_id points to its parent user's id.
-- A parent user has parent_user_id = NULL.

ALTER TABLE users ADD COLUMN parent_user_id VARCHAR(36);
ALTER TABLE users ADD INDEX idx_parent_user (parent_user_id);

-- Record this migration
INSERT INTO migrations (name) VALUES ('031_sub_accounts');

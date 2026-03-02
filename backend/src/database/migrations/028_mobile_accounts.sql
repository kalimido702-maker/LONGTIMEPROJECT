-- Migration: 028_mobile_accounts.sql
-- Add support for linking users to sales_reps and supervisors for mobile app login
-- Also add source tracking for mobile-created user accounts

-- Add linked_sales_rep_id to users (links user account to sales_rep record)
ALTER TABLE users ADD COLUMN linked_sales_rep_id VARCHAR(36);
ALTER TABLE users ADD INDEX idx_linked_sales_rep (linked_sales_rep_id);

-- Add linked_supervisor_id to users (links user account to supervisor record)
ALTER TABLE users ADD COLUMN linked_supervisor_id VARCHAR(36);
ALTER TABLE users ADD INDEX idx_linked_supervisor (linked_supervisor_id);

-- Add source column to track how the user account was created
ALTER TABLE users ADD COLUMN account_source VARCHAR(50) DEFAULT 'desktop'
  COMMENT 'desktop = created from POS app, mobile_auto = auto-created for mobile, mobile_admin = created by admin for mobile';

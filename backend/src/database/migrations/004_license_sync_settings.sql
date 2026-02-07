-- ==================== Add Sync Settings to Licenses ====================
-- Migration for dynamic sync settings per license

-- Add sync configuration columns
ALTER TABLE licenses
ADD COLUMN sync_interval INT DEFAULT 300000 COMMENT 'Sync interval in milliseconds (default 5 minutes)',
ADD COLUMN enable_sync BOOLEAN DEFAULT TRUE COMMENT 'Enable cloud sync for this license',
ADD COLUMN enable_offline_mode BOOLEAN DEFAULT FALSE COMMENT 'Allow offline-only mode';

-- Add auto-update configuration
ALTER TABLE licenses
ADD COLUMN auto_update BOOLEAN DEFAULT TRUE COMMENT 'Enable automatic app updates';

-- Record this migration
INSERT INTO migrations (name) VALUES ('004_license_sync_settings');

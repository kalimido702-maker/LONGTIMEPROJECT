-- ==================== App Versions Table for Auto-Update ====================
-- Stores app releases for auto-update functionality

CREATE TABLE IF NOT EXISTS app_versions (
  id VARCHAR(36) PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  platform ENUM('win32', 'darwin', 'linux') NOT NULL,
  arch VARCHAR(20) DEFAULT 'x64',
  download_url VARCHAR(500) NOT NULL COMMENT 'File path or external URL',
  release_notes TEXT,
  file_size BIGINT DEFAULT 0,
  checksum VARCHAR(128) COMMENT 'SHA512 checksum',
  is_mandatory BOOLEAN DEFAULT FALSE COMMENT 'Force update',
  is_active BOOLEAN DEFAULT TRUE,
  min_version VARCHAR(20) COMMENT 'Minimum version required to update',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_platform_version (platform, version),
  INDEX idx_is_active (is_active),
  UNIQUE KEY unique_platform_version (platform, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record this migration
INSERT INTO migrations (name) VALUES ('005_app_versions');

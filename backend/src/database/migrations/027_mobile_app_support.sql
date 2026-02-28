-- Migration: 027_mobile_app_support.sql
-- Add support for mobile app: FCM tokens, linked_customer_id on users

-- Add linked_customer_id to users (links user account to customer record for mobile app)
ALTER TABLE users ADD COLUMN linked_customer_id VARCHAR(36);
ALTER TABLE users ADD INDEX idx_linked_customer (linked_customer_id);

-- FCM Device Tokens table for push notifications
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  token VARCHAR(500) NOT NULL,
  device_type VARCHAR(20) DEFAULT 'android',
  device_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_token (token),
  INDEX idx_client_branch (client_id, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  user_id VARCHAR(36),
  customer_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  type VARCHAR(50) DEFAULT 'info',
  reference_id VARCHAR(36),
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_customer (customer_id),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

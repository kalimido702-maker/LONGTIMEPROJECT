-- Add image_url to notifications table
ALTER TABLE notifications ADD COLUMN image_url VARCHAR(500) DEFAULT NULL;

-- Notification reads tracking table
CREATE TABLE IF NOT EXISTS notification_reads (
  id VARCHAR(36) PRIMARY KEY,
  notification_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notification (notification_id),
  INDEX idx_user (user_id),
  UNIQUE KEY uq_notif_user (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

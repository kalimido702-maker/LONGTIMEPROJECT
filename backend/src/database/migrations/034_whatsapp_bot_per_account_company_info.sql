ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS `bot_enabled` BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS whatsapp_bot_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_senders VARCHAR(50) NOT NULL DEFAULT 'all',
    welcome_message TEXT,
    unknown_command_message TEXT,
    company_info TEXT,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    updated_at DATETIME NOT NULL DEFAULT NOW(),
    UNIQUE KEY unique_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

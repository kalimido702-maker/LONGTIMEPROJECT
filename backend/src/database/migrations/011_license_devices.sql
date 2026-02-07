-- جدول الأجهزة المفعّلة لكل لايسنس
-- يدعم تعدد الأجهزة حسب max_devices في جدول licenses

CREATE TABLE IF NOT EXISTS license_devices (
    id VARCHAR(36) PRIMARY KEY,
    license_id VARCHAR(36) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    hostname VARCHAR(255),
    platform VARCHAR(100),
    app_version VARCHAR(50),
    activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_verified_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- لا يمكن تفعيل نفس الجهاز مرتين على نفس اللايسنس
    UNIQUE KEY unique_license_device (license_id, device_id),
    
    -- فهرس للبحث السريع
    INDEX idx_license_devices_license_id (license_id),
    INDEX idx_license_devices_device_id (device_id),
    INDEX idx_license_devices_active (license_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- إضافة الـ Foreign Key بشكل منفصل للتوافق
ALTER TABLE license_devices 
    ADD CONSTRAINT fk_license_devices_license 
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE;

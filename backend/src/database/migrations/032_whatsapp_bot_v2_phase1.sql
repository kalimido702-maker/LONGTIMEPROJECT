-- Phase 1: WhatsApp Bot v2 - Database Schema + Customer ID System
-- This migration adds:
-- - Location fields to customers table
-- - Customer identification numbers table
-- - Traders table with service areas
-- - Customer phones table (multiple phones per customer)

-- ============================================
-- 1. Add location fields to customers table
-- ============================================
ALTER TABLE customers ADD COLUMN latitude DECIMAL(10, 8) NULL AFTER address;
ALTER TABLE customers ADD COLUMN longitude DECIMAL(11, 8) NULL AFTER latitude;
ALTER TABLE customers ADD COLUMN address_text VARCHAR(500) NULL AFTER longitude;
ALTER TABLE customers ADD COLUMN customer_type ENUM('registered', 'casual') DEFAULT 'registered' AFTER address_text;

-- ============================================
-- 2. Create customer_identification_numbers table
-- ============================================
CREATE TABLE IF NOT EXISTS customer_identification_numbers (
    id VARCHAR(36) PRIMARY KEY,
    customer_id VARCHAR(36) NOT NULL,
    id_number VARCHAR(100) NOT NULL,
    label VARCHAR(50) DEFAULT 'primary',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id),
    INDEX idx_id_number (id_number),
    INDEX idx_is_active (is_active)
);

-- ============================================
-- 3. Create traders table
-- ============================================
CREATE TABLE IF NOT EXISTS traders (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address_text VARCHAR(500),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    INDEX idx_phone (phone),
    INDEX idx_is_active (is_active)
);

-- ============================================
-- 4. Create trader_service_areas table
-- ============================================
CREATE TABLE IF NOT EXISTS trader_service_areas (
    id VARCHAR(36) PRIMARY KEY,
    trader_id VARCHAR(36) NOT NULL,
    area_name VARCHAR(200) NOT NULL,
    priority INT DEFAULT 1,
    FOREIGN KEY (trader_id) REFERENCES traders(id) ON DELETE CASCADE,
    INDEX idx_trader_id (trader_id),
    INDEX idx_area_name (area_name)
);

-- ============================================
-- 5. Create customer_phones table (multiple phones per customer)
-- ============================================
CREATE TABLE IF NOT EXISTS customer_phones (
    id VARCHAR(36) PRIMARY KEY,
    customer_id VARCHAR(36) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    label VARCHAR(50) DEFAULT 'mobile',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id),
    INDEX idx_phone (phone),
    INDEX idx_is_active (is_active)
);

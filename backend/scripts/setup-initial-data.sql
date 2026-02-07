#!/bin/bash
# ==================== Setup Initial Data ====================
# Run this on the server to create Client, Branch and link License
# Usage: sqlite3 /home/coffee/htdocs/13coffee.net/data/pos.sqlite < setup-initial-data.sql

# Create a Main Client
INSERT OR IGNORE INTO clients (
  id, name, name_en, email, subscription_plan, subscription_status, is_active, max_branches, max_devices
) VALUES (
  'main-client-001',
  'كافيه 13',
  '13 Coffee',
  'info@13coffee.net',
  'premium',
  'active',
  1,
  5,
  10
);

# Create Main Branch
INSERT OR IGNORE INTO branches (
  id, client_id, name, name_en, is_main, is_active
) VALUES (
  'main-branch-001',
  'main-client-001',
  'الفرع الرئيسي',
  'Main Branch',
  1,
  1
);

# Update the License to use real client/branch
UPDATE licenses 
SET client_id = 'main-client-001', 
    branch_id = 'main-branch-001'
WHERE license_key = '06601DF646BC923C';

# Create a default admin user for the client
INSERT OR IGNORE INTO users (
  id, client_id, branch_id, username, password_hash, full_name, role, is_active
) VALUES (
  'user-admin-001',
  'main-client-001',
  'main-branch-001',
  'admin',
  '$2b$10$u5rU08EI5IBMdg4iq5Iu2ObAnajeXRI243BZS3cISUM6sinzfjOEC',
  'مدير النظام',
  'admin',
  1
);

# Create default payment methods
INSERT OR IGNORE INTO payment_methods (id, client_id, branch_id, name, name_en, type, active, sort_order) 
VALUES 
  ('pm-cash-001', 'main-client-001', 'main-branch-001', 'نقدي', 'Cash', 'cash', 1, 1),
  ('pm-card-001', 'main-client-001', 'main-branch-001', 'بطاقة', 'Card', 'card', 1, 2),
  ('pm-transfer-001', 'main-client-001', 'main-branch-001', 'تحويل', 'Transfer', 'transfer', 1, 3);

# Create default expense categories  
INSERT OR IGNORE INTO expense_categories (id, client_id, branch_id, name, name_en, active)
VALUES
  ('ec-general-001', 'main-client-001', 'main-branch-001', 'مصروفات عامة', 'General Expenses', 1),
  ('ec-salary-001', 'main-client-001', 'main-branch-001', 'رواتب', 'Salaries', 1),
  ('ec-rent-001', 'main-client-001', 'main-branch-001', 'إيجار', 'Rent', 1),
  ('ec-utilities-001', 'main-client-001', 'main-branch-001', 'كهرباء ومياه', 'Utilities', 1);

-- Verify
SELECT 'Clients:' as info, COUNT(*) as count FROM clients;
SELECT 'Branches:' as info, COUNT(*) as count FROM branches;
SELECT 'Users:' as info, COUNT(*) as count FROM users;
SELECT 'License updated:', license_key, client_id, branch_id FROM licenses WHERE license_key = '06601DF646BC923C';

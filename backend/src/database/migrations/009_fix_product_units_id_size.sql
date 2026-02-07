-- Migration: Fix product_units id column size
-- Problem: Compound IDs like "1763923566026_1763917132742_1763924211347" (45 chars) exceed VARCHAR(36)

ALTER TABLE `product_units` 
MODIFY COLUMN `id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

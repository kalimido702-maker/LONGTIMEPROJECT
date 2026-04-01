export interface CartItem {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  stock: number;
  quantity: number;
  customPrice?: number;
  priceTypeId?: string;
  priceTypeName?: string;
  unitId?: string;
  unitName?: string;
  prices?: Record<string, number>;
  // Multi-unit support
  productUnitId?: string; // ID of the ProductUnit record
  conversionFactor?: number; // How many base units = 1 of this unit
  selectedUnitName?: string; // Display name of selected unit
  // Return Verification
  isPriceVerified?: boolean; // True if price matches history, False if not found
  originalPrice?: number; // The price found in history (if any)
  // Per-item fields
  barcode?: string;
  unitsPerCarton?: number;
  itemDiscount?: number; // خصم على مستوى الصنف
}

export interface ProductStock {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  minStock?: number;
  updatedAt: string;
}

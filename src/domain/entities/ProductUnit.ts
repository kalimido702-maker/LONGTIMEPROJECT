export type ProductUnit = {
  id: string;
  productId: string;
  unitId: string;
  unitName: string; // للعرض
  conversionFactor: number; // كم قطعة في هذه الوحدة (مثلاً: كرتونة = 10)
  prices: Record<string, number>; // أسعار البيع لهذه الوحدة حسب نوع السعر { priceTypeId: price }
  costPrice: number; // سعر التكلفة لهذه الوحدة
  barcode?: string; // باركود خاص بهذه الوحدة
  isBaseUnit: boolean; // هل هي الوحدة الأساسية (القطعة)
  createdAt: string;
};

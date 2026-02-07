export interface ProductCategory {
  id: string;
  name: string;
  nameAr: string;
  description?: string;
  bonusPercentage?: number; // نسبة البونص لهذا القسم
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

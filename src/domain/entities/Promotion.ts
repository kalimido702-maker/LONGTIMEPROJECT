export interface Promotion {
  id: string;
  name: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  startDate: string;
  endDate: string;
  active: boolean;
  applicableProducts?: string[];
}

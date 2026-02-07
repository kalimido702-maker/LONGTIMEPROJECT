export interface Role {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  color: string;
  permissions: Record<string, string[]>;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

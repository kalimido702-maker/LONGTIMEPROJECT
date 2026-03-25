/**
 * Trader Entity - For trader/trader management
 * 
 * Represents traders who can assign orders and manage customer relationships.
 * Includes location data for geographic operations.
 */
export interface Trader {
  id: string;
  clientId: string;
  name: string;
  phone?: string;
  addressText?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  createdAt: string;
  // Related entities
  serviceAreas?: TraderServiceArea[];
}

/**
 * Trader Service Area Entity
 * 
 * Represents geographic areas that a trader serves.
 */
export interface TraderServiceArea {
  id: string;
  traderId: string;
  areaName: string;
  priority: number; // Higher priority = preferred area
}

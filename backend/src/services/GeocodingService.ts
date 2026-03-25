/**
 * Customer entity for geocoding service (backend)
 * Matches the frontend Customer interface
 */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  addressText?: string;
  customerType: 'registered' | 'casual';
  nationalId?: string;
  creditLimit: number;
  currentBalance: number;
  bonusBalance: number;
  previousStatement?: number;
  salesRepId?: string;
  class?: 'A' | 'B' | 'C';
  whatsappGroupId?: string;
  invoiceGroupId?: string;
  collectionGroupId?: string;
  loyaltyPoints: number;
  createdAt: string;
  notes?: string;
}

/**
 * Geocoding result from Nominatim API
 */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Customer with distance information
 */
export interface CustomerWithDistance extends Customer {
  distanceKm: number;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Geocoding service using OpenStreetMap/Nominatim API
 * Used by WhatsApp bot to convert customer address text to lat/long coordinates
 */
export class GeocodingService {
  /**
   * User agent for Nominatim API requests
   * Nominatim requires a unique user agent
   */
  private static readonly USER_AGENT = 'MYPOS/WhatsAppBot v2.0';

  /**
   * Geocode an address string to latitude/longitude coordinates
   * Uses the free Nominatim API (no API key required)
   * 
   * @param address - The address text to geocode
   * @returns Promise with lat/lon object or null if not found
   */
  static async geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        addressdetails: '0',
      });

      const url = `${NOMINATIM_BASE_URL}?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Nominatim API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const jsonData: unknown = await response.json();
      const results: NominatimResult[] = Array.isArray(jsonData) ? jsonData : [];

      if (!results || results.length === 0) {
        console.log(`No geocoding results for address: ${address}`);
        return null;
      }

      const firstResult = results[0];
      
      return {
        lat: parseFloat(firstResult.lat),
        lon: parseFloat(firstResult.lon),
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Calculate the distance between two geographic points using the Haversine formula
   * 
   * @param lat1 - Latitude of point 1
   * @param lon1 - Longitude of point 1
   * @param lat2 - Latitude of point 2
   * @param lon2 - Longitude of point 2
   * @returns Distance in kilometers
   */
  static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const EARTH_RADIUS_KM = 6371;

    const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const lat1Rad = toRadians(lat1);
    const lat2Rad = toRadians(lat2);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
  }

  /**
   * Find the nearest customers (traders) to a given location
   * Only considers customers that have valid latitude/longitude coordinates
   * 
   * @param lat - Latitude of the reference point
   * @param lon - Longitude of the reference point
   * @param customers - Array of customers to search through
   * @param limit - Optional limit on number of results (default: 5)
   * @returns Array of customers with distance, sorted by distance (closest first)
   */
  static findNearestCustomers(
    lat: number,
    lon: number,
    customers: Customer[],
    limit: number = 5
  ): CustomerWithDistance[] {
    // Filter customers that have valid coordinates
    const customersWithCoords = customers.filter(
      (customer) =>
        customer.latitude !== undefined &&
        customer.longitude !== undefined &&
        !isNaN(customer.latitude) &&
        !isNaN(customer.longitude)
    );

    // Calculate distance for each customer and create CustomerWithDistance objects
    const customersWithDistance: CustomerWithDistance[] = customersWithCoords.map((customer) => ({
      ...customer,
      distanceKm: this.haversineDistance(
        lat,
        lon,
        customer.latitude!,
        customer.longitude!
      ),
    }));

    // Sort by distance (closest first)
    customersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    // Return only the top 'limit' results
    return customersWithDistance.slice(0, limit);
  }

  /**
   * Format distance for display
   * 
   * @param distanceKm - Distance in kilometers
   * @returns Formatted string (e.g., "1.5 km" or "500 m")
   */
  static formatDistance(distanceKm: number): string {
    if (distanceKm < 1) {
      const meters = Math.round(distanceKm * 1000);
      return `${meters} م`; // Arabic: meters
    }
    return `${distanceKm.toFixed(1)} كم`; // Arabic: km
  }
}

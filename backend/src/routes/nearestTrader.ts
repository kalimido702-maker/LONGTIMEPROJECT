import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket } from "mysql2/promise";
import { GeocodingService, CustomerWithDistance } from "../services/GeocodingService.js";

/**
 * Query string for nearest trader endpoint
 */
interface NearestTraderQuery {
  address: string;
  limit?: number;
}

/**
 * Customer row from database with lat/lng
 */
interface CustomerWithLocation extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  address_text?: string;
  customer_type: 'registered' | 'casual';
  national_id?: string;
  credit_limit: number;
  current_balance: number;
  bonus_balance: number;
  previous_statement?: number;
  sales_rep_id?: string;
  class?: 'A' | 'B' | 'C';
  whatsapp_group_id?: string;
  invoice_group_id?: string;
  collection_group_id?: string;
  loyalty_points: number;
  created_at: string;
  notes?: string;
}

/**
 * Customer for geocoding service (matches GeocodingService.Customer interface)
 */
interface GeocodingCustomer {
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

export default async function nearestTraderRoutes(server: FastifyInstance) {
  /**
   * GET /api/nearest-trader - Find nearest traders (customers with location)
   * Query params:
   *   - address (string, required): the customer's address to search from
   *   - limit (number, optional, default 3): maximum number of traders to return
   */
  server.get<{ Querystring: NearestTraderQuery }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { address, limit = 3 } = request.query;
        const { clientId, branchId } = request.user!;

        if (!address || address.trim() === '') {
          return reply.code(400).send({ error: "Address is required" });
        }

        // Step 1: Geocode the provided address
        const coords = await GeocodingService.geocodeAddress(address);
        if (!coords) {
          return reply.code(400).send({ 
            error: "Could not geocode the provided address",
            message: `Unable to find coordinates for: ${address}`
          });
        }

        // Step 2: Fetch all customers with latitude/longitude
        const [customers] = await db.query<CustomerWithLocation[]>(
          `SELECT id, name, phone, address, latitude, longitude, address_text,
                  customer_type, national_id, credit_limit, current_balance, bonus_balance,
                  previous_statement, sales_rep_id, class, whatsapp_group_id,
                  invoice_group_id, collection_group_id, loyalty_points, created_at, notes
           FROM customers 
           WHERE client_id = ? 
             AND branch_id = ?
             AND is_deleted = 0
             AND is_active = 1
             AND latitude IS NOT NULL 
             AND longitude IS NOT NULL`,
          [clientId, branchId]
        );

        if (customers.length === 0) {
          return reply.code(200).send({
            data: [],
            message: "No customers with location data found",
            searchAddress: address,
            searchCoords: coords,
          });
        }

        // Step 3: Convert to GeocodingService.Customer format
        const geocodingCustomers: GeocodingCustomer[] = customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          latitude: c.latitude ?? undefined,
          longitude: c.longitude ?? undefined,
          addressText: c.address_text,
          customerType: c.customer_type,
          nationalId: c.national_id,
          creditLimit: c.credit_limit,
          currentBalance: c.current_balance,
          bonusBalance: c.bonus_balance,
          previousStatement: c.previous_statement,
          salesRepId: c.sales_rep_id,
          class: c.class,
          whatsappGroupId: c.whatsapp_group_id,
          invoiceGroupId: c.invoice_group_id,
          collectionGroupId: c.collection_group_id,
          loyaltyPoints: c.loyalty_points,
          createdAt: c.created_at,
          notes: c.notes,
        }));

        // Step 4: Find nearest customers using GeocodingService
        const nearestCustomers = GeocodingService.findNearestCustomers(
          coords.lat,
          coords.lon,
          geocodingCustomers,
          limit
        );

        // Step 5: Format response with distance info
        const formattedCustomers = nearestCustomers.map((customer: CustomerWithDistance) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          latitude: customer.latitude,
          longitude: customer.longitude,
          distanceKm: customer.distanceKm,
          distanceFormatted: GeocodingService.formatDistance(customer.distanceKm),
          customerType: customer.customerType,
          creditLimit: customer.creditLimit,
          currentBalance: customer.currentBalance,
          salesRepId: customer.salesRepId,
          class: customer.class,
        }));

        return reply.code(200).send({
          data: formattedCustomers,
          searchAddress: address,
          searchCoords: coords,
          totalWithLocation: customers.length,
          returned: formattedCustomers.length,
        });
      } catch (error) {
        logger.error({ error }, "Failed to find nearest traders");
        return reply.code(500).send({ error: "Failed to find nearest traders" });
      }
    }
  );
}

# WhatsApp Bot v2 Architecture Plan

**Document Version:** 1.0  
**Date:** 2026-03-25  
**Status:** Draft  
**Author:** Architecture Team

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WhatsApp Bot v2 Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────────┐     ┌───────────────────────┐    │
│  │   Customer   │     │   WhatsApp Bot   │     │    AI Intent Layer    │    │
│  │   sends      │────▶│   Gateway        │────▶│    (Intent Detection) │    │
│  │   message    │     │   (Webhook)      │     │                       │    │
│  └──────────────┘     └──────────────────┘     └───────────────────────┘    │
│                              │                           │                    │
│                              ▼                           ▼                    │
│                     ┌──────────────────┐     ┌───────────────────────┐       │
│                     │  Message Handler │◀────│   Fallback: Regex     │       │
│                     │                  │     │   Command Parser      │       │
│                     └────────┬─────────┘     └───────────────────────┘       │
│                              │                                              │
│         ┌────────────────────┼────────────────────┐                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                    │
│  │  Customer ID  │    │   Intent    │    │   Trader    │                    │
│  │  Resolver     │    │   Router    │    │   Locator   │                    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                   │                             │
│         ▼                   ▼                   ▼                             │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │                    Response Generator                     │               │
│  │  (Registered Customer Response / Casual Customer Response)│               │
│  └──────────────────────────────────────────────────────────┘               │
│                              │                                              │
│                              ▼                                              │
│                     ┌──────────────────┐                                   │
│                     │   WhatsApp API   │                                   │
│                     │   (Reply to      │                                   │
│                     │    Customer)     │                                   │
│                     └──────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Two-Tier Customer Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Two-Tier Customer Classification                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Customer Message                                                            │
│        │                                                                     │
│        ▼                                                                     │
│  ┌─────────────────┐                                                         │
│  │ Customer ID     │                                                         │
│  │ Resolution      │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│     ┌─────┴─────┐                                                            │
│     ▼           ▼                                                            │
│  ┌──────┐  ┌─────────┐                                                       │
│  │Found │  │Not Found│                                                       │
│  └──┬───┘  └────┬────┘                                                       │
│     │           │                                                             │
│     ▼           ▼                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                               │
│  │ Registered       │    │ Casual Customer   │                               │
│  │ (Long-Time)      │    │ (Regular)         │                               │
│  ├──────────────────┤    ├──────────────────┤                               │
│  │ • Invoice Query  │    │ • Intent Detection│                              │
│  │ • Debt Query     │    │ • Trader Lookup   │                               │
│  │ • Payment Query  │    │ • General Info    │                               │
│  │ • Statement Req   │    │ • Product Inquiry │                               │
│  │ • Auto Invoices  │    │                   │                               │
│  │ • Scheduled Reps │    │                   │                               │
│  └──────────────────┘    └──────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 AI Intent Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI Intent Detection Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Message ──▶ Pre-processing ──▶ AI Intent Detection ──▶ Intent Routing     │
│                (Normalize)        (~50 tokens)          │                   │
│                                                          ▼                   │
│                                                    ┌─────────┐               │
│                                                    │invoice_ │               │
│                                                    │ query   │               │
│                                                    └────┬────┘               │
│                                                    ┌─────────┐               │
│                                                    │ debt_   │               │
│                                                    │ query   │               │
│                                                    └────┬────┘               │
│                                                    ┌─────────┐               │
│                                                    │payment_ │               │
│                                                    │ query   │               │
│                                                    └────┬────┘               │
│                                                    ┌─────────┐               │
│                                                    │nearest_ │               │
│                                                    │trader   │               │
│                                                    └────┬────┘               │
│                                                    ┌─────────┐               │
│                                                    │general_ │               │
│                                                    │inquiry  │               │
│                                                    └────┬────┘               │
│                                                    ┌─────────┐               │
│                                                    │unknown  │               │
│                                                    └────┬────┘               │
│                                                          │                   │
│                                                          ▼                   │
│                                                    Structured Query          │
│                                                    + Response Generation     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema Changes

### 2.1 New Tables

#### 2.1.1 `customer_identification_numbers` Table

```sql
CREATE TABLE customer_identification_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    id_number VARCHAR(100) NOT NULL,
    label VARCHAR(50) DEFAULT 'default',
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_customer_id (customer_id),
    INDEX idx_id_number (id_number),
    UNIQUE INDEX idx_unique_id_number (id_number, is_active),
    
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
```

**Purpose:** Allows up to 2 identification numbers per customer (e.g., National ID, Tax ID, Customer Code).

#### 2.1.2 `traders` Table

```sql
CREATE TABLE traders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    branch_id INT DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    address_text VARCHAR(500) DEFAULT NULL,
    latitude DECIMAL(10, 8) DEFAULT NULL,
    longitude DECIMAL(11, 8) DEFAULT NULL,
    location_point POINT DEFAULT NULL,
    service_areas JSON DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_client_id (client_id),
    INDEX idx_branch_id (branch_id),
    INDEX idx_location (location_point),
    SPATIAL INDEX idx_spatial_location (location_point)
);
```

**Purpose:** Stores trader information including geolocation for nearest trader recommendations.

#### 2.1.3 `trader_service_areas` Table

```sql
CREATE TABLE trader_service_areas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trader_id INT NOT NULL,
    area_name VARCHAR(255) NOT NULL,
    area_name_ar VARCHAR(255) DEFAULT NULL,
    latitude DECIMAL(10, 8) DEFAULT NULL,
    longitude DECIMAL(11, 8) DEFAULT NULL,
    radius_km DECIMAL(5, 2) DEFAULT 10.00,
    
    FOREIGN KEY (trader_id) REFERENCES traders(id) ON DELETE CASCADE,
    INDEX idx_trader_id (trader_id),
    INDEX idx_area_name (area_name)
);
```

### 2.2 Modified Tables

#### 2.2.1 `customers` Table - Add Location Fields

```sql
ALTER TABLE customers ADD COLUMN customer_type ENUM('registered', 'regular') DEFAULT 'regular';
ALTER TABLE customers ADD COLUMN latitude DECIMAL(10, 8) DEFAULT NULL;
ALTER TABLE customers ADD COLUMN longitude DECIMAL(11, 8) DEFAULT NULL;
ALTER TABLE customers ADD COLUMN address_text VARCHAR(500) DEFAULT NULL;
ALTER TABLE customers ADD COLUMN location_point POINT DEFAULT NULL;
ALTER TABLE customers ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'ar';

-- Add spatial index for location queries
ALTER TABLE customers ADD SPATIAL INDEX idx_spatial_location (location_point);
```

#### 2.2.2 `customer_phones` Table - Enhance

```sql
ALTER TABLE customer_phones ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE customer_phones ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE customer_phones ADD COLUMN label VARCHAR(50) DEFAULT 'mobile';
```

---

## 3. AI Intent Detection Layer

### 3.1 Purpose

The AI layer performs **intent classification only** — it does NOT handle full natural language understanding (NLU). This is a hybrid approach that combines:

1. **AI Intent Detection:** For natural, unstructured messages
2. **Regex Fallback:** For structured commands (backward compatibility)

### 3.2 Supported Intents

| Intent | Description | Example Messages |
|--------|-------------|------------------|
| `invoice_query` | Request invoice details | "أريد معرفة تفاصيل فاتورتي", "Show my invoice" |
| `debt_query` | Check outstanding debt | "ما剩余?", "كم أ دين?", "My balance" |
| `payment_query` | View payment history | "كشف المدفوعات", "Payment history", "ما دفعت" |
| `statement_query` | Request account statement | "كشف حساب", "Account statement" |
| `nearest_trader` | Find nearest trader | "أريد تاجرأ closest", "Where is the nearest trader" |
| `general_inquiry` | General questions | " prices", "أريد الاستفسار عن..." |
| `purchase_request` | Request to make purchase | "أريد الشراء", "I want to order" |
| `greeting` | Greetings | "مرحبا", "Hello", "Hi" |
| `unknown` | Unrecognized intent | Random text, unclear requests |

### 3.3 Token-Efficient Prompt Design

```typescript
// Intent Detection Prompt (~50 tokens total)
const INTENT_DETECTION_PROMPT = `
Classify this customer message intent. Reply with ONE word only.

Intents:
- invoice_query
- debt_query
- payment_query
- statement_query
- nearest_trader
- general_inquiry
- purchase_request
- greeting
- unknown

Message: "{MESSAGE}"

Intent:`;
```

**Optimization Techniques:**
- Minimal prompt design (~50 tokens)
- Single-word response
- No conversation history
- No examples needed (zero-shot classification)
- Fast/cheap model sufficient

### 3.4 AI Provider Integration

```typescript
interface AIIntentConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  apiKey?: string;
  endpoint?: string;
  temperature: 0.1; // Low temperature for consistent classification
  maxTokens: 20;
}

interface IntentResult {
  intent: IntentType;
  confidence: number;
  rawResponse?: string;
  processingTimeMs: number;
}
```

### 3.5 Fallback Strategy

```typescript
// If AI fails, fall back to regex
async function detectIntent(message: string): Promise<IntentResult> {
  try {
    return await aiDetectIntent(message);
  } catch (error) {
    logger.warn('AI intent detection failed, using regex fallback');
    return regexBasedIntentDetection(message);
  }
}

// Regex fallback patterns
const INTENT_PATTERNS = {
  invoice_query: [/فاتور/i, /invoice/i, /bill/i],
  debt_query: [/مديون/i, /رصيد/i, /debt/i, /balance/i, /due/i],
  payment_query: [/مدفوع/i, /دفع/i, /payment/i, /paid/i],
  statement_query: [/كشف/i, /statement/i, /account/i],
  nearest_trader: [/اقرب.*تاجر/i, /nearest.*trader/i, /توجد.*where/i],
  purchase_request: [/شراء/i, /order/i, /buy/i, /أريد.*اشتري/i],
  greeting: [/مرحبا/i, /hello/i, /hi/i, /اهلا/i, /السلام/i],
};
```

---

## 4. Customer Identification System

### 4.1 Multiple Phone Numbers Per Customer

```typescript
interface CustomerPhone {
  id: number;
  customerId: number;
  phone: string;
  normalizedPhone: string;
  label: 'mobile' | 'home' | 'work' | 'whatsapp' | 'other';
  isPrimary: boolean;
  isVerified: boolean;
  isActive: boolean;
}
```

**Matching Algorithm:**
```typescript
function normalizePhone(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle Egyptian numbers
  if (cleaned.startsWith('20') && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  
  // Ensure 10-digit Egyptian mobile format
  if (cleaned.length === 10 && /^(10|11|12|15)/.test(cleaned)) {
    return cleaned;
  }
  
  return cleaned;
}

async function findCustomerByPhone(clientId: string, phone: string): Promise<Customer | null> {
  const normalized = normalizePhone(phone);
  
  // Try exact match first, then partial
  const patterns = [
    normalized,
    `0${normalized}`,
    `+20${normalized}`,
    `%${normalized}%` // LIKE for variations
  ];
  
  const query = `
    SELECT c.* 
    FROM customers c
    JOIN customer_phones cp ON c.id = cp.customer_id
    WHERE c.client_id = ?
      AND c.is_deleted = 0
      AND cp.is_active = 1
      AND (
        cp.normalized_phone = ?
        OR cp.normalized_phone LIKE ?
      )
    LIMIT 1
  `;
  
  return await executeQuery(query, [clientId, normalized, `%${normalized}%`]);
}
```

### 4.2 Multiple Identification Numbers Per Customer

```typescript
interface CustomerIdentification {
  id: number;
  customerId: number;
  idNumber: string;
  label: 'national_id' | 'tax_id' | 'customer_code' | 'other';
  isPrimary: boolean;
  isActive: boolean;
}

// Lookup by any ID
async function findCustomerByIdNumber(clientId: string, idNumber: string): Promise<Customer | null> {
  const query = `
    SELECT c.*, cin.label as id_label
    FROM customers c
    JOIN customer_identification_numbers cin ON c.id = cin.customer_id
    WHERE c.client_id = ?
      AND cin.id_number = ?
      AND cin.is_active = 1
      AND c.is_deleted = 0
    LIMIT 1
  `;
  
  return await executeQuery(query, [clientId, idNumber]);
}
```

### 4.3 Customer Type Resolution

```typescript
enum CustomerType {
  REGISTERED = 'registered',  // Long-time, verified customers
  REGULAR = 'regular',        // Casual inquirers
}

interface CustomerContext {
  customer: Customer | null;
  customerType: CustomerType;
  phones: CustomerPhone[];
  idNumbers: CustomerIdentification[];
  isIdentified: boolean;
}

async function resolveCustomerContext(
  clientId: string,
  phone: string,
  idNumber?: string
): Promise<CustomerContext> {
  // Try phone first
  let customer = await findCustomerByPhone(clientId, phone);
  
  // If not found and ID provided, try ID
  if (!customer && idNumber) {
    customer = await findCustomerByIdNumber(clientId, idNumber);
  }
  
  if (!customer) {
    return {
      customer: null,
      customerType: CustomerType.REGULAR,
      phones: [],
      idNumbers: [],
      isIdentified: false,
    };
  }
  
  const phones = await getCustomerPhones(customer.id);
  const idNumbers = await getCustomerIdNumbers(customer.id);
  
  return {
    customer,
    customerType: customer.customer_type === 'registered' 
      ? CustomerType.REGISTERED 
      : CustomerType.REGULAR,
    phones,
    idNumbers,
    isIdentified: true,
  };
}
```

---

## 5. Two-Tier Response System

### 5.1 Tier 1: Registered Customers (Long-Time)

**Access Level:** Full access to all features

| Feature | Description | Response Format |
|---------|-------------|-----------------|
| Invoice Query | Retrieve invoice by number or date | Structured text + PDF |
| Debt Query | Current outstanding balance | Text with amount |
| Payment History | Payments for specific period | Structured list + PDF |
| Statement Request | Full account statement | PDF document |
| Scheduled Reports | Auto-sent periodic reports | Scheduled messages |
| Auto Invoices | Receive invoices automatically | PDF + text |

**Example Responses:**
```
💰 رصيدك الحالي: 5,250 ج.م
📋 آخر دفعة: 1,000 ج.م (2024-01-15)
📊 كشف حسابك جاهز - اضغط للعرض
```

### 5.2 Tier 2: Casual Customers (Regular)

**Access Level:** Intent-based responses, limited queries

| Feature | Description | Response Format |
|---------|-------------|-----------------|
| Intent Detection | Understand what customer wants | N/A (internal) |
| Trader Recommendation | Find nearest trader by location | Trader info + location |
| General Inquiry | Answer product/service questions | Text response |
| Purchase Request | Guide to make purchase | Instructions + link |
| Store Location | Find nearby store | Address + map link |

**Example Responses:**
```
👋 مرحباً بك!
📍 أقرب تاجر إليك:
   شركة XYZ للتجارة
   📍 10 شارع المثال، المعادي
   📞 01012345678
   ⭐ 4.5/5 (120 تقييم)
   📏 2.3 كم من موقعك
```

### 5.3 Response Decision Flow

```typescript
async function generateResponse(
  context: CustomerContext,
  intent: IntentResult,
  message: string
): Promise<BotReply> {
  // If not identified and requires customer data
  if (!context.isIdentified && requiresCustomerData(intent)) {
    return {
      text: 'عذراً، لم نتمكن من التعرف عليك.\n' +
            'يرجى التواصل مع خدمة العملاء على الرقم XXX\n' +
            'أو زيارة أقرب فرع.'
    };
  }
  
  switch (context.customerType) {
    case CustomerType.REGISTERED:
      return handleRegisteredCustomerResponse(context, intent, message);
    case CustomerType.REGULAR:
      return handleRegularCustomerResponse(context, intent, message);
  }
}

function requiresCustomerData(intent: IntentResult): boolean {
  return ['invoice_query', 'debt_query', 'payment_query', 'statement_query']
    .includes(intent.intent);
}
```

---

## 6. Trader Location Feature

### 6.1 Distance Calculation - Haversine Formula

```typescript
interface Coordinates {
  latitude: number;
  longitude: number;
}

interface DistanceResult {
  distanceKm: number;
  distanceMeters: number;
}

// Haversine formula for great-circle distance
function calculateHaversineDistance(
  point1: Coordinates,
  point2: Coordinates
): DistanceResult {
  const R = 6371; // Earth's radius in kilometers
  
  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLon = toRadians(point2.longitude - point1.longitude);
  
  const a = Math.sin(deltaLat / 2) ** 2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLon / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  const distanceKm = R * c;
  
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    distanceMeters: Math.round(distanceKm * 1000),
  };
}
```

### 6.2 Location Extraction from Message

```typescript
// Extract area/location from natural language
async function extractLocationFromMessage(
  message: string,
  customerPhone?: string
): Promise<Coordinates | null> {
  // Method 1: Explicit location in message
  const locationPatterns = [
    /أنا من\s*(.+)/i,
    /من\s*(.+)/i,
    /أعيش في\s*(.+)/i,
    /أسكن\s*(.+)/i,
    /في\s*(.+)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match) {
      const areaName = match[1].trim();
      const coords = await geocodeAddress(areaName);
      if (coords) return coords;
    }
  }
  
  // Method 2: Use customer's stored location
  if (customerPhone) {
    const customer = await findCustomerByPhone(clientId, customerPhone);
    if (customer?.latitude && customer?.longitude) {
      return {
        latitude: customer.latitude,
        longitude: customer.longitude,
      };
    }
  }
  
  // Method 3: Text-based area matching
  const areaCoords = await findAreaCoordinates(message);
  if (areaCoords) return areaCoords;
  
  return null;
}
```

### 6.3 Geocoding Strategy

```typescript
interface GeocodingProvider {
  name: string;
  geocode(address: string): Promise<Coordinates | null>;
  reverseGeocode(lat: number, lon: number): Promise<string | null>;
}

// Primary: Nominatim (OpenStreetMap) - Free
// Secondary: Google Maps API (paid, more accurate)
// Tertiary: Local database of known areas

class GeocodingService {
  private providers: GeocodingProvider[];
  
  async geocode(address: string): Promise<Coordinates | null> {
    // Try each provider in order
    for (const provider of this.providers) {
      try {
        const result = await provider.geocode(address);
        if (result) return result;
      } catch (error) {
        logger.warn(`Geocoding failed for ${provider.name}:`, error);
      }
    }
    return null;
  }
}
```

### 6.4 Find Nearest Trader

```typescript
interface TraderWithDistance {
  trader: Trader;
  distanceKm: number;
  distanceMeters: number;
}

async function findNearestTrader(
  clientId: string,
  customerLocation: Coordinates,
  maxDistanceKm: number = 50
): Promise<TraderWithDistance[]> {
  const traders = await query<Trader>(`
    SELECT * FROM traders 
    WHERE client_id = ? 
      AND is_active = 1
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL
  `, [clientId]);
  
  const tradersWithDistance: TraderWithDistance[] = [];
  
  for (const trader of traders) {
    const distance = calculateHaversineDistance(
      customerLocation,
      { latitude: trader.latitude, longitude: trader.longitude }
    );
    
    if (distance.distanceKm <= maxDistanceKm) {
      tradersWithDistance.push({
        trader,
        ...distance,
      });
    }
  }
  
  // Sort by distance
  tradersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  
  return tradersWithDistance;
}
```

### 6.5 Fallback: Text-Based Address Matching

```typescript
// When geocoding fails, use text matching
async function findTraderByTextMatch(
  clientId: string,
  searchText: string
): Promise<Trader[]> {
  const traders = await query<Trader>(`
    SELECT * FROM traders 
    WHERE client_id = ? 
      AND is_active = 1
      AND (
        name LIKE ?
        OR address_text LIKE ?
        OR JSON_SEARCH(service_areas, 'one', ?) IS NOT NULL
      )
    LIMIT 5
  `, [clientId, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`]);
  
  return traders;
}
```

---

## 7. Token Optimization Strategy

### 7.1 Design Principles

1. **Intent Detection Only:** AI is used ONLY for classifying intent, not for generating responses
2. **No Conversation Memory:** Each message is processed independently
3. **Structured Queries:** After intent detection, use database queries directly
4. **Template Responses:** Pre-defined response templates with variable substitution

### 7.2 Token Budget

| Component | Tokens (Estimate) |
|-----------|-------------------|
| System prompt | 20 |
| User message | ~30-50 |
| Intent classification | 5-10 |
| **Total AI Call** | **~50-80 tokens** |

### 7.3 Caching Strategy

```typescript
// Cache frequent queries
const queryCache = new Map<string, { result: any; expires: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedResult<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = queryCache.get(key);
  
  if (cached && cached.expires > Date.now()) {
    return cached.result as T;
  }
  
  const result = await fetcher();
  queryCache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
  
  return result;
}

// Usage
async function getCustomerDebt(customerId: string): Promise<number> {
  return getCachedResult(`debt:${customerId}`, async () => {
    const result = await query(`SELECT SUM(balance) as total FROM ...`);
    return result[0]?.total ?? 0;
  });
}
```

### 7.4 Batch Responses

```typescript
// For scheduled reports, batch messages to reduce API calls
class BatchMessageQueue {
  private queue: QueuedMessage[] = [];
  private flushInterval: number = 30000; // 30 seconds
  
  async add(message: QueuedMessage): Promise<void> {
    this.queue.push(message);
    
    if (this.queue.length >= 100) {
      await this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const messages = [...this.queue];
    this.queue = [];
    
    await this.sendBatch(messages);
  }
}
```

---

## 8. Implementation Phases

### Phase 1: Database Schema & Customer ID System
**Estimated Duration:** 1 week  
**Dependencies:** None

| Task | Description |
|------|-------------|
| 1.1 | Create `customer_identification_numbers` table |
| 1.2 | Create `traders` table |
| 1.3 | Create `trader_service_areas` table |
| 1.4 | Add location fields to `customers` table |
| 1.5 | Add `customer_type` enum field |
| 1.6 | Implement multi-phone lookup API |
| 1.7 | Implement multi-ID lookup API |
| 1.8 | Update customer forms to capture location |
| 1.9 | Write migration scripts |

### Phase 2: AI Intent Detection Integration
**Estimated Duration:** 1-2 weeks  
**Dependencies:** Phase 1 complete

| Task | Description |
|------|-------------|
| 2.1 | Design intent schema and types |
| 2.2 | Implement AI provider interface |
| 2.3 | Create token-efficient prompts |
| 2.4 | Implement intent detection service |
| 2.5 | Add regex fallback system |
| 2.6 | Implement intent routing logic |
| 2.7 | Add caching layer for AI responses |
| 2.8 | Error handling and retry logic |
| 2.9 | Unit tests for intent detection |

### Phase 3: Trader Location Feature
**Estimated Duration:** 1 week  
**Dependencies:** Phase 1 complete

| Task | Description |
|------|-------------|
| 3.1 | Implement Haversine distance calculation |
| 3.2 | Create geocoding service interface |
| 3.3 | Integrate Nominatim geocoding |
| 3.4 | Implement location extraction from messages |
| 3.5 | Create nearest trader lookup |
| 3.6 | Add trader management API |
| 3.7 | Build trader distance response formatter |
| 3.8 | Add text-based address fallback |
| 3.9 | Admin UI for trader management |

### Phase 4: Two-Tier Response System
**Estimated Duration:** 1-2 weeks  
**Dependencies:** Phases 1, 2, 3 complete

| Task | Description |
|------|-------------|
| 4.1 | Implement customer context resolution |
| 4.2 | Create registered customer response handlers |
| 4.3 | Create casual customer response handlers |
| 4.4 | Build response templates library |
| 4.5 | Implement response decision logic |
| 4.6 | Add PDF generation for statements |
| 4.7 | Implement multi-language support |
| 4.8 | End-to-end testing |

### Phase 5: Scheduled Reports (Registered Customers)
**Estimated Duration:** 1 week  
**Dependencies:** Phase 4 complete

| Task | Description |
|------|-------------|
| 5.1 | Design scheduled report configuration |
| 5.2 | Implement report scheduling service |
| 5.3 | Create auto-invoice feature |
| 5.4 | Build report template system |
| 5.5 | Implement batch message queue |
| 5.6 | Add scheduling UI in admin panel |
| 5.7 | Monitoring and alerting |
| 5.8 | Performance optimization |

---

## 9. API Changes

### 9.1 New Endpoints

#### Customer ID Management

```
POST   /api/v1/customers/:id/identification-numbers
       - Add identification number to customer
       Body: { idNumber: string, label: string, isPrimary: boolean }

GET    /api/v1/customers/:id/identification-numbers
       - List all identification numbers for customer

DELETE /api/v1/customers/:id/identification-numbers/:numberId
       - Remove identification number

PATCH  /api/v1/customers/:id/identification-numbers/:numberId
       - Update identification number details
```

#### Customer Phone Management

```
POST   /api/v1/customers/:id/phones
       - Add phone number to customer
       Body: { phone: string, label: string, isPrimary: boolean }

GET    /api/v1/customers/:id/phones
       - List all phone numbers for customer

DELETE /api/v1/customers/:id/phones/:phoneId
       - Remove phone number

PATCH  /api/v1/customers/:id/phones/:phoneId
       - Update phone number details
```

#### Trader Management

```
POST   /api/v1/traders
       - Create new trader
       Body: { name: string, phone: string, address: string, 
               latitude: number, longitude: number, serviceAreas: string[] }

GET    /api/v1/traders
       - List all traders (with pagination, filters)

GET    /api/v1/traders/:id
       - Get trader details

PATCH  /api/v1/traders/:id
       - Update trader details

DELETE /api/v1/traders/:id
       - Deactivate trader

GET    /api/v1/traders/nearest
       - Find nearest traders
       Query: ?lat=30.0444&lon=31.2357&maxDistance=50
```

#### Customer Lookup

```
GET    /api/v1/customers/lookup
       - Lookup customer by phone or ID number
       Query: ?phone=01012345678 or ?idNumber=123456789
```

### 9.2 Modified Endpoints

#### WhatsApp Bot Message

```
POST   /api/v1/whatsapp/bot/message
       - Existing endpoint, add new fields
       Body: {
         accountId: string,
         senderPhone: string,
         messageText: string,
         idNumber?: string,        // NEW: Optional ID for verification
         location?: {             // NEW: Optional location
           latitude: number,
           longitude: number
         }
       }
```

### 9.3 Response Format Changes

```typescript
// Enhanced BotReply with intent info
interface BotReply {
  text: string;
  media?: {
    base64: string;
    filename: string;
    caption?: string;
  };
  intent?: IntentType;           // NEW
  customerType?: CustomerType;    // NEW
  traderInfo?: TraderSummary[];   // NEW
}
```

---

## 10. Security Considerations

### 10.1 Phone Number Validation

```typescript
function validateEgyptianPhone(phone: string): ValidationResult {
  const cleaned = phone.replace(/\D/g, '');
  
  // Egyptian mobile: 10 digits starting with 010, 011, 012, 015
  const egyptianMobileRegex = /^(10|11|12|15)\d{8}$/;
  
  // Egyptian landline: 10 digits starting with 02
  const egyptianLandlineRegex = /^2\d{9}$/;
  
  if (egyptianMobileRegex.test(cleaned)) {
    return { valid: true, type: 'mobile', normalized: cleaned };
  }
  
  if (egyptianLandlineRegex.test(cleaned)) {
    return { valid: true, type: 'landline', normalized: cleaned };
  }
  
  return { valid: false, type: null, normalized: cleaned };
}
```

### 10.2 Rate Limiting

```typescript
interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;      // Max requests per window
  keyGenerator: (context: BotContext) => string;
}

const BOT_RATE_LIMITS: RateLimitConfig[] = [
  { windowMs: 60000, maxRequests: 10, keyGenerator: (c) => c.senderPhone },  // 10/min per user
  { windowMs: 3600000, maxRequests: 100, keyGenerator: (c) => c.clientId },   // 100/hour per client
];

class RateLimiter {
  private limits = new Map<string, { count: number; resetAt: number }>();
  
  async checkLimit(context: BotContext): Promise<RateLimitResult> {
    for (const config of BOT_RATE_LIMITS) {
      const key = config.keyGenerator(context);
      const limit = this.limits.get(key);
      
      if (limit) {
        if (Date.now() < limit.resetAt) {
          if (limit.count >= config.maxRequests) {
            return {
              allowed: false,
              retryAfterMs: limit.resetAt - Date.now(),
              reason: 'Rate limit exceeded'
            };
          }
          limit.count++;
        } else {
          this.limits.set(key, {
            count: 1,
            resetAt: Date.now() + config.windowMs
          });
        }
      }
    }
    
    return { allowed: true };
  }
}
```

### 10.3 Customer Data Protection

```typescript
// PII masking in logs
function maskPhoneForLogging(phone: string): string {
  if (phone.length < 4) return '****';
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

// Consent tracking
interface CustomerConsent {
  customerId: number;
  whatsappConsent: boolean;
  marketingConsent: boolean;
  consentDate: Date;
  ipAddress: string;
}

// Data retention
const DATA_RETENTION = {
  whatsappMessages: 90,    // days
  botInteractionLogs: 180, // days
  intentHistory: 30,       // days
};
```

### 10.4 Input Sanitization

```typescript
function sanitizeMessageInput(message: string): string {
  // Remove potentially harmful characters
  let sanitized = message
    .trim()
    .slice(0, 500)  // Max length
    .replace(/[<>]/g, '')  // Remove angle brackets
    .replace(/javascript:/gi, '')  // Remove javascript protocol
    .replace(/on\w+=/gi, '')  // Remove event handlers
    .replace(/\0/g, '');  // Remove null bytes
  
  return sanitized;
}
```

---

## 11. File Structure

```
backend/src/
├── services/
│   ├── whatsapp/
│   │   ├── BotService.ts           # Core bot logic
│   │   ├── MessageService.ts       # Message handling
│   │   ├── ConnectionManager.ts     # WhatsApp connection
│   │   ├── types.ts                # Shared types
│   │   ├── index.ts                # Exports
│   │   │
│   │   ├── v2/                     # NEW: Bot v2 modules
│   │   │   ├── index.ts
│   │   │   ├── IntentDetector.ts   # AI intent detection
│   │   │   ├── CustomerResolver.ts # Multi-ID/phone resolution
│   │   │   ├── TraderLocator.ts    # Distance calculation
│   │   │   ├── GeocodingService.ts # Address geocoding
│   │   │   ├── ResponseGenerator.ts# Two-tier response system
│   │   │   ├── ResponseTemplates.ts# Message templates
│   │   │   ├── RateLimiter.ts      # Rate limiting
│   │   │   └── types/
│   │   │       ├── intents.ts     # Intent definitions
│   │   │       ├── customer.ts     # Customer types
│   │   │       └── trader.ts       # Trader types
│   │   │
│   │   └── ai/
│   │       ├── providers/
│   │       │   ├── openai.ts
│   │       │   ├── anthropic.ts
│   │       │   └── local.ts
│   │       └── IntentClassifier.ts
│   │
│   └── scheduled/
│       └── ReportScheduler.ts      # Scheduled reports
│
├── routes/
│   ├── whatsapp.ts                 # WhatsApp routes
│   ├── traders.ts                  # NEW: Trader endpoints
│   └── customers.ts                # Enhanced customer endpoints
│
├── models/
│   ├── Customer.ts
│   ├── Trader.ts                  # NEW
│   └── CustomerIdentification.ts  # NEW
│
├── migrations/
│   ├── 2024-01-15-add-customer-location.ts
│   ├── 2024-01-16-add-traders-table.ts
│   └── 2024-01-17-add-customer-identification.ts
│
└── config/
    └── ai-config.ts                # AI provider settings

src/services/whatsapp/
├── whatsappBotListener.ts          # Frontend bot service
├── whatsappBotService.ts           # Bot service wrapper
├── whatsappApiClient.ts           # API client
└── whatsappService.ts             # Main service
```

---

## 12. Configuration

### 12.1 Environment Variables

```bash
# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-3.5-turbo-instruct
AI_API_KEY=sk-...
AI_ENDPOINT=https://api.openai.com/v1
AI_MAX_TOKENS=20
AI_TEMPERATURE=0.1

# Geocoding
GEOCODING_PROVIDER=nominatim
GOOGLE_MAPS_API_KEY=...
NOMINATIM_ENDPOINT=https://nominatim.openstreetmap.org

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

# Cache
CACHE_TTL_MS=300000

# WhatsApp Bot v2
BOT_V2_ENABLED=true
BOT_FALLBACK_TO_REGEX=true
BOT_MAX_MESSAGE_LENGTH=500
```

### 12.2 Feature Flags

```typescript
const FEATURE_FLAGS = {
  WHATSAPP_BOT_V2: process.env.WHATSAPP_BOT_V2_ENABLED === 'true',
  AI_INTENT_DETECTION: process.env.AI_INTENT_ENABLED !== 'false',
  TRADER_LOCATION: process.env.TRADER_LOCATION_ENABLED === 'true',
  SCHEDULED_REPORTS: process.env.SCHEDULED_REPORTS_ENABLED === 'true',
  MULTI_ID_LOOKUP: process.env.MULTI_ID_LOOKUP_ENABLED === 'true',
  MULTI_PHONE_LOOKUP: process.env.MULTI_PHONE_LOOKUP_ENABLED === 'true',
};
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

```typescript
// Intent detection tests
describe('IntentDetector', () => {
  test('should detect invoice query intent');
  test('should detect debt query intent');
  test('should detect nearest trader intent');
  test('should fallback to regex on AI failure');
  test('should handle ambiguous messages');
});

// Distance calculation tests
describe('TraderLocator', () => {
  test('should calculate correct Haversine distance');
  test('should sort traders by distance');
  test('should filter by max distance');
  test('should handle edge cases (same location, antipodes)');
});

// Customer resolution tests
describe('CustomerResolver', () => {
  test('should find customer by primary phone');
  test('should find customer by secondary phone');
  test('should find customer by ID number');
  test('should prioritize registered customers');
  test('should handle not found gracefully');
});
```

### 13.2 Integration Tests

```typescript
describe('Bot v2 Integration', () => {
  test('full flow: casual customer asks for nearest trader');
  test('full flow: registered customer requests statement');
  test('full flow: unregistered customer tries to access data');
  test('rate limiting enforcement');
  test('AI fallback to regex');
});
```

---

## 14. Performance Metrics

### 14.1 Key Performance Indicators

| Metric | Target | Critical |
|--------|--------|----------|
| Intent detection latency | < 500ms | < 2000ms |
| Message response time | < 3s | < 10s |
| Trader lookup time | < 100ms | < 500ms |
| AI API success rate | > 99% | > 95% |
| Cache hit rate | > 80% | - |

### 14.2 Monitoring

```typescript
// Metrics to track
const METRICS = {
  intentDetectionCount: Counter,
  intentDetectionLatency: Histogram,
  intentConfidence: Histogram,
  customerIdentified: Counter,
  customerNotFound: Counter,
  traderLookupCount: Counter,
  traderLookupDistance: Histogram,
  rateLimitHits: Counter,
  aiFallbackCount: Counter,
};
```

---

## 15. Migration Plan

### 15.1 Backward Compatibility

1. **Keep existing regex patterns** as fallback
2. **New fields optional** in database
3. **Gradual rollout** via feature flags
4. **Parallel processing** - both v1 and v2 handlers active during transition

### 15.2 Data Migration

```sql
-- Migrate existing customers with phones to new schema
INSERT INTO customer_phones (customer_id, phone, normalized_phone, label, is_primary, is_active)
SELECT id, phone, normalizePhone(phone), 'mobile', TRUE, TRUE
FROM customers
WHERE phone IS NOT NULL AND phone != '';

-- Set existing customers as 'regular' type
UPDATE customers SET customer_type = 'regular' WHERE customer_type IS NULL;
```

### 15.3 Rollback Plan

1. Disable feature flag `WHATSAPP_BOT_V2=false`
2. All requests fall back to BotService.ts (v1)
3. No data loss - v2 adds columns, doesn't modify existing data
4. Re-enable v1 by switching feature flag

---

## 16. Future Enhancements (Out of Scope)

- Full NLP chatbot with conversation history
- Voice message processing
- Multi-language support (English, Arabic)
- Integration with external CRM
- Advanced analytics dashboard
- A/B testing for response strategies
- Customer sentiment analysis
- Predictive customer behavior

---

## 17. Glossary

| Term | Definition |
|------|-------------|
| **Registered Customer** | Long-time verified customer with dedicated ID, can access invoices, statements, debt info |
| **Regular Customer** | Casual inquirer who messages via WhatsApp/Facebook, gets intent-based responses |
| **Intent Detection** | AI-powered classification of customer message purpose |
| **Hybrid AI** | Combined approach using AI for intent + regex/structured queries for responses |
| **Haversine Formula** | Mathematical formula to calculate great-circle distance between two points |
| **Geocoding** | Converting addresses to geographic coordinates |
| **Token Optimization** | Minimizing AI API tokens for cost efficiency |

---

## 18. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | | | |
| Reviewer | | | |
| Architect | | | |
| Project Manager | | | |

---

*Document generated: 2026-03-25*

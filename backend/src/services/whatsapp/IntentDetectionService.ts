/**
 * AI Intent Detection Service
 * Token-efficient: ~50 tokens per classification
 * Uses OpenRouter API with cheap/fast models
 */

import { IntentResult, IntentType } from './types.js';
import { query } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";

const INTENT_PROMPT = `Classify this WhatsApp message. Respond ONLY with JSON.

Message: "{message}"

Intents:
- invoice_query: asks about a specific invoice or last invoice
- debt_query: asks about balance or debt
- payment_query: asks about payments made
- statement_query: asks for account statement
- nearest_trader: asks about nearest trader or vendor
- location_info: says "I'm from [area]" or shares location
- general_inquiry: other questions
- unknown: unclear

Extract entities: invoice_number, customer_id_number, month, area_name, customer_name

Response format:
{"intent":"intent_name","confidence":0.9,"entities":{"invoiceNumber":"","customerIdNumber":"","month":"","areaName":"","customerName":""}}`;

/**
 * Call OpenRouter API for intent detection
 * Token-efficient: only called when regex doesn't match (~50 tokens per call)
 */
async function callAI(message: string): Promise<IntentResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  
  if (!apiKey) {
    logger.warn('No OPENROUTER_API_KEY configured, using fallback intent detection');
    return fallbackIntentDetection(message);
  }

  logger.info({ apiUrl, model, keyPrefix: apiKey.substring(0, 15) }, 'Calling OpenRouter API');

  const prompt = INTENT_PROMPT.replace('{message}', message);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://mypos.app',
        'X-Title': 'MYPOS WhatsApp Bot',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', // cheap/fast model
        messages: [
          {
            role: 'system',
            content: 'You are a WhatsApp message classifier for a POS system. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1, // low temperature for consistent classification
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Empty AI response');
    }

    return parseAIResponse(content, message);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      message,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : null
    }, 'AI intent detection failed');
    return fallbackIntentDetection(message);
  }
}

/**
 * Parse AI response into IntentResult
 */
function parseAIResponse(content: string, rawMessage: string): IntentResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackIntentDetection(rawMessage);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const intent = normalizeIntent(parsed.intent);
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
    const entities = {
      invoiceNumber: parsed.entities?.invoiceNumber || parsed.entities?.invoice_number || undefined,
      customerIdNumber: parsed.entities?.customerIdNumber || parsed.entities?.customer_id_number || undefined,
      month: parsed.entities?.month || undefined,
      areaName: parsed.entities?.areaName || parsed.entities?.area_name || undefined,
      customerName: parsed.entities?.customerName || parsed.entities?.customer_name || undefined,
    };

    return { intent, confidence, entities, rawMessage };
  } catch (error) {
    logger.warn({ error, content }, 'Failed to parse AI response');
    return fallbackIntentDetection(rawMessage);
  }
}

/**
 * Normalize intent string to IntentType
 */
function normalizeIntent(intent: string): IntentType {
  const normalized = (intent || '').toLowerCase().trim();
  
  const intentMap: Record<string, IntentType> = {
    'invoice_query': 'invoice_query',
    'invoice': 'invoice_query',
    'debt_query': 'debt_query',
    'debt': 'debt_query',
    'balance': 'debt_query',
    'payment_query': 'payment_query',
    'payment': 'payment_query',
    'payments': 'payment_query',
    'statement_query': 'statement_query',
    'statement': 'statement_query',
    'account_statement': 'statement_query',
    'nearest_trader': 'nearest_trader',
    'nearest': 'nearest_trader',
    'trader': 'nearest_trader',
    'vendor': 'nearest_trader',
    'location_info': 'location_info',
    'location': 'location_info',
    'from': 'location_info',
    'area': 'location_info',
    'general_inquiry': 'general_inquiry',
    'general': 'general_inquiry',
    'inquiry': 'general_inquiry',
    'question': 'general_inquiry',
  };

  return intentMap[normalized] || 'unknown';
}

/**
 * Fallback regex-based intent detection when AI is unavailable
 */
function fallbackIntentDetection(message: string): IntentResult {
  const text = message.trim().toLowerCase();
  
  // Invoice queries
  if (/فاتور|invoice/i.test(text) || /رقم\s*\d+/i.test(text)) {
    const invoiceMatch = text.match(/(\d{4,})/);
    return {
      intent: 'invoice_query',
      confidence: 0.6,
      entities: { invoiceNumber: invoiceMatch?.[1] },
      rawMessage: message,
    };
  }

  // Debt/balance queries
  if (/مديون|رصيد|balance|debt/i.test(text)) {
    return {
      intent: 'debt_query',
      confidence: 0.7,
      entities: {},
      rawMessage: message,
    };
  }

  // Payment queries
  if (/مدفوع|payment/i.test(text)) {
    return {
      intent: 'payment_query',
      confidence: 0.7,
      entities: {},
      rawMessage: message,
    };
  }

  // Statement queries
  if (/كشف\s*حساب|statement|account/i.test(text)) {
    return {
      intent: 'statement_query',
      confidence: 0.7,
      entities: {},
      rawMessage: message,
    };
  }

  // Nearest trader queries
  if (/اقرب|nearest| trader |vendor/i.test(text)) {
    return {
      intent: 'nearest_trader',
      confidence: 0.7,
      entities: {},
      rawMessage: message,
    };
  }

  // Location info
  if (/من\s*|from\s+|في\s+|^[اآ-يی]+$/i.test(text)) {
    const areaMatch = text.match(/(?:من|في)\s*([^\s\d]+)/i);
    return {
      intent: 'location_info',
      confidence: 0.6,
      entities: { areaName: areaMatch?.[1] },
      rawMessage: message,
    };
  }

  return {
    intent: 'unknown',
    confidence: 0.3,
    entities: {},
    rawMessage: message,
  };
}

/**
 * Main intent detection function - tries AI first, falls back to regex
 */
export async function detectIntent(message: string): Promise<IntentResult> {
  return callAI(message);
}

/**
 * Answer a general inquiry using AI with company context.
 * Used when the sender asks something outside the bot's structured commands.
 * Works for both registered and unregistered customers.
 *
 * @param message   - the user's question
 * @param companyInfo - owner-provided context (products, hours, address, etc.)
 */
export async function answerGeneralInquiry(
  message: string,
  companyInfo: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

  if (!apiKey) {
    logger.warn('answerGeneralInquiry: No OPENROUTER_API_KEY - returning fallback');
    return 'عذراً، لا يمكنني الإجابة على هذا السؤال حالياً.\nتواصل معنا مباشرة للمساعدة 🙏';
  }

  const systemPrompt = companyInfo
    ? `أنت مساعد ذكي لشركة على واتساب. تعامل مع العملاء بأدب واحترافية.
استخدم المعلومات التالية للرد على استفسارات العملاء:

${companyInfo}

قواعد:
- رد دائماً باللغة العربية بأسلوب ودود ومختصر
- لا تخترع معلومات غير موجودة في السياق أعلاه
- إذا لم تعرف الإجابة قل ذلك بصراحة واطلب التواصل المباشر`
    : `أنت مساعد ذكي على واتساب. رد على استفسارات العملاء باللغة العربية بأسلوب ودود ومختصر.
إذا لم تعرف الإجابة اطلب التواصل المباشر مع الشركة.`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://mypos.app',
        'X-Title': 'MYPOS WhatsApp Bot',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) throw new Error('Empty AI response');

    logger.info({ messageSnippet: message.slice(0, 40) }, 'answerGeneralInquiry: AI reply generated');
    return content;
  } catch (error) {
    logger.error({ error }, 'answerGeneralInquiry: AI call failed');
    return 'عذراً، حدث خطأ مؤقت.\nاتصل بنا مباشرة للمساعدة 🙏';
  }
}


/**
 * Find customer by ID number (national ID / driver license / etc.)
 */
export async function findCustomerByIdNumber(
  clientId: string,
  idNumber: string,
): Promise<any | null> {
  const rows = await query<any>(
    `SELECT c.* FROM customer_identification_numbers cin
     JOIN customers c ON cin.customer_id = c.id
     WHERE cin.id_number = ? AND cin.is_active = 1
     AND c.client_id = ? AND c.is_deleted = 0 LIMIT 1`,
    [idNumber, clientId],
  );
  return rows[0] ?? null;
}

/**
 * Find customer by phone - enhanced with multi-phone table support
 */
export async function findCustomerByPhoneEnhanced(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<any | null> {
  const normalized = normalizePhoneNumber(senderPhone);
  if (!normalized) return null;

  // 1. Check customer_phones table (multi-phone support)
  const phoneConditions = branchId
    ? `cp.is_active = 1 AND c.client_id = ? AND c.branch_id = ? AND c.is_deleted = 0`
    : `cp.is_active = 1 AND c.client_id = ? AND c.is_deleted = 0`;
  
  const phoneParams = branchId
    ? [clientId, branchId]
    : [clientId];

  const phoneRows = await query<any>(
    `SELECT cp.*, c.*, cp.phone as primary_phone 
     FROM customer_phones cp 
     JOIN customers c ON cp.customer_id = c.id 
     WHERE ${phoneConditions} 
     AND (cp.phone LIKE ? OR cp.phone LIKE ? OR cp.phone LIKE ? OR cp.phone LIKE ?)
     LIMIT 1`,
    [...phoneParams, `%${normalized}%`, `0${normalized}%`, `20${normalized}%`, `+20${normalized}%`],
  );

  if (phoneRows[0]) {
    return phoneRows[0];
  }

  // 2. Fallback: check customers.phone (backward compatibility)
  const patterns = [normalized, `0${normalized}`, `20${normalized}`, `+20${normalized}`];
  const placeholders = patterns.map(() => "phone LIKE ?").join(" OR ");
  const conditions = branchId
    ? `client_id = ? AND branch_id = ? AND is_deleted = 0 AND (${placeholders})`
    : `client_id = ? AND is_deleted = 0 AND (${placeholders})`;
  const values = branchId ? [clientId, branchId, ...patterns.map(p => `%${p}%`)] : [clientId, ...patterns.map(p => `%${p}%`)];

  const rows = await query<any>(
    `SELECT * FROM customers WHERE ${conditions} LIMIT 1`,
    values,
  );

  return rows[0] ?? null;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find nearest traders to a given location
 */
export async function findNearestTraders(
  clientId: string,
  latitude: number,
  longitude: number,
  limit: number = 3,
): Promise<any[]> {
  const traders = await query<any>(
    `SELECT * FROM traders 
     WHERE client_id = ? AND is_active = 1 
     AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [clientId],
  );

  return traders
    .map((t) => ({
      ...t,
      distance: calculateDistance(latitude, longitude, t.latitude, t.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Normalize phone number for database lookup
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('20') && clean.length > 10) clean = clean.slice(2);
  if (clean.startsWith('0')) clean = clean.slice(1);
  return clean;
}

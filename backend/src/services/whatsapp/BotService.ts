/**
 * WhatsApp Bot Service (Server-Side)
 * بوت الواتساب - يعمل على السيرفر مع اتصال مباشر بقاعدة البيانات
 *
 * الأوامر:
 * - مساعدة / help → قائمة الأوامر
 * - فاتورة رقم XXXX → تفاصيل فاتورة
 * - آخر فاتورة → آخر فاتورة للمرسل
 * - آخر فاتورة للعميل XXXX → آخر فاتورة لعميل
 * - المدفوعات → كشف المدفوعات
 * - كشف حساب → كشف حساب كامل
 * - المديونية / الرصيد → الرصيد الحالي
 */

import { query } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import { BotReply, BotSettings } from "./types.js";

// ─── Bot Settings Storage (per client) ───────────────────────────

const botSettingsMap = new Map<string, BotSettings>();

const DEFAULT_SETTINGS: BotSettings = {
  enabled: true,
  allowedSenders: "all",
  welcomeMessage: "مرحباً بك في نظام MASR POS 👋\nاكتب *مساعدة* لمعرفة الأوامر المتاحة",
  unknownCommandMessage: "❌ أمر غير معروف\nاكتب *مساعدة* لمعرفة الأوامر المتاحة",
};

// ─── Public API ──────────────────────────────────────────────────

export function getBotSettings(clientId: string): BotSettings {
  return botSettingsMap.get(clientId) ?? { ...DEFAULT_SETTINGS };
}

export function saveBotSettings(clientId: string, settings: BotSettings): void {
  botSettingsMap.set(clientId, settings);
}

/**
 * معالجة رسالة واردة واستخراج الرد المناسب
 */
export async function handleBotMessage(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
  messageText: string,
): Promise<BotReply | null> {
  const settings = getBotSettings(clientId);
  if (!settings.enabled) return null;

  const message = messageText.trim();
  if (!message || message.length > 200) return null;

  const command = parseCommand(message);

  try {
    switch (command.type) {
      case "help":
        return { text: getHelpText() };
      case "invoice_by_number":
        return await handleInvoiceByNumber(clientId, branchId, command.params!.invoiceNumber);
      case "last_invoice":
        return await handleLastInvoice(clientId, branchId, senderPhone);
      case "last_invoice_for_customer":
        return await handleLastInvoiceForCustomer(clientId, branchId, command.params!.customerName);
      case "payments":
        return await handlePayments(clientId, branchId, senderPhone);
      case "statement":
        return await handleStatement(clientId, branchId, senderPhone);
      case "debt":
        return await handleDebt(clientId, branchId, senderPhone);
      case "unknown":
        return { text: settings.unknownCommandMessage };
      default:
        return null;
    }
  } catch (error) {
    logger.error({ error, clientId, senderPhone, messageText }, "Bot error");
    return { text: "⚠️ حصل خطأ أثناء معالجة طلبك. جرب مرة تانية." };
  }
}

// ─── Command Parser ──────────────────────────────────────────────

interface ParsedCommand {
  type:
    | "invoice_by_number"
    | "last_invoice"
    | "last_invoice_for_customer"
    | "payments"
    | "statement"
    | "debt"
    | "help"
    | "unknown";
  params?: Record<string, string>;
}

function parseCommand(msg: string): ParsedCommand {
  const text = msg.trim();

  if (/^(مساعدة|مساعده|help|أوامر|الأوامر|اوامر)$/i.test(text)) {
    return { type: "help" };
  }

  const invoiceNumMatch = text.match(/فاتور[ةه]\s*(رقم\s*)?(\d+)/i);
  if (invoiceNumMatch) {
    return { type: "invoice_by_number", params: { invoiceNumber: invoiceNumMatch[2] } };
  }

  const invoiceNumMatch2 = text.match(/رقم\s*فاتور[ةه]\s*(\d+)/i);
  if (invoiceNumMatch2) {
    return { type: "invoice_by_number", params: { invoiceNumber: invoiceNumMatch2[1] } };
  }

  const lastInvoiceCustomerMatch = text.match(
    /[اآ]خر\s*فاتور[ةه]\s*(لل?عميل\s*|لـ?\s*|ل\s*)(.+)/i,
  );
  if (lastInvoiceCustomerMatch) {
    return {
      type: "last_invoice_for_customer",
      params: { customerName: lastInvoiceCustomerMatch[2].trim() },
    };
  }

  if (/^[اآ]خر\s*فاتور[ةه]$/i.test(text)) {
    return { type: "last_invoice" };
  }

  if (/^(المدفوعات|مدفوعات|الدفعات|دفعات)$/i.test(text)) {
    return { type: "payments" };
  }

  if (/^(كشف\s*حساب|كشف\s*الحساب|statement)$/i.test(text)) {
    return { type: "statement" };
  }

  if (/^(المديونية|مديونية|الرصيد|رصيد|رصيدي|المديون[يى][ةه])$/i.test(text)) {
    return { type: "debt" };
  }

  return { type: "unknown" };
}

// ─── Helpers ─────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("20") && clean.length > 10) clean = clean.slice(2);
  if (clean.startsWith("0")) clean = clean.slice(1);
  return clean;
}

function fmt(num: number | string | null | undefined): string {
  if (num === undefined || num === null || num === "") return "0";
  const n = Number(num);
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function findCustomerByPhone(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<any | null> {
  const normalized = normalizePhone(senderPhone);
  if (!normalized) return null;

  // البحث عن عميل بالرقم (بأشكال مختلفة)
  const patterns = [normalized, `0${normalized}`, `20${normalized}`, `+20${normalized}`];
  const placeholders = patterns.map(() => "phone LIKE ?").join(" OR ");
  const params = patterns.map((p) => `%${p}%`);

  const conditions = branchId
    ? `client_id = ? AND branch_id = ? AND is_deleted = 0 AND (${placeholders})`
    : `client_id = ? AND is_deleted = 0 AND (${placeholders})`;

  const values = branchId ? [clientId, branchId, ...params] : [clientId, ...params];

  const rows = await query<any>(
    `SELECT * FROM customers WHERE ${conditions} LIMIT 1`,
    values,
  );

  return rows[0] ?? null;
}

async function findCustomerByName(
  clientId: string,
  branchId: string | null,
  name: string,
): Promise<any | null> {
  const searchName = name.trim();
  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND is_deleted = 0 AND name LIKE ?"
    : "client_id = ? AND is_deleted = 0 AND name LIKE ?";
  const values = branchId
    ? [clientId, branchId, `%${searchName}%`]
    : [clientId, `%${searchName}%`];

  const rows = await query<any>(
    `SELECT * FROM customers WHERE ${conditions} LIMIT 1`,
    values,
  );

  return rows[0] ?? null;
}

// ─── Command Handlers ────────────────────────────────────────────

function getHelpText(): string {
  return `📋 *الأوامر المتاحة:*

1️⃣ *فاتورة رقم XXXX*
   مثال: فاتورة رقم 699097

2️⃣ *آخر فاتورة*
   يعرض آخر فاتورة ليك

3️⃣ *آخر فاتورة للعميل XXXX*
   مثال: آخر فاتورة للعميل أحمد

4️⃣ *المدفوعات*
   يعرض آخر المدفوعات

5️⃣ *كشف حساب*
   يعرض كشف حساب كامل

6️⃣ *المديونية*
   يعرض الرصيد الحالي

7️⃣ *مساعدة*
   عرض هذه القائمة`;
}

async function handleInvoiceByNumber(
  clientId: string,
  branchId: string | null,
  invoiceNumber: string,
): Promise<BotReply> {
  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND is_deleted = 0 AND (invoice_number = ? OR id = ?)"
    : "client_id = ? AND is_deleted = 0 AND (invoice_number = ? OR id = ?)";
  const values = branchId
    ? [clientId, branchId, invoiceNumber, invoiceNumber]
    : [clientId, invoiceNumber, invoiceNumber];

  const rows = await query<any>(
    `SELECT * FROM invoices WHERE ${conditions} LIMIT 1`,
    values,
  );

  if (rows.length === 0) {
    return { text: `❌ لم يتم العثور على فاتورة رقم ${invoiceNumber}` };
  }

  return { text: formatInvoiceMessage(rows[0]) };
}

async function handleLastInvoice(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<BotReply> {
  const customer = await findCustomerByPhone(clientId, branchId, senderPhone);
  if (!customer) {
    return {
      text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}\nجرب: *آخر فاتورة للعميل [اسم العميل]*`,
    };
  }

  return await getLastInvoiceForCustomer(clientId, branchId, customer);
}

async function handleLastInvoiceForCustomer(
  clientId: string,
  branchId: string | null,
  customerName: string,
): Promise<BotReply> {
  const customer = await findCustomerByName(clientId, branchId, customerName);
  if (!customer) {
    return { text: `❌ لم يتم العثور على عميل باسم "${customerName}"` };
  }

  return await getLastInvoiceForCustomer(clientId, branchId, customer);
}

async function getLastInvoiceForCustomer(
  clientId: string,
  branchId: string | null,
  customer: any,
): Promise<BotReply> {
  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND customer_id = ? AND is_deleted = 0"
    : "client_id = ? AND customer_id = ? AND is_deleted = 0";
  const values = branchId
    ? [clientId, branchId, customer.id]
    : [clientId, customer.id];

  const rows = await query<any>(
    `SELECT * FROM invoices WHERE ${conditions} ORDER BY created_at DESC LIMIT 1`,
    values,
  );

  if (rows.length === 0) {
    return { text: `📄 لا توجد فواتير للعميل *${customer.name}*` };
  }

  return { text: formatInvoiceMessage(rows[0], customer.name) };
}

function formatInvoiceMessage(invoice: any, customerName?: string): string {
  const name = customerName || invoice.customer_name || "عميل";
  const date = new Date(invoice.created_at).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `📄 *فاتورة رقم ${invoice.invoice_number || invoice.id}*\n`;
  msg += `👤 العميل: *${name}*\n`;
  msg += `📅 التاريخ: ${date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  const subtotal = Number(invoice.subtotal) || Number(invoice.total) || 0;
  const discount = Number(invoice.discount) || 0;
  const total = Number(invoice.total) || 0;

  if (discount > 0) {
    msg += `💰 الإجمالي: ${fmt(subtotal)}\n`;
    msg += `🏷️ الخصم: ${fmt(discount)}\n`;
    msg += `💵 الإجمالي بعد الخصم: *${fmt(total)}*\n`;
  } else {
    msg += `💵 الإجمالي: *${fmt(total)}*\n`;
  }

  const paid = Number(invoice.paid_amount) || 0;
  const remaining = Number(invoice.remaining_amount) || Math.max(0, total - paid);

  msg += `✅ المدفوع: ${fmt(paid)}\n`;
  if (remaining > 0) {
    msg += `⏳ المتبقي: *${fmt(remaining)}*\n`;
  }

  const statusMap: Record<string, string> = {
    paid: "✅ مدفوعة بالكامل",
    partial: "⚠️ مدفوعة جزئياً",
    unpaid: "🔴 غير مدفوعة",
  };
  msg += `\n${statusMap[invoice.payment_status] || ""}`;

  return msg;
}

async function handlePayments(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<BotReply> {
  const customer = await findCustomerByPhone(clientId, branchId, senderPhone);
  if (!customer) {
    return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
  }

  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND customer_id = ? AND is_deleted = 0"
    : "client_id = ? AND customer_id = ? AND is_deleted = 0";
  const values = branchId
    ? [clientId, branchId, customer.id]
    : [clientId, customer.id];

  const rows = await query<any>(
    `SELECT * FROM payments WHERE ${conditions} ORDER BY created_at DESC LIMIT 10`,
    values,
  );

  if (rows.length === 0) {
    return { text: `💰 لا توجد مدفوعات مسجلة للعميل *${customer.name}*` };
  }

  let msg = `💰 *آخر المدفوعات - ${customer.name}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  let totalPaid = 0;
  rows.forEach((pay: any, i: number) => {
    const date = new Date(pay.created_at).toLocaleDateString("ar-EG", {
      month: "short",
      day: "numeric",
    });
    const amount = Number(pay.amount) || 0;
    totalPaid += amount;
    msg += `${i + 1}. ${date} — *${fmt(amount)}* جنيه\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 إجمالي المعروض: *${fmt(totalPaid)}* جنيه`;

  return { text: msg };
}

async function handleStatement(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<BotReply> {
  const customer = await findCustomerByPhone(clientId, branchId, senderPhone);
  if (!customer) {
    return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
  }

  // آخر 30 يوم
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 30);
  const fromStr = dateFrom.toISOString().slice(0, 10);
  const toStr = dateTo.toISOString().slice(0, 10);

  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND customer_id = ? AND is_deleted = 0 AND created_at >= ? AND created_at <= ?"
    : "client_id = ? AND customer_id = ? AND is_deleted = 0 AND created_at >= ? AND created_at <= ?";

  // فواتير
  const invoiceValues = branchId
    ? [clientId, branchId, customer.id, fromStr, toStr + " 23:59:59"]
    : [clientId, customer.id, fromStr, toStr + " 23:59:59"];

  const invoices = await query<any>(
    `SELECT 'بيع' as movement, created_at, total as debit, 0 as credit 
     FROM invoices WHERE ${conditions} ORDER BY created_at`,
    invoiceValues,
  );

  // مدفوعات
  const paymentValues = branchId
    ? [clientId, branchId, customer.id, fromStr, toStr + " 23:59:59"]
    : [clientId, customer.id, fromStr, toStr + " 23:59:59"];

  const payments = await query<any>(
    `SELECT 'قبض' as movement, created_at, 0 as debit, amount as credit 
     FROM payments WHERE ${conditions} ORDER BY created_at`,
    paymentValues,
  );

  // دمج وترتيب
  const allRows = [...invoices, ...payments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (allRows.length === 0) {
    return { text: `📊 لا توجد حركات في آخر 30 يوم للعميل *${customer.name}*` };
  }

  let msg = `📊 *كشف حساب - ${customer.name}*\n`;
  msg += `📅 آخر 30 يوم\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  let balance = Number(customer.previous_statement) || 0;
  let totalSales = 0;
  let totalPayments = 0;

  const recentRows = allRows.slice(-15);
  for (const row of recentRows) {
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    balance = balance + debit - credit;
    totalSales += debit;
    totalPayments += credit;

    const date = new Date(row.created_at).toLocaleDateString("ar-EG", {
      month: "short",
      day: "numeric",
    });

    const icon = row.movement === "بيع" ? "🧾" : "💵";
    const debitStr = debit > 0 ? `+${fmt(debit)}` : "";
    const creditStr = credit > 0 ? `-${fmt(credit)}` : "";

    msg += `${icon} ${date} | ${row.movement} | ${debitStr}${creditStr} | الرصيد: ${fmt(balance)}\n`;
  }

  if (allRows.length > 15) {
    msg += `\n... و ${allRows.length - 15} حركة أخرى\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📈 إجمالي المبيعات: ${fmt(totalSales)}\n`;
  msg += `💵 إجمالي المدفوع: ${fmt(totalPayments)}\n`;
  msg += `\n💳 *الرصيد الحالي: ${fmt(balance)} جنيه*`;

  return { text: msg };
}

async function handleDebt(
  clientId: string,
  branchId: string | null,
  senderPhone: string,
): Promise<BotReply> {
  const customer = await findCustomerByPhone(clientId, branchId, senderPhone);
  if (!customer) {
    return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
  }

  // حساب الرصيد الفعلي: فواتير - مدفوعات - مرتجعات + رصيد سابق
  const conditions = branchId
    ? "client_id = ? AND branch_id = ? AND customer_id = ? AND is_deleted = 0"
    : "client_id = ? AND customer_id = ? AND is_deleted = 0";
  const values = branchId
    ? [clientId, branchId, customer.id]
    : [clientId, customer.id];

  const [salesRows] = await Promise.all([
    query<any>(
      `SELECT COALESCE(SUM(total), 0) as total_sales FROM invoices WHERE ${conditions}`,
      values,
    ),
  ]);

  const [paymentRows] = await Promise.all([
    query<any>(
      `SELECT COALESCE(SUM(amount), 0) as total_payments FROM payments WHERE ${conditions}`,
      values,
    ),
  ]);

  const totalSales = Number(salesRows[0]?.total_sales) || 0;
  const totalPayments = Number(paymentRows[0]?.total_payments) || 0;
  const previousStatement = Number(customer.previous_statement) || 0;
  const actualBalance = previousStatement + totalSales - totalPayments;

  let msg = `💳 *رصيد العميل - ${customer.name}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (actualBalance > 0) {
    msg += `🔴 المديونية: *${fmt(actualBalance)} جنيه*\n`;
    msg += `\nيوجد رصيد مستحق عليك`;
  } else if (actualBalance < 0) {
    msg += `🟢 رصيد دائن: *${fmt(Math.abs(actualBalance))} جنيه*\n`;
    msg += `\nلديك رصيد متبقي`;
  } else {
    msg += `✅ الحساب مسدد بالكامل\n`;
    msg += `\nلا يوجد رصيد مستحق`;
  }

  return { text: msg };
}

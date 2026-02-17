/**
 * WhatsApp Bot Service - بوت الواتساب للرد التلقائي
 * 
 * يستقبل رسائل من العملاء/المشرفين/المندوبين ويرد عليها تلقائياً
 * 
 * الأوامر المدعومة:
 * - فاتورة رقم XXXX → يرسل تفاصيل الفاتورة
 * - اخر فاتورة / آخر فاتورة → آخر فاتورة للمرسل (بناءً على رقم الموبايل)
 * - اخر فاتورة للعميل XXXX → آخر فاتورة لعميل معين
 * - المدفوعات / مدفوعات → كشف المدفوعات
 * - كشف حساب → كشف حساب كامل
 * - المديونية / الرصيد → الرصيد الحالي
 * - مساعدة / help → قائمة الأوامر
 */

import { db, Customer, Invoice, Payment } from "@/shared/lib/indexedDB";
import { generateAccountStatement, AccountStatementData } from "@/lib/accountStatementExport";
import { calculateSingleCustomerBalance } from "@/hooks/useCustomerBalances";

// ===== Bot Reply Type =====
export interface BotReply {
    text: string;
    media?: {
        base64: string;     // base64 data URL
        filename: string;
        caption?: string;
    };
}

// ===== Bot Settings =====
const BOT_SETTINGS_KEY = "whatsapp-bot-settings";

export interface BotSettings {
    enabled: boolean;
    allowedSenders: "all" | "customers" | "supervisors" | "salesreps";
    welcomeMessage: string;
    unknownCommandMessage: string;
}

const DEFAULT_SETTINGS: BotSettings = {
    enabled: true,
    allowedSenders: "all",
    welcomeMessage: "مرحباً بك في نظام لونج تايم 👋\nاكتب *مساعدة* لمعرفة الأوامر المتاحة",
    unknownCommandMessage: "❌ أمر غير معروف\nاكتب *مساعدة* لمعرفة الأوامر المتاحة",
};

export function getBotSettings(): BotSettings {
    try {
        const saved = localStorage.getItem(BOT_SETTINGS_KEY);
        if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
}

export function saveBotSettings(settings: BotSettings): void {
    localStorage.setItem(BOT_SETTINGS_KEY, JSON.stringify(settings));
}

// ===== Helpers =====

/**
 * تنسيق رقم بفواصل
 */
function formatNum(num: number | string | undefined | null): string {
    if (num === undefined || num === null || num === "") return "0";
    const n = Number(num);
    if (isNaN(n)) return "0";
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * تنظيف رقم الهاتف للمقارنة
 */
function normalizePhone(phone: string): string {
    if (!phone) return "";
    let clean = phone.replace(/\D/g, "");
    // إزالة كود مصر
    if (clean.startsWith("20") && clean.length > 10) clean = clean.slice(2);
    // إزالة الصفر الأول
    if (clean.startsWith("0")) clean = clean.slice(1);
    return clean;
}

/**
 * البحث عن عميل بناءً على رقم الهاتف
 */
async function findCustomerByPhone(senderPhone: string): Promise<Customer | null> {
    const allCustomers = await db.getAll<Customer>("customers");
    const senderNorm = normalizePhone(senderPhone);
    
    if (!senderNorm) return null;
    
    return allCustomers.find(c => {
        const custNorm = normalizePhone(c.phone);
        return custNorm === senderNorm || 
               custNorm.endsWith(senderNorm) || 
               senderNorm.endsWith(custNorm);
    }) || null;
}

/**
 * البحث عن عميل بالاسم (بحث جزئي)
 */
async function findCustomerByName(name: string): Promise<Customer | null> {
    const allCustomers = await db.getAll<Customer>("customers");
    const searchName = name.trim().toLowerCase();
    
    // بحث دقيق أولاً
    const exact = allCustomers.find(c => c.name.toLowerCase() === searchName);
    if (exact) return exact;
    
    // بحث جزئي
    const partial = allCustomers.find(c => c.name.toLowerCase().includes(searchName));
    if (partial) return partial;
    
    return null;
}

// ===== Command Parsers =====

interface ParsedCommand {
    type: "invoice_by_number" | "last_invoice" | "last_invoice_for_customer" | 
          "payments" | "statement" | "debt" | "help" | "unknown";
    params?: any;
}

/**
 * تحليل الرسالة وتحديد الأمر المطلوب
 */
function parseCommand(message: string): ParsedCommand {
    const msg = message.trim();
    
    // === مساعدة ===
    if (/^(مساعدة|مساعده|help|أوامر|الأوامر|اوامر)$/i.test(msg)) {
        return { type: "help" };
    }
    
    // === فاتورة رقم XXXX ===
    const invoiceNumMatch = msg.match(/فاتور[ةه]\s*(رقم\s*)?(\d+)/i);
    if (invoiceNumMatch) {
        return { type: "invoice_by_number", params: { invoiceNumber: invoiceNumMatch[2] } };
    }
    
    // === رقم فاتورة ===
    const invoiceNumMatch2 = msg.match(/رقم\s*فاتور[ةه]\s*(\d+)/i);
    if (invoiceNumMatch2) {
        return { type: "invoice_by_number", params: { invoiceNumber: invoiceNumMatch2[1] } };
    }
    
    // === آخر فاتورة للعميل XXXX ===
    const lastInvoiceCustomerMatch = msg.match(/[اآ]خر\s*فاتور[ةه]\s*(لل?عميل\s*|لـ?\s*|ل\s*)(.+)/i);
    if (lastInvoiceCustomerMatch) {
        return { type: "last_invoice_for_customer", params: { customerName: lastInvoiceCustomerMatch[2].trim() } };
    }
    
    // === آخر فاتورة (للمرسل نفسه) ===
    if (/^[اآ]خر\s*فاتور[ةه]$/i.test(msg)) {
        return { type: "last_invoice" };
    }
    
    // === المدفوعات ===
    if (/^(المدفوعات|مدفوعات|الدفعات|دفعات)$/i.test(msg)) {
        return { type: "payments" };
    }
    
    // === كشف حساب ===
    if (/^(كشف\s*حساب|كشف\s*الحساب|statement)$/i.test(msg)) {
        return { type: "statement" };
    }
    
    // === المديونية / الرصيد ===
    if (/^(المديونية|مديونية|الرصيد|رصيد|رصيدي|المديون[يى][ةه])$/i.test(msg)) {
        return { type: "debt" };
    }
    
    // أمر مش معروف
    return { type: "unknown" };
}

// ===== Command Handlers =====

/**
 * الحصول على قائمة الأوامر المتاحة
 */
function handleHelp(): string {
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

/**
 * البحث عن فاتورة برقمها - مع PDF
 */
async function handleInvoiceByNumber(invoiceNumber: string): Promise<BotReply> {
    const allInvoices = await db.getAll<Invoice>("invoices");
    
    const invoice = allInvoices.find(inv => 
        String(inv.invoiceNumber) === invoiceNumber || 
        String(inv.id) === invoiceNumber
    );
    
    if (!invoice) {
        return { text: `❌ لم يتم العثور على فاتورة رقم ${invoiceNumber}` };
    }
    
    const text = formatInvoiceMessage(invoice);
    const media = await generateInvoicePDFForBot(invoice);
    return { text, media };
}

/**
 * آخر فاتورة للمرسل (بناءً على رقم الموبايل)
 */
async function handleLastInvoice(senderPhone: string): Promise<BotReply> {
    const customer = await findCustomerByPhone(senderPhone);
    
    if (!customer) {
        return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}\nجرب: *آخر فاتورة للعميل [اسم العميل]*` };
    }
    
    return await getLastInvoiceForCustomer(customer);
}

/**
 * آخر فاتورة لعميل باسمه
 */
async function handleLastInvoiceForCustomer(customerName: string): Promise<BotReply> {
    const customer = await findCustomerByName(customerName);
    
    if (!customer) {
        return { text: `❌ لم يتم العثور على عميل باسم "${customerName}"` };
    }
    
    return await getLastInvoiceForCustomer(customer);
}

/**
 * جلب آخر فاتورة لعميل معين - مع PDF
 */
async function getLastInvoiceForCustomer(customer: Customer): Promise<BotReply> {
    const allInvoices = await db.getAll<Invoice>("invoices");
    const customerInvoices = allInvoices
        .filter(inv => String(inv.customerId) === String(customer.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    if (customerInvoices.length === 0) {
        return { text: `📄 لا توجد فواتير للعميل *${customer.name}*` };
    }
    
    const invoice = customerInvoices[0];
    const text = formatInvoiceMessage(invoice, customer.name);
    const media = await generateInvoicePDFForBot(invoice);
    return { text, media };
}

/**
 * تنسيق رسالة الفاتورة
 */
function formatInvoiceMessage(invoice: Invoice, customerName?: string): string {
    const name = customerName || invoice.customerName || "عميل";
    const date = new Date(invoice.createdAt).toLocaleDateString("ar-EG", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
    
    let msg = `📄 *فاتورة رقم ${invoice.invoiceNumber || invoice.id}*\n`;
    msg += `👤 العميل: *${name}*\n`;
    msg += `📅 التاريخ: ${date}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    // الأصناف
    if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item, i) => {
            const itemName = item.productName || "صنف";
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const total = Number(item.total) || (qty * price);
            msg += `${i + 1}. ${itemName}\n`;
            msg += `   ${qty} × ${formatNum(price)} = *${formatNum(total)}*\n`;
        });
    }
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    // الإجمالي
    const subtotal = Number(invoice.subtotal) || Number(invoice.total) || 0;
    const discount = Number(invoice.discount) || 0;
    const total = Number(invoice.total) || 0;
    
    if (discount > 0) {
        msg += `💰 الإجمالي: ${formatNum(subtotal)}\n`;
        msg += `🏷️ الخصم: ${formatNum(discount)}\n`;
        msg += `💵 الإجمالي بعد الخصم: *${formatNum(total)}*\n`;
    } else {
        msg += `💵 الإجمالي: *${formatNum(total)}*\n`;
    }
    
    // المدفوع والمتبقي
    const paid = Number(invoice.paidAmount) || 0;
    const remaining = Number(invoice.remainingAmount) || Math.max(0, total - paid);
    
    msg += `✅ المدفوع: ${formatNum(paid)}\n`;
    if (remaining > 0) {
        msg += `⏳ المتبقي: *${formatNum(remaining)}*\n`;
    }
    
    // حالة الدفع
    const statusMap: Record<string, string> = {
        paid: "✅ مدفوعة بالكامل",
        partial: "⚠️ مدفوعة جزئياً",
        unpaid: "🔴 غير مدفوعة"
    };
    msg += `\n${statusMap[invoice.paymentStatus] || ""}`;
    
    return msg;
}

/**
 * المدفوعات الأخيرة للعميل
 */
async function handlePayments(senderPhone: string): Promise<BotReply> {
    const customer = await findCustomerByPhone(senderPhone);
    
    if (!customer) {
        return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
    }
    
    const allPayments = await db.getAll<Payment>("payments");
    const customerPayments = allPayments
        .filter((pay: any) => String(pay.customerId) === String(customer.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10); // آخر 10 دفعات
    
    if (customerPayments.length === 0) {
        return { text: `💰 لا توجد مدفوعات مسجلة للعميل *${customer.name}*` };
    }
    
    let msg = `💰 *آخر المدفوعات - ${customer.name}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    let totalPaid = 0;
    customerPayments.forEach((pay: any, i) => {
        const date = new Date(pay.createdAt).toLocaleDateString("ar-EG", {
            month: "short", day: "numeric"
        });
        const amount = Number(pay.amount) || 0;
        totalPaid += amount;
        msg += `${i + 1}. ${date} — *${formatNum(amount)}* جنيه\n`;
    });
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 إجمالي المعروض: *${formatNum(totalPaid)}* جنيه`;
    
    return { text: msg };
}

/**
 * كشف حساب مختصر
 */
async function handleStatement(senderPhone: string): Promise<BotReply> {
    const customer = await findCustomerByPhone(senderPhone);
    
    if (!customer) {
        return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
    }
    
    // كشف حساب آخر 30 يوم
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);
    
    const statement = await generateAccountStatement(customer.id, dateFrom, dateTo);
    
    if (!statement || statement.rows.length === 0) {
        return { text: `📊 لا توجد حركات في آخر 30 يوم للعميل *${customer.name}*` };
    }
    
    let msg = `📊 *كشف حساب - ${customer.name}*\n`;
    msg += `📅 آخر 30 يوم\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    // عرض آخر 15 حركة كحد أقصى
    const recentRows = statement.rows.slice(-15);
    recentRows.forEach((row) => {
        let icon = "";
        if (row.movement === "بيع") icon = "🧾";
        else if (row.movement === "قبض") icon = "💵";
        else if (row.movement === "مرتجع بيع") icon = "↩️";
        else if (row.movement === "بونص") icon = "🎁";
        
        const debitStr = row.debit > 0 ? `+${formatNum(row.debit)}` : "";
        const creditStr = row.credit > 0 ? `-${formatNum(row.credit)}` : "";
        
        msg += `${icon} ${row.date} | ${row.movement} | ${debitStr}${creditStr} | الرصيد: ${formatNum(row.balance)}\n`;
    });
    
    if (statement.rows.length > 15) {
        msg += `\n... و ${statement.rows.length - 15} حركة أخرى\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📈 إجمالي المبيعات: ${formatNum(statement.summary.totalSales)}\n`;
    msg += `💵 إجمالي المدفوع: ${formatNum(statement.summary.totalPayments)}\n`;
    if (statement.summary.totalReturns > 0) {
        msg += `↩️ إجمالي المرتجعات: ${formatNum(statement.summary.totalReturns)}\n`;
    }
    msg += `\n💳 *الرصيد الحالي: ${formatNum(statement.closingBalance)} جنيه*`;
    
    return { text: msg };
}

/**
 * المديونية / الرصيد الحالي
 */
async function handleDebt(senderPhone: string): Promise<BotReply> {
    const customer = await findCustomerByPhone(senderPhone);
    
    if (!customer) {
        return { text: `❌ لم يتم العثور على عميل مرتبط برقم ${senderPhone}` };
    }
    
    // حساب الرصيد الفعلي من الحركات
    const actualBalance = await calculateSingleCustomerBalance(customer.id);
    
    let msg = `💳 *رصيد العميل - ${customer.name}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (actualBalance > 0) {
        msg += `🔴 المديونية: *${formatNum(actualBalance)} جنيه*\n`;
        msg += `\nيوجد رصيد مستحق عليك`;
    } else if (actualBalance < 0) {
        msg += `🟢 رصيد دائن: *${formatNum(Math.abs(actualBalance))} جنيه*\n`;
        msg += `\nلديك رصيد متبقي`;
    } else {
        msg += `✅ الحساب مسدد بالكامل\n`;
        msg += `\nلا يوجد رصيد مستحق`;
    }
    
    return { text: msg };
}

// ===== PDF Generation for Bot =====

/**
 * توليد PDF للفاتورة لإرسالها عبر البوت
 */
async function generateInvoicePDFForBot(invoice: Invoice): Promise<BotReply["media"] | undefined> {
    try {
        const { generateInvoicePDF, convertToPDFData } = await import("@/services/invoicePdfService");
        const allCustomers = await db.getAll<Customer>("customers");
        const customer = allCustomers.find(c => String(c.id) === String(invoice.customerId));
        
        const allProducts = await db.getAll<any>("products");
        const allReps = await db.getAll<any>("salesReps");
        const rep = customer?.salesRepId ? allReps.find((r: any) => r.id === customer.salesRepId) : null;
        
        const items = (invoice.items || []).map((item: any) => {
            const product = allProducts.find((p: any) => p.id === item.productId || p.name === item.productName);
            return {
                ...item,
                unitsPerCarton: (product as any)?.unitsPerCarton || (product as any)?.cartonCount,
                productCode: item.productCode || (product as any)?.code || (product as any)?.sku || "-"
            };
        });

        const pdfData = await convertToPDFData(invoice, customer || { name: invoice.customerName } as any, items, rep || undefined);
        const pdfBlob = await generateInvoicePDF(pdfData);
        
        // Convert blob to base64
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
        });

        return {
            base64,
            filename: `فاتورة-${invoice.invoiceNumber || invoice.id}.pdf`,
            caption: `📄 فاتورة رقم ${invoice.invoiceNumber || invoice.id}`,
        };
    } catch (error) {
        console.error("[WhatsApp Bot] Failed to generate invoice PDF:", error);
        return undefined;
    }
}

// ===== Main Bot Handler =====

/**
 * معالجة رسالة واردة من الواتساب
 * @param senderPhone رقم المرسل (بدون @s.whatsapp.net)
 * @param messageText نص الرسالة
 * @returns الرد المطلوب إرساله
 */
export async function handleBotMessage(senderPhone: string, messageText: string): Promise<BotReply | null> {
    const settings = getBotSettings();
    
    if (!settings.enabled) return null;
    
    const message = messageText.trim();
    if (!message) return null;
    
    // تجاهل الرسائل الطويلة جداً (مش أوامر)
    if (message.length > 200) return null;
    
    const command = parseCommand(message);
    
    try {
        switch (command.type) {
            case "help":
                return { text: handleHelp() };
                
            case "invoice_by_number":
                return await handleInvoiceByNumber(command.params.invoiceNumber);
                
            case "last_invoice":
                return await handleLastInvoice(senderPhone);
                
            case "last_invoice_for_customer":
                return await handleLastInvoiceForCustomer(command.params.customerName);
                
            case "payments":
                return await handlePayments(senderPhone);
                
            case "statement":
                return await handleStatement(senderPhone);
                
            case "debt":
                return await handleDebt(senderPhone);
                
            case "unknown":
                return { text: settings.unknownCommandMessage };
                
            default:
                return null;
        }
    } catch (error) {
        console.error("[WhatsApp Bot] Error handling command:", error);
        return { text: "⚠️ حصل خطأ أثناء معالجة طلبك. جرب مرة تانية." };
    }
}

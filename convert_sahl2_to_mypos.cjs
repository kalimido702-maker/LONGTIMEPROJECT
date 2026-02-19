/**
 * تحويل بيانات قاعدة بيانات sahl2 (LONG TIME) إلى صيغة MYPOS للاستيراد
 * النسخة الكاملة - تشمل كل البيانات
 * 
 * الجداول المحولة:
 * - accounts → customers, suppliers, salesReps
 * - items + items_units + stores_items → products + productCategories + units
 * - invoices + invoices_items (SALE) → invoices
 * - invoices + invoices_items (RETURNSALE) → salesReturns
 * - invoices + invoices_items (PURCHASE) → purchases
 * - invoices + invoices_items (RETURNPUR) → purchaseReturns
 * - money (RECEIPT) → deposits
 * - money (PAYMENT) → expenses
 * - money_invoices → ربط المدفوعات بالفواتير
 * - stores → warehouses
 * - banks → paymentMethods
 * - options → settings
 * - users → users
 * 
 * الاستخدام: node convert_sahl2_to_mypos.cjs
 */

const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'sahl2.sql');
const OUTPUT_FILE = path.join(__dirname, 'sahl2_import_for_mypos.json');

// ========================================
// SQL Parsing
// ========================================

function extractInsertData(sql, tableName) {
  const rows = [];
  const insertRegex = new RegExp(
    `INSERT INTO \`${tableName}\`\\s*\\(([^)]+)\\)\\s*VALUES\\s*`,
    'gi'
  );

  let match;
  const allMatches = [];
  while ((match = insertRegex.exec(sql)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
    allMatches.push({ columns, startIndex: match.index + match[0].length });
  }

  for (const { columns, startIndex } of allMatches) {
    let i = startIndex;
    while (i < sql.length) {
      while (i < sql.length && /\s/.test(sql[i])) i++;
      if (sql[i] === '(') {
        const row = parseRow(sql, i);
        if (row) {
          const obj = {};
          for (let c = 0; c < columns.length && c < row.values.length; c++) {
            obj[columns[c]] = row.values[c];
          }
          rows.push(obj);
          i = row.endIndex;
          while (i < sql.length && /\s/.test(sql[i])) i++;
          if (sql[i] === ',') { i++; }
          else if (sql[i] === ';') { i++; break; }
          else { break; }
        } else { break; }
      } else { break; }
    }
  }

  return rows;
}

function parseRow(sql, startIndex) {
  let i = startIndex;
  if (sql[i] !== '(') return null;
  i++;

  const values = [];
  while (i < sql.length && sql[i] !== ')') {
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ')') break;

    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      i++;
      let str = '';
      while (i < sql.length) {
        if (sql[i] === '\\') {
          i++;
          if (sql[i] === "'") str += "'";
          else if (sql[i] === '"') str += '"';
          else if (sql[i] === 'n') str += '\n';
          else if (sql[i] === 'r') str += '\r';
          else if (sql[i] === 't') str += '\t';
          else if (sql[i] === '\\') str += '\\';
          else str += sql[i];
          i++;
        } else if (sql[i] === quote) {
          if (i + 1 < sql.length && sql[i + 1] === quote) {
            str += quote;
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          str += sql[i];
          i++;
        }
      }
      values.push(str);
    } else if (sql.substring(i, i + 4).toUpperCase() === 'NULL') {
      values.push(null);
      i += 4;
    } else {
      let num = '';
      while (i < sql.length && sql[i] !== ',' && sql[i] !== ')' && !/\s/.test(sql[i])) {
        num += sql[i];
        i++;
      }
      const parsed = parseFloat(num);
      values.push(isNaN(parsed) ? num : parsed);
    }

    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ',') { i++; }
  }

  if (sql[i] === ')') { i++; }
  return { values, endIndex: i };
}

// ========================================
// Helpers
// ========================================

function gId(prefix, id) { return `${prefix}_${id}`; }
function toNum(val) { const n = parseFloat(val); return isNaN(n) ? 0 : n; }
function toStr(val) { return (val || '').toString().trim(); }

function makeDate(date1, time1) {
  if (!date1) return new Date().toISOString();
  const d = toStr(date1);
  const t = toStr(time1) || '00:00:00';
  try { return new Date(`${d}T${t}`).toISOString(); }
  catch { return new Date().toISOString(); }
}

// ========================================
// Main Execution
// ========================================

console.log('📖 جاري قراءة ملف SQL...');
const sql = fs.readFileSync(SQL_FILE, 'utf8');
console.log(`✅ تم قراءة الملف (${(sql.length / 1024 / 1024).toFixed(1)} MB)\n`);

// ---- Extract all tables ----
console.log('🔍 جاري استخراج البيانات من كل الجداول...');

const accounts = extractInsertData(sql, 'accounts');
console.log(`  ✅ accounts: ${accounts.length}`);

const items = extractInsertData(sql, 'items');
console.log(`  ✅ items: ${items.length}`);

const itemsUnits = extractInsertData(sql, 'items_units');
console.log(`  ✅ items_units: ${itemsUnits.length}`);

const stores = extractInsertData(sql, 'stores');
console.log(`  ✅ stores: ${stores.length}`);

const storesItems = extractInsertData(sql, 'stores_items');
console.log(`  ✅ stores_items: ${storesItems.length}`);

const banks = extractInsertData(sql, 'banks');
console.log(`  ✅ banks: ${banks.length}`);

const rawInvoices = extractInsertData(sql, 'invoices');
console.log(`  ✅ invoices: ${rawInvoices.length}`);

const invoicesItems = extractInsertData(sql, 'invoices_items');
console.log(`  ✅ invoices_items: ${invoicesItems.length}`);

const moneyRaw = extractInsertData(sql, 'money');
console.log(`  ✅ money: ${moneyRaw.length}`);

const moneyInvoices = extractInsertData(sql, 'money_invoices');
console.log(`  ✅ money_invoices: ${moneyInvoices.length}`);

const dbUsers = extractInsertData(sql, 'users');
console.log(`  ✅ users: ${dbUsers.length}`);

const options = extractInsertData(sql, 'options');
console.log(`  ✅ options: ${options.length}`);

// ---- Build lookup maps ----
console.log('\n🔄 جاري بناء الخرائط المرجعية...');

const itemsMap = new Map();
items.forEach(item => itemsMap.set(item.id, item));

const accountsMap = new Map();
accounts.forEach(acc => accountsMap.set(acc.id, acc));

// Invoice items grouped by (kind, id)
const invoiceItemsMap = new Map();
invoicesItems.forEach(ii => {
  const key = `${ii.kind}_${ii.id}`;
  if (!invoiceItemsMap.has(key)) invoiceItemsMap.set(key, []);
  invoiceItemsMap.get(key).push(ii);
});

// Money-to-invoice links grouped by m_id
const moneyToInvoiceMap = new Map();
moneyInvoices.forEach(mi => {
  const key = mi.m_id;
  if (!moneyToInvoiceMap.has(key)) moneyToInvoiceMap.set(key, []);
  moneyToInvoiceMap.get(key).push(mi);
});

// Stock per item
const stockMap = new Map();
storesItems.forEach(si => {
  const itemId = si.item_id;
  stockMap.set(itemId, (stockMap.get(itemId) || 0) + toNum(si.qty));
});

// Items_units grouped by item_id
const itemUnitsMap = new Map();
itemsUnits.forEach(iu => {
  if (!itemUnitsMap.has(iu.item_id)) itemUnitsMap.set(iu.item_id, []);
  itemUnitsMap.get(iu.item_id).push(iu);
});

console.log('  ✅ تم بناء الخرائط');

// ========================================
// Convert Categories
// ========================================
console.log('\n🔄 جاري تحويل البيانات...');

const categorySet = new Map();
let catOrder = 1;
items.forEach(item => {
  if (item.service === 1) return;
  const cat = toStr(item.category1);
  if (cat && !categorySet.has(cat)) {
    categorySet.set(cat, {
      id: `cat_${catOrder}`,
      name: cat,
      nameAr: cat,
      active: true,
      displayOrder: catOrder,
      createdAt: new Date().toISOString(),
    });
    catOrder++;
  }
});
if (!categorySet.has('عام')) {
  categorySet.set('عام', {
    id: 'cat_default', name: 'عام', nameAr: 'عام',
    active: true, displayOrder: catOrder, createdAt: new Date().toISOString(),
  });
}
const productCategories = Array.from(categorySet.values());
const categoryIdMap = new Map();
productCategories.forEach(c => categoryIdMap.set(c.nameAr, c.id));
console.log(`  ✅ تصنيفات: ${productCategories.length}`);

// ========================================
// Convert Units
// ========================================
const unitSet = new Map();
unitSet.set('قطعة', { id: 'unit_piece', name: 'قطعة', shortName: 'قطعة', isDefault: true, createdAt: new Date().toISOString() });

items.forEach(item => {
  const u = toStr(item.unit);
  if (u && !unitSet.has(u)) {
    unitSet.set(u, { id: `unit_${unitSet.size + 1}`, name: u, shortName: u, isDefault: false, createdAt: new Date().toISOString() });
  }
});
itemsUnits.forEach(iu => {
  const u = toStr(iu.unit);
  if (u && !unitSet.has(u)) {
    unitSet.set(u, { id: `unit_${unitSet.size + 1}`, name: u, shortName: u, isDefault: false, createdAt: new Date().toISOString() });
  }
});
const units = Array.from(unitSet.values());
const unitIdMap = new Map();
units.forEach(u => unitIdMap.set(u.name, u.id));
console.log(`  ✅ وحدات: ${units.length}`);

// ========================================
// Price Types (from options: price2=مايو, price3=اللستة)
// ========================================
const priceTypes = [
  { id: 'price_1', name: 'سعر 1', displayOrder: 1, isDefault: false, createdAt: new Date().toISOString() },
  { id: 'price_mayo', name: 'مايو', displayOrder: 2, isDefault: true, createdAt: new Date().toISOString() },
  { id: 'price_lista', name: 'اللستة', displayOrder: 3, isDefault: false, createdAt: new Date().toISOString() },
  { id: 'price_4', name: 'سعر 4', displayOrder: 4, isDefault: false, createdAt: new Date().toISOString() },
];

// ========================================
// Payment Methods (from banks + credit)
// ========================================
const paymentMethods = banks.map(b => ({
  id: gId('pm', b.id),
  name: toStr(b.cashbox_title),
  type: b.id === 1 ? 'cash' :
    (toStr(b.cashbox_title).includes('بنك') || toStr(b.cashbox_title).includes('الاهلي') ? 'bank_transfer' :
      (toStr(b.cashbox_title).includes('فودافون') ? 'wallet' : 'other')),
  isActive: b.active === 1,
  createdAt: new Date().toISOString(),
}));
paymentMethods.push({
  id: 'pm_credit', name: 'آجل', type: 'credit', isActive: true, createdAt: new Date().toISOString(),
});
console.log(`  ✅ طرق الدفع: ${paymentMethods.length}`);

// ========================================
// Warehouses
// ========================================
const warehouses = stores.map(s => ({
  id: gId('wh', s.id),
  name: toStr(s.title),
  nameAr: toStr(s.title),
  location: '',
  isDefault: s.id === 1,
  isActive: s.active === 1,
  createdAt: new Date().toISOString(),
}));
console.log(`  ✅ مخازن: ${warehouses.length}`);

// ========================================
// Users
// ========================================
const users = dbUsers.map(u => ({
  id: gId('user', u.id),
  name: toStr(u.title),
  username: toStr(u.title),
  role: u.sn === 1 ? 'admin' : 'cashier',
  pin: toStr(u.pass) || '0000',
  isActive: u.active === 1,
  createdAt: new Date().toISOString(),
}));
console.log(`  ✅ مستخدمين: ${users.length}`);

// ========================================
// Customers
// ========================================
const customers = accounts
  .filter(a => a.kind === 'customer')
  .map(a => {
    const isActive = a.dead !== 1;
    const notes = [
      !isActive ? '⚠️ عميل متوقف (من النظام القديم)' : '',
      toStr(a.acc_custom1) ? `تصنيف: ${a.acc_custom1}` : '',
      toStr(a.more) ? `ملاحظات: ${a.more}` : '',
      toStr(a.email) ? `إيميل: ${a.email}` : '',
      toStr(a.code) ? `كود قديم: ${a.code}` : '',
      a.sales_price_list && toNum(a.sales_price_list) > 0 ? `قائمة أسعار: ${a.sales_price_list}` : '',
      toNum(a.sales_discount_per) > 0 ? `خصم: ${a.sales_discount_per}%` : '',
      a.last_sale_date ? `آخر بيع: ${a.last_sale_date} (${toNum(a.last_sale_total).toLocaleString()})` : '',
      a.last_receipt_date ? `آخر تحصيل: ${a.last_receipt_date} (${toNum(a.last_receipt_amount).toLocaleString()})` : '',
    ].filter(Boolean).join(' | ') || undefined;

    return {
      id: gId('cust', a.id),
      name: toStr(a.title),
      phone: toStr(a.phone),
      address: [toStr(a.address), toStr(a.address2)].filter(Boolean).join(' - '),
      nationalId: toStr(a.tax_id) || undefined,
      creditLimit: toNum(a.max_balance_out),
      currentBalance: toNum(a.balance_out),
      bonusBalance: 0,
      previousStatement: toNum(a.balance_out),
      salesRepId: undefined,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
      notes,
    };
  });
console.log(`  ✅ عملاء: ${customers.length} (${customers.filter(c => !c.notes || !c.notes.includes('متوقف')).length} نشط / ${customers.filter(c => c.notes && c.notes.includes('متوقف')).length} متوقف)`);

// ========================================
// Suppliers — لا يوجد موردين في النظام القديم
// ========================================
const suppliers = [];
console.log(`  ⏭️ موردين: تم التجاهل (غير موجودين في النظام القديم)`);

// ========================================
// Sales Reps — لا يوجد مناديب حقيقيين في النظام القديم
// ========================================
const salesReps = [];
console.log(`  ⏭️ مناديب: تم التجاهل (غير موجودين في النظام القديم)`);

// ========================================
// Products (include dead items too, marked as inactive)
// ========================================
const products = items
  .filter(item => {
    if (item.service === 1) return false;
    const hasPrice = toNum(item.price1) > 0 || toNum(item.price2) > 0 || toNum(item.price3) > 0;
    if (!hasPrice && toNum(item.avg_cost) === 0) return false;
    return true;
  })
  .map(item => {
    const itemId = typeof item.id === 'number' ? item.id : parseInt(item.id);
    const cat = toStr(item.category1);
    const categoryId = categoryIdMap.get(cat) || categoryIdMap.get('عام') || 'cat_default';
    const unitName = toStr(item.unit) || 'قطعة';
    const unitId = unitIdMap.get(unitName) || 'unit_piece';

    const p1 = toNum(item.price1);
    const p2 = toNum(item.price2); // مايو
    const p3 = toNum(item.price3); // اللستة
    const p4 = toNum(item.price4);
    const mainPrice = p2 > 0 ? p2 : (p3 > 0 ? p3 : p1);
    const costPrice = toNum(item.avg_cost) || toNum(item.last_cost) || 0;

    const prices = {};
    if (p1 > 0) prices['price_1'] = p1;
    if (p2 > 0) prices['price_mayo'] = p2;
    if (p3 > 0) prices['price_lista'] = p3;
    if (p4 > 0) prices['price_4'] = p4;

    const stock = stockMap.get(itemId) || 0;
    const isDead = item.dead === 1;

    const product = {
      id: gId('prod', itemId),
      name: toStr(item.title),
      nameAr: toStr(item.title),
      price: mainPrice,
      prices: Object.keys(prices).length > 0 ? prices : { price_mayo: mainPrice },
      costPrice,
      unitId,
      category: cat || 'عام',
      categoryId,
      stock: Math.max(0, stock),
      barcode: toStr(item.barcode) || undefined,
      sku: toStr(item.code1) || undefined,
      minStock: toNum(item.reorder_qty),
      isActive: !isDead,
      trackStock: true,
      taxRate: toNum(item.itax1_per),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cat2Num = parseInt(item.category2);
    if (!isNaN(cat2Num) && cat2Num > 0) {
      product.unitsPerCarton = cat2Num;
    }

    if (isDead) {
      product.notes = '⚠️ منتج متوقف (من النظام القديم)';
    }

    return product;
  });
console.log(`  ✅ منتجات: ${products.length} (${products.filter(p => p.isActive).length} نشط / ${products.filter(p => !p.isActive).length} متوقف)`);

// ========================================
// Helper: Convert invoice items to MYPOS format
// ========================================
function getInvoiceItemsForSale(kind, id) {
  const key = `${kind}_${id}`;
  const rawItems = invoiceItemsMap.get(key) || [];

  return rawItems.map(ii => {
    const itemRef = itemsMap.get(ii.item_id);
    const productName = itemRef ? toStr(itemRef.title) : `صنف #${ii.item_id}`;
    const unitName = toStr(ii.unit) || (itemRef ? toStr(itemRef.unit) : 'قطعة') || 'قطعة';
    const unitId = unitIdMap.get(unitName) || 'unit_piece';
    const price = Math.abs(toNum(ii.amount));
    const total = Math.abs(toNum(ii.grand_total) || toNum(ii.total));
    const uqty1 = toNum(ii.uqty1) || 1;
    const uqty2 = toNum(ii.uqty2) || 1;

    return {
      productId: gId('prod', ii.item_id),
      productName,
      quantity: Math.abs(toNum(ii.qty)),
      price,
      total,
      unitId,
      unitName,
      conversionFactor: uqty1 / uqty2,
      priceTypeId: 'price_mayo',
      priceTypeName: 'مايو',
      warehouseId: ii.store_id ? gId('wh', ii.store_id) : undefined,
    };
  });
}

function getInvoiceItemsForPurchase(kind, id) {
  const key = `${kind}_${id}`;
  const rawItems = invoiceItemsMap.get(key) || [];

  return rawItems.map(ii => {
    const itemRef = itemsMap.get(ii.item_id);
    const productName = itemRef ? toStr(itemRef.title) : `صنف #${ii.item_id}`;
    const unitName = toStr(ii.unit) || (itemRef ? toStr(itemRef.unit) : 'قطعة') || 'قطعة';
    const unitId = unitIdMap.get(unitName) || 'unit_piece';
    const costPrice = Math.abs(toNum(ii.unit_cost) || toNum(ii.amount));
    const total = Math.abs(toNum(ii.grand_total) || toNum(ii.total));

    return {
      productId: gId('prod', ii.item_id),
      productName,
      quantity: Math.abs(toNum(ii.qty)),
      costPrice,
      total,
      unitId,
      unitName,
    };
  });
}

// ========================================
// SALE Invoices → invoices
// ========================================
console.log('\n📄 جاري تحويل الفواتير...');

const saleInvoices = rawInvoices
  .filter(inv => inv.kind === 'SALE')
  .map(inv => {
    const invItems = getInvoiceItemsForSale('SALE', inv.id);
    const acc = accountsMap.get(inv.account_id);
    const customerName = acc ? toStr(acc.title) : (inv.account_id ? `عميل #${inv.account_id}` : 'عميل نقدي');

    const grandTotal = Math.abs(toNum(inv.grand_total));
    const discount = toNum(inv.discount1) + toNum(inv.discount2);
    const tax = toNum(inv.tax1) + toNum(inv.tax2);

    let paymentType = 'cash';
    let paymentStatus = 'paid';
    const paymentMethodIds = [];
    const paymentMethodAmounts = {};

    if (toStr(inv.payment_type) === 'CREDIT') {
      paymentType = 'credit';
      const status = toStr(inv.payment_status);
      if (status === 'PAID' || status === 'CLOSED') paymentStatus = 'paid';
      else if (status === 'PARTIAL') paymentStatus = 'partial';
      else paymentStatus = 'unpaid';

      paymentMethodIds.push('pm_credit');
      paymentMethodAmounts['pm_credit'] = grandTotal;
    } else {
      paymentStatus = 'paid';
      if (inv.cashbox1_id) {
        const pmId = gId('pm', inv.cashbox1_id);
        paymentMethodIds.push(pmId);
        paymentMethodAmounts[pmId] = grandTotal;
      } else {
        paymentMethodIds.push('pm_1');
        paymentMethodAmounts['pm_1'] = grandTotal;
      }
    }

    const creditPaid = toNum(inv.credit_paid);
    const creditDue = toNum(inv.credit_due);
    const paidAmount = paymentType === 'cash' ? grandTotal : creditPaid;
    const remainingAmount = paymentType === 'cash' ? 0 : Math.max(0, creditDue);

    const userId = inv.createdby_id ? gId('user', inv.createdby_id) : 'user_3';
    const userObj = dbUsers.find(u => u.id === inv.createdby_id);
    const userName = userObj ? toStr(userObj.title) : 'mostafa';

    return {
      id: gId('inv', inv.pk),
      invoiceNumber: toStr(inv.id),
      customerId: inv.account_id ? gId('cust', inv.account_id) : undefined,
      customerName,
      items: invItems,
      subtotal: toNum(inv.total),
      discount: discount > 0 ? discount : undefined,
      tax: tax > 0 ? tax : undefined,
      total: grandTotal,
      paymentType,
      paymentStatus,
      paidAmount,
      remainingAmount,
      paymentMethodIds,
      paymentMethodAmounts,
      userId,
      userName,
      createdAt: makeDate(inv.date1, inv.time1),
      dueDate: inv.due_date ? toStr(inv.due_date) : undefined,
      notes: toStr(inv.more) || undefined,
      warehouseId: inv.store_id ? gId('wh', inv.store_id) : undefined,
    };
  });
console.log(`  ✅ فواتير بيع: ${saleInvoices.length}`);

// ========================================
// RETURNSALE → salesReturns
// ========================================
const salesReturns = rawInvoices
  .filter(inv => inv.kind === 'RETURNSALE')
  .map(inv => {
    const invItems = getInvoiceItemsForSale('RETURNSALE', inv.id);
    const acc = accountsMap.get(inv.account_id);
    const customerName = acc ? toStr(acc.title) : `عميل #${inv.account_id}`;

    const total = Math.abs(toNum(inv.grand_total));
    const tax = Math.abs(toNum(inv.tax1)) + Math.abs(toNum(inv.tax2));

    const returnItems = invItems.map(ii => ({
      productId: ii.productId,
      productName: ii.productName,
      quantity: ii.quantity,
      price: ii.price,
      total: ii.total,
      reason: 'مرتجع من النظام القديم',
    }));

    const refundMethod = toStr(inv.payment_type) === 'CASH' ? 'cash' : 'credit';

    const userId = inv.createdby_id ? gId('user', inv.createdby_id) : 'user_3';
    const userObj = dbUsers.find(u => u.id === inv.createdby_id);
    const userName = userObj ? toStr(userObj.title) : 'mostafa';

    return {
      id: gId('ret', inv.pk),
      originalInvoiceId: inv.return_inv_id && inv.return_inv_id !== 0 ? gId('inv', inv.return_inv_id) : undefined,
      customerId: inv.account_id ? gId('cust', inv.account_id) : undefined,
      customerName,
      items: returnItems,
      subtotal: total,
      tax,
      total,
      reason: toStr(inv.more) || 'مرتجع مستورد من النظام القديم',
      userId,
      userName,
      createdAt: makeDate(inv.date1, inv.time1),
      refundMethod,
      refundStatus: 'completed',
    };
  });
console.log(`  ✅ مرتجعات بيع: ${salesReturns.length}`);

// ========================================
// PURCHASE → purchases
// ========================================
const purchasesList = rawInvoices
  .filter(inv => inv.kind === 'PURCHASE')
  .map(inv => {
    const invItems = getInvoiceItemsForPurchase('PURCHASE', inv.id);
    const acc = accountsMap.get(inv.account_id);
    const supplierName = acc ? toStr(acc.title) : (inv.account_id ? `مورد #${inv.account_id}` : 'مورد غير محدد');

    const grandTotal = Math.abs(toNum(inv.grand_total));
    const discount = Math.abs(toNum(inv.discount1)) + Math.abs(toNum(inv.discount2));
    const tax = Math.abs(toNum(inv.tax1)) + Math.abs(toNum(inv.tax2));

    let paymentType = toStr(inv.payment_type) === 'CASH' ? 'cash' : 'credit';
    const status = toStr(inv.payment_status);
    let paymentStatus = 'paid';
    if (status === 'NOT PAID') paymentStatus = 'unpaid';
    else if (status === 'PARTIAL') paymentStatus = 'partial';

    const paidAmount = paymentType === 'cash' ? grandTotal : Math.abs(toNum(inv.credit_paid));
    const remainingAmount = paymentType === 'cash' ? 0 : Math.abs(toNum(inv.credit_due));

    const userId = inv.createdby_id ? gId('user', inv.createdby_id) : 'user_3';
    const userObj = dbUsers.find(u => u.id === inv.createdby_id);
    const userName = userObj ? toStr(userObj.title) : 'mostafa';

    return {
      id: gId('pur', inv.pk),
      supplierId: inv.account_id ? gId('sup', inv.account_id) : 'sup_unknown',
      supplierName,
      items: invItems,
      subtotal: Math.abs(toNum(inv.total)),
      tax,
      discount,
      total: grandTotal,
      paymentType,
      paymentStatus,
      paidAmount,
      remainingAmount,
      userId,
      userName,
      createdAt: makeDate(inv.date1, inv.time1),
      dueDate: inv.due_date ? toStr(inv.due_date) : undefined,
      notes: toStr(inv.more) || undefined,
    };
  });
console.log(`  ✅ فواتير شراء: ${purchasesList.length}`);

// ========================================
// RETURNPUR → purchaseReturns
// ========================================
const purchaseReturns = rawInvoices
  .filter(inv => inv.kind === 'RETURNPUR')
  .map(inv => {
    const invItems = getInvoiceItemsForPurchase('RETURNPUR', inv.id);
    const acc = accountsMap.get(inv.account_id);
    const supplierName = acc ? toStr(acc.title) : `مورد #${inv.account_id}`;

    const total = Math.abs(toNum(inv.grand_total));
    const tax = Math.abs(toNum(inv.tax1)) + Math.abs(toNum(inv.tax2));

    const returnItems = invItems.map(ii => ({
      productId: ii.productId,
      productName: ii.productName,
      quantity: ii.quantity,
      price: ii.costPrice,
      total: ii.total,
      reason: 'مرتجع شراء من النظام القديم',
    }));

    const userId = inv.createdby_id ? gId('user', inv.createdby_id) : 'user_3';
    const userObj = dbUsers.find(u => u.id === inv.createdby_id);
    const userName = userObj ? toStr(userObj.title) : 'mostafa';

    return {
      id: gId('purret', inv.pk),
      originalPurchaseId: inv.return_inv_id && inv.return_inv_id !== 0 ? gId('pur', inv.return_inv_id) : '',
      supplierId: inv.account_id ? gId('sup', inv.account_id) : 'sup_unknown',
      supplierName,
      items: returnItems,
      subtotal: total,
      tax,
      total,
      reason: toStr(inv.more) || 'مرتجع شراء مستورد من النظام القديم',
      userId,
      userName,
      createdAt: makeDate(inv.date1, inv.time1),
      refundStatus: 'completed',
    };
  });
console.log(`  ✅ مرتجعات شراء: ${purchaseReturns.length}`);

// ========================================
// Money RECEIPT → deposits
// ========================================
const deposits = moneyRaw
  .filter(m => m.kind === 'RECEIPT')
  .map(m => {
    const acc = accountsMap.get(m.account_id);
    const accountName = acc ? toStr(acc.title) : `حساب #${m.account_id}`;

    const linkedInvs = moneyToInvoiceMap.get(m.id) || [];
    const linkedInvNotes = linkedInvs.length > 0
      ? `مرتبط بفواتير: ${linkedInvs.map(li => `${li.i_kind} #${li.i_id} (${toNum(li.amount).toLocaleString()})`).join(', ')}`
      : '';

    const userId = m.createdby_id ? gId('user', m.createdby_id) : 'user_3';
    const userObj = dbUsers.find(u => u.id === m.createdby_id);
    const userName = userObj ? toStr(userObj.title) : 'mostafa';

    return {
      id: gId('dep', m.pk),
      amount: toNum(m.amount),
      sourceId: m.account_id ? gId('cust', m.account_id) : 'unknown',
      sourceName: accountName,
      userId,
      userName,
      notes: [
        toStr(m.category1),
        toStr(m.category2),
        toStr(m.more),
        linkedInvNotes,
        m.is_cheque === 1 ? `شيك رقم: ${toStr(m.cheque_no)} - بنك: ${toStr(m.cheque_bank)}` : '',
        toStr(m.reference) ? `مرجع: ${m.reference}` : '',
      ].filter(Boolean).join(' | ') || undefined,
      createdAt: makeDate(m.date1, m.time1),
    };
  });
console.log(`  ✅ سندات قبض (إيداعات): ${deposits.length}`);

// Generate depositSources from unique sources in deposits
const depositSourcesMap = new Map();
deposits.forEach(dep => {
  if (dep.sourceId && dep.sourceName && !depositSourcesMap.has(dep.sourceId)) {
    depositSourcesMap.set(dep.sourceId, {
      id: dep.sourceId,
      name: dep.sourceName,
      description: `مصدر مستورد من sahl2`,
      active: true,
      createdAt: dep.createdAt || new Date().toISOString(),
    });
  }
});
const depositSources = Array.from(depositSourcesMap.values());
console.log(`  ✅ مصادر إيداعات: ${depositSources.length}`);

// ========================================
// Money PAYMENT → expenses
// ========================================
const expenses = moneyRaw
  .filter(m => m.kind === 'PAYMENT')
  .map(m => {
    const acc = accountsMap.get(m.account_id);
    const accountName = acc ? toStr(acc.title) : '';

    const userId = m.createdby_id ? gId('user', m.createdby_id) : 'user_3';

    return {
      id: gId('exp', m.pk),
      description: [toStr(m.category1), toStr(m.category2), accountName].filter(Boolean).join(' - ') || 'مصروف',
      amount: toNum(m.amount),
      category: toStr(m.category1) || 'مصاريف',
      userId,
      createdAt: makeDate(m.date1, m.time1),
      notes: [
        toStr(m.more),
        toStr(m.reference) ? `مرجع: ${m.reference}` : '',
      ].filter(Boolean).join(' | ') || undefined,
    };
  });
console.log(`  ✅ مصروفات: ${expenses.length}`);

// Log skipped records
const transfers = moneyRaw.filter(m => m.kind === 'TRANSFER');
const openBal = moneyRaw.filter(m => m.kind === 'OPEN');
const otherInvoices = rawInvoices.filter(inv => !['SALE', 'RETURNSALE', 'PURCHASE', 'RETURNPUR'].includes(inv.kind));
if (transfers.length) console.log(`  ℹ️ تحويلات بين صناديق: ${transfers.length} (لا يوجد مكافئ - تم التجاهل)`);
if (openBal.length) console.log(`  ℹ️ أرصدة افتتاحية: ${openBal.length} (مضمنة في أرصدة العملاء)`);
if (otherInvoices.length) {
  const kinds = {};
  otherInvoices.forEach(inv => { kinds[inv.kind] = (kinds[inv.kind] || 0) + 1; });
  console.log(`  ℹ️ فواتير أخرى تم تجاهلها: ${JSON.stringify(kinds)}`);
}

// ========================================
// Settings
// ========================================
const opt = options.length > 0 ? options[0] : {};
const settingsData = [
  { id: 'storeName', key: 'storeName', value: toStr(opt.company) || 'LONG TIME' },
  { id: 'storeNameDisplay', key: 'storeNameDisplay', value: toStr(opt.company_receipt) || toStr(opt.company) || 'LONG TIME' },
  { id: 'currency', key: 'currency', value: 'EGP' },
  { id: 'taxRate', key: 'taxRate', value: '0' },
];
console.log(`  ✅ إعدادات: ${settingsData.length}`);

// ========================================
// Build Final JSON
// ========================================

const myposBackup = {
  version: '1.0',
  createdAt: new Date().toISOString(),
  app: 'MYPOS',
  sourceSystem: 'sahl2 (LONG TIME)',
  data: {
    users,
    products,
    customers,
    suppliers,
    salesReps,
    productCategories,
    units,
    priceTypes,
    paymentMethods,
    warehouses,
    settings: settingsData,
    invoices: saleInvoices,
    salesReturns,
    purchases: purchasesList,
    purchaseReturns,
    deposits,
    depositSources,
    expenses,
    employees: [],
    installments: [],
    shifts: [],
    promotions: [],
    supervisors: [],
  },
};

// ========================================
// Write output
// ========================================
console.log('\n💾 جاري كتابة ملف الاستيراد...');
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(myposBackup, null, 2), 'utf8');
const fileSize = fs.statSync(OUTPUT_FILE).size;
console.log(`✅ تم إنشاء الملف: ${OUTPUT_FILE}`);
console.log(`   حجم الملف: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

// ========================================
// Summary
// ========================================
console.log('\n' + '═'.repeat(55));
console.log('📊 ملخص البيانات المحولة الكامل:');
console.log('═'.repeat(55));
console.log(`  📦 المنتجات:          ${products.length} (${products.filter(p => p.isActive).length} نشط)`);
console.log(`  👥 العملاء:           ${customers.length} (${customers.filter(c => !c.notes || !c.notes.includes('متوقف')).length} نشط)`);
console.log(`  📂 التصنيفات:         ${productCategories.length}`);
console.log(`  📏 الوحدات:           ${units.length}`);
console.log(`  🏪 المخازن:           ${warehouses.length}`);
console.log(`  💰 أنواع الأسعار:     ${priceTypes.length}`);
console.log(`  💳 طرق الدفع:        ${paymentMethods.length}`);
console.log(`  👤 المستخدمين:        ${users.length}`);
console.log('─'.repeat(55));
console.log(`  🧾 فواتير البيع:      ${saleInvoices.length}`);
console.log(`  ↩️  مرتجعات البيع:    ${salesReturns.length}`);
console.log(`  📥 فواتير الشراء:     ${purchasesList.length}`);
console.log(`  ↪️  مرتجعات الشراء:   ${purchaseReturns.length}`);
console.log(`  💵 سندات القبض:       ${deposits.length}`);
console.log(`  💸 المصروفات:         ${expenses.length}`);
console.log(`  ⚙️  الإعدادات:         ${settingsData.length}`);
console.log('─'.repeat(55));

let totalInvItems = 0;
saleInvoices.forEach(i => totalInvItems += i.items.length);
salesReturns.forEach(i => totalInvItems += i.items.length);
purchasesList.forEach(i => totalInvItems += i.items.length);
purchaseReturns.forEach(i => totalInvItems += i.items.length);
console.log(`  📋 إجمالي بنود الفواتير: ${totalInvItems}`);

const cashInv = saleInvoices.filter(i => i.paymentType === 'cash').length;
const creditInv = saleInvoices.filter(i => i.paymentType === 'credit').length;
const paidInv = saleInvoices.filter(i => i.paymentStatus === 'paid').length;
const unpaidInv = saleInvoices.filter(i => i.paymentStatus === 'unpaid').length;
const partialInv = saleInvoices.filter(i => i.paymentStatus === 'partial').length;
console.log(`  📊 فواتير نقدي: ${cashInv} | آجل: ${creditInv}`);
console.log(`  📊 مدفوع: ${paidInv} | غير مدفوع: ${unpaidInv} | جزئي: ${partialInv}`);

const totalSales = saleInvoices.reduce((sum, i) => sum + i.total, 0);
const totalRet = salesReturns.reduce((sum, i) => sum + i.total, 0);
const totalPur = purchasesList.reduce((sum, i) => sum + i.total, 0);
const totalDep = deposits.reduce((sum, i) => sum + i.amount, 0);
const totalExp = expenses.reduce((sum, i) => sum + i.amount, 0);
console.log(`  💰 إجمالي المبيعات:    ${totalSales.toLocaleString()} جنيه`);
console.log(`  💰 إجمالي المرتجعات:   ${totalRet.toLocaleString()} جنيه`);
console.log(`  💰 إجمالي المشتريات:   ${totalPur.toLocaleString()} جنيه`);
console.log(`  💰 إجمالي التحصيلات:   ${totalDep.toLocaleString()} جنيه`);
console.log(`  💰 إجمالي المصروفات:   ${totalExp.toLocaleString()} جنيه`);

console.log('═'.repeat(55));
console.log('\n🎉 جاهز للاستيراد! استخدم ملف sahl2_import_for_mypos.json');
console.log('   الإعدادات → النسخ الاحتياطي → استعادة نسخة احتياطية\n');

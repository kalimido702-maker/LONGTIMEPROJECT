/**
 * Calculation Service - خدمة الحسابات الموحدة
 *
 * يحتوي على جميع الحسابات المالية المستخدمة في التطبيق
 * لضمان الدقة والاتساق في:
 * - إغلاق الورديات
 * - التقارير اليومية
 * - ملخص المبيعات
 * - حسابات النقدية المتوقعة
 */

import { db } from "@/shared/lib/indexedDB";

// ==================== Types ====================

export interface ShiftSalesCalculation {
  totalSales: number;
  totalInvoices: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  returns: number;
  paymentMethodBreakdown: Record<
    string,
    {
      name: string;
      amount: number;
      type: string;
    }
  >;
}

export interface ExpectedCashCalculation {
  startingCash: number;
  salesCash: number;
  cashIn: number;
  cashOut: number;
  expenses: number;
  returns: number;
  expectedCash: number;
  expensesList?: any[];
  creditPaymentsCash?: number; // تسديدات الآجل النقدية
}

export interface DailySummaryCalculation {
  date: string;
  invoiceCount: number;
  totalSales: number;
  totalExpenses: number;
  totalReturns: number;
  totalCredit: number; // فواتير الآجل
  creditInvoiceCount: number; // عدد فواتير الآجل
  creditPaymentsReceived: number; // تسديدات الآجل المستلمة اليوم
  netProfit: number;
  paymentMethodSales: Record<string, { name: string; amount: number }>;
}

export interface ReportTotals {
  totalSales: number;
  totalExpenses: number;
  totalReturns: number;
  netSales: number;
  netProfit: number;
}

// ==================== Helper Functions ====================

/**
 * تصنيف طريقة الدفع إلى فئة أساسية
 */
function categorizePaymentMethod(
  method: any
): "cash" | "card" | "wallet" | "other" {
  if (!method?.type) return "other";

  const type = method.type.toLowerCase();

  if (type === "cash" || type === "نقدي") return "cash";
  if (
    type === "visa" ||
    type === "card" ||
    type === "بطاقة" ||
    type === "bank_transfer"
  )
    return "card";
  if (type === "wallet" || type === "محفظة") return "wallet";

  return "other";
}

/**
 * جلب فواتير وردية معينة
 */
async function getShiftInvoices(shiftId: string): Promise<any[]> {
  const allInvoices = await db.getAll<any>("invoices");
  return allInvoices.filter(
    (inv) => inv.shiftId === shiftId || inv.shiftId === shiftId.toString()
  );
}

/**
 * جلب مصروفات وردية معينة
 */
async function getShiftExpenses(shiftId: string): Promise<any[]> {
  const allExpenses = await db.getAll<any>("expenseItems");
  return allExpenses.filter(
    (exp) => exp.shiftId === shiftId || exp.shiftId === shiftId.toString()
  );
}

/**
 * جلب حركات النقدية لوردية معينة
 */
async function getShiftCashMovements(shiftId: string): Promise<any[]> {
  const allMovements = await db.getAll<any>("cashMovements");
  return allMovements.filter(
    (m) => m.shiftId === shiftId || m.shiftId === shiftId.toString()
  );
}

/**
 * جلب تسديدات الآجل لوردية معينة
 * هذه هي المبالغ التي يدفعها العملاء لتسديد فواتيرهم الآجلة
 */
async function getShiftCreditPayments(shiftId: string): Promise<any[]> {
  const allPayments = await db.getAll<any>("payments");
  return allPayments.filter(
    (p) => p.shiftId === shiftId || p.shiftId === shiftId.toString()
  );
}

/**
 * حساب تفصيل طرق الدفع من الفواتير
 */
export function calculatePaymentMethodBreakdown(
  invoices: any[],
  paymentMethods: any[]
): Record<string, { name: string; amount: number; type: string }> {
  const breakdown: Record<
    string,
    { name: string; amount: number; type: string }
  > = {};

  // تهيئة جميع طرق الدفع بقيمة 0
  paymentMethods.forEach((method) => {
    breakdown[method.id] = {
      name: method.name,
      amount: 0,
      type: method.type || "other",
    };
  });

  // حساب المبلغ لكل طريقة دفع
  invoices.forEach((inv) => {
    // النظام الجديد - paymentMethodAmounts
    if (
      inv.paymentMethodAmounts &&
      Object.keys(inv.paymentMethodAmounts).length > 0
    ) {
      Object.entries(inv.paymentMethodAmounts).forEach(
        ([methodId, amount]: [string, any]) => {
          let amountValue = parseFloat(amount) || 0;

          // معالجة الداتا القديمة: لو الفاتورة نقدية وطريقة الدفع متحددة لكن المبلغ = 0
          // فدا معناه إن العميل دفع كل المبلغ (باق من داتا قديمة)
          if (amountValue === 0 && inv.paymentType === "cash") {
            amountValue = inv.total || 0;
          }

          // معالجة default-payment-cash القديمة
          if (amountValue === 0 && methodId === "default-payment-cash") {
            amountValue = inv.total || 0;
          }

          if (breakdown[methodId]) {
            breakdown[methodId].amount += amountValue;
          } else {
            // طريقة دفع غير موجودة في القائمة الأساسية - نبحث عنها
            // مهم: نبحث في paymentMethods الأصلية مش في الفاتورة
            const method = paymentMethods.find((pm: any) => pm.id === methodId || pm.id === methodId.toString());
            breakdown[methodId] = {
              name: method?.name || methodId,
              amount: amountValue,
              type: method?.type || "other",
            };
          }
        }
      );
    }
    // النظام القديم - paymentType فقط
    else if (inv.paymentType) {
      const amount = inv.total || 0;
      const cashMethod = paymentMethods.find((pm) => pm.type === "cash");

      if (
        (inv.paymentType === "cash" || inv.paymentType === "نقدي") &&
        cashMethod
      ) {
        breakdown[cashMethod.id].amount += amount;
      }
    }
    // لا يوجد معلومات دفع - اعتبارها نقدي افتراضياً
    else {
      const cashMethod = paymentMethods.find((pm) => pm.type === "cash");
      if (cashMethod) {
        breakdown[cashMethod.id].amount += inv.total || 0;
      }
    }
  });

  return breakdown;
}

// ==================== Main Calculation Functions ====================

/**
 * حساب مبيعات الوردية بالكامل
 */
export async function calculateShiftSales(
  shiftId: string
): Promise<ShiftSalesCalculation> {
  await db.init();

  const invoices = await getShiftInvoices(shiftId);
  const paymentMethods = await db.getAll<any>("paymentMethods");

  // حساب الإجماليات
  const totalSales = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalInvoices = invoices.length;

  // حساب تفصيل طرق الدفع
  const paymentMethodBreakdown = calculatePaymentMethodBreakdown(
    invoices,
    paymentMethods
  );

  // حساب المبيعات حسب الفئة (cash/card/wallet)
  let cashSales = 0;
  let cardSales = 0;
  let walletSales = 0;
  let returns = 0;

  Object.values(paymentMethodBreakdown).forEach((data) => {
    const category = categorizePaymentMethod({ type: data.type });
    switch (category) {
      case "cash":
        cashSales += data.amount;
        break;
      case "card":
        cardSales += data.amount;
        break;
      case "wallet":
        walletSales += data.amount;
        break;
    }
  });

  // حساب المرتجعات
  invoices.forEach((inv) => {
    if (inv.returns) returns += inv.returns;
  });

  return {
    totalSales,
    totalInvoices,
    cashSales,
    cardSales,
    walletSales,
    returns,
    paymentMethodBreakdown,
  };
}

/**
 * حساب النقدية المتوقعة للوردية
 */
export async function calculateExpectedCash(
  shiftId: string
): Promise<ExpectedCashCalculation> {
  await db.init();

  const shift = await db.get<any>("shifts", shiftId.toString());
  if (!shift) {
    throw new Error("الوردية غير موجودة");
  }

  // جلب البيانات
  const sales = await calculateShiftSales(shiftId);
  const expenses = await getShiftExpenses(shiftId);
  const movements = await getShiftCashMovements(shiftId);
  const creditPayments = await getShiftCreditPayments(shiftId);

  // حساب الحركات النقدية
  const cashIn = movements
    .filter((m) => m.type === "in")
    .reduce((sum, m) => sum + m.amount, 0);

  const cashOut = movements
    .filter((m) => m.type === "out")
    .reduce((sum, m) => sum + m.amount, 0);

  // حساب المصروفات
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // حساب تسديدات الآجل النقدية
  // فقط التسديدات التي تمت بالنقد تُضاف للنقدية المتوقعة
  const creditPaymentsCash = creditPayments
    .filter((p) => p.paymentMethod === "cash")
    .reduce((sum, p) => sum + p.amount, 0);

  // المعادلة الموحدة للنقدية المتوقعة:
  // النقدية المتوقعة = الرصيد الافتتاحي + المبيعات النقدية + الإيداعات - السحوبات - المصروفات - المرتجعات + تسديدات الآجل النقدية
  const expectedCash =
    shift.startingCash +
    sales.cashSales +
    cashIn -
    cashOut -
    totalExpenses -
    sales.returns +
    creditPaymentsCash;

  return {
    startingCash: shift.startingCash,
    salesCash: sales.cashSales,
    cashIn,
    cashOut,
    expenses: totalExpenses,
    returns: sales.returns,
    expectedCash,
    expensesList: expenses,
    creditPaymentsCash, // إضافة تسديدات الآجل للنتيجة
  };
}

/**
 * حساب ملخص مبيعات يوم معين
 */
export async function calculateDailySummary(
  date?: Date
): Promise<DailySummaryCalculation> {
  await db.init();

  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);

  // جلب البيانات
  const allInvoices = await db.getAll<any>("invoices");
  const allExpenses = await db.getAll<any>("expenseItems");
  const allReturns = await db.getAll<any>("salesReturns");
  const paymentMethods = await db.getAll<any>("paymentMethods");

  // تصفية البيانات اليومية
  const todayInvoices = allInvoices.filter((inv) => {
    const invDate = new Date(inv.createdAt);
    invDate.setHours(0, 0, 0, 0);
    return invDate.getTime() === targetDate.getTime();
  });

  const todayExpenses = allExpenses.filter((exp) => {
    // تحقق من وجود createdAt
    if (!exp.createdAt) {
      console.warn("⚠️ Expense without createdAt:", exp);
      return false;
    }
    const expDate = new Date(exp.createdAt);
    expDate.setHours(0, 0, 0, 0);
    return expDate.getTime() === targetDate.getTime();
  });

  const todayReturns = allReturns.filter((ret) => {
    const retDate = new Date(ret.createdAt);
    retDate.setHours(0, 0, 0, 0);
    return retDate.getTime() === targetDate.getTime();
  });

  // الحسابات
  const totalSales = todayInvoices.reduce(
    (sum, inv) => sum + (inv.total || 0),
    0
  );
  const totalExpenses = todayExpenses.reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0
  );
  const totalReturns = todayReturns.reduce(
    (sum, ret) => sum + (ret.total || 0),
    0
  );

  // حساب الآجل (الفواتير الآجلة اللي لسه مش مدفوعة بالكامل)
  const creditInvoices = todayInvoices.filter(
    (inv) => inv.paymentType === "credit"
  );
  const creditInvoiceCount = creditInvoices.length;
  // المبلغ المتبقي (غير المحصّل) من فواتير الآجل
  const totalCredit = creditInvoices.reduce(
    (sum, inv) => sum + (inv.remainingAmount || inv.total - (inv.paidAmount || 0) || 0),
    0
  );

  // تسديدات الآجل المستلمة اليوم
  const allPayments = await db.getAll<any>("payments");
  const todayPayments = allPayments.filter((payment) => {
    if (!payment.createdAt) return false;
    const payDate = new Date(payment.createdAt);
    payDate.setHours(0, 0, 0, 0);
    return payDate.getTime() === targetDate.getTime();
  });
  const creditPaymentsReceived = todayPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  // تفصيل طرق الدفع
  const paymentMethodBreakdown = calculatePaymentMethodBreakdown(
    todayInvoices,
    paymentMethods
  );

  // تحويل للصيغة المطلوبة (بدون type)
  const paymentMethodSales: Record<string, { name: string; amount: number }> =
    {};
  Object.entries(paymentMethodBreakdown).forEach(([id, data]) => {
    paymentMethodSales[id] = {
      name: data.name,
      amount: data.amount,
    };
  });

  return {
    date: targetDate.toISOString(),
    invoiceCount: todayInvoices.length,
    totalSales,
    totalExpenses,
    totalReturns,
    totalCredit,
    creditInvoiceCount,
    creditPaymentsReceived,
    // صافي الربح = المبيعات - المصروفات - المرتجعات - الآجل (غير المحصّل) + تسديدات الآجل
    netProfit: totalSales - totalExpenses - totalReturns - totalCredit + creditPaymentsReceived,
    paymentMethodSales,
  };
}

/**
 * حساب إجماليات التقارير
 */
export function calculateReportTotals(
  invoices: any[],
  expenses: any[],
  returns: any[]
): ReportTotals {
  const totalSales = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalExpenses = expenses.reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0
  );
  const totalReturns = returns.reduce((sum, ret) => sum + (ret.total || 0), 0);

  const netSales = totalSales - totalReturns;
  const netProfit = netSales - totalExpenses;

  return {
    totalSales,
    totalExpenses,
    totalReturns,
    netSales,
    netProfit,
  };
}

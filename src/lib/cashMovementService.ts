// Cash Movements Service - إدارة حركات النقدية أثناء الوردية
import { db, CashMovement, Shift } from "@/shared/lib/indexedDB";
import { writeAuditLog } from "./transactionService";

interface CashMovementInput {
  shiftId: number;
  type: "in" | "out";
  amount: number;
  reason: string;
  category?: string;
  notes?: string;
}

interface CashMovementContext {
  userId: string;
  userName: string;
}

/**
 * إضافة حركة نقدية (إيداع أو سحب)
 */
export async function addCashMovement(
  input: CashMovementInput,
  context: CashMovementContext
): Promise<CashMovement> {
  await db.init();

  // Validate shift exists and is active
  const shift = await db.get<Shift>("shifts", input.shiftId.toString());
  if (!shift) {
    throw new Error("الوردية غير موجودة");
  }
  if (shift.status !== "active") {
    throw new Error("لا يمكن إضافة حركة نقدية لوردية مغلقة");
  }

  // Validate amount
  if (input.amount <= 0) {
    throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  }

  // Create cash movement
  const cashMovement: CashMovement = {
    id: `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    shiftId: input.shiftId,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    category: input.category,
    userId: context.userId,
    userName: context.userName,
    createdAt: new Date().toISOString(),
    notes: input.notes,
  };

  // Save movement
  await db.add("cashMovements", cashMovement);

  // Write audit log
  await writeAuditLog(
    `cashMovement.${input.type}`,
    "cashMovements",
    cashMovement.id,
    {
      userId: context.userId,
      userName: context.userName,
      shiftId: input.shiftId.toString(),
    },
    { newValue: cashMovement }
  );

  return cashMovement;
}

/**
 * الحصول على جميع حركات النقدية لوردية معينة
 */
export async function getCashMovementsForShift(
  shiftId: number
): Promise<CashMovement[]> {
  await db.init();
  const allMovements = await db.getAll<CashMovement>("cashMovements");
  return allMovements
    .filter((m) => m.shiftId === shiftId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

/**
 * حساب إجمالي الإيداعات والسحوبات لوردية
 */
export async function getCashMovementsSummary(shiftId: number): Promise<{
  totalIn: number;
  totalOut: number;
  netChange: number;
  movements: CashMovement[];
}> {
  const movements = await getCashMovementsForShift(shiftId);

  const totalIn = movements
    .filter((m) => m.type === "in")
    .reduce((sum, m) => sum + m.amount, 0);

  const totalOut = movements
    .filter((m) => m.type === "out")
    .reduce((sum, m) => sum + m.amount, 0);

  return {
    totalIn,
    totalOut,
    netChange: totalIn - totalOut,
    movements,
  };
}

/**
 * حذف حركة نقدية (فقط إذا كانت الوردية مازالت مفتوحة)
 */
export async function deleteCashMovement(
  id: string,
  context: CashMovementContext
): Promise<void> {
  await db.init();

  const movement = await db.get<CashMovement>("cashMovements", id);
  if (!movement) {
    throw new Error("الحركة غير موجودة");
  }

  // Check shift is still active
  const shift = await db.get<Shift>("shifts", movement.shiftId.toString());
  if (!shift || shift.status !== "active") {
    throw new Error("لا يمكن حذف حركة نقدية من وردية مغلقة");
  }

  // Delete
  await db.delete("cashMovements", id);

  // Write audit log
  await writeAuditLog(
    "cashMovement.delete",
    "cashMovements",
    id,
    {
      userId: context.userId,
      userName: context.userName,
      shiftId: movement.shiftId.toString(),
    },
    { oldValue: movement }
  );
}

/**
 * الحصول على تفاصيل النقدية المتوقعة للوردية
 * @deprecated استخدم calculateExpectedCash من calculationService بدلاً من ذلك
 */
export async function getShiftCashSummary(shiftId: number): Promise<{
  startingCash: number;
  salesCash: number;
  cashIn: number;
  cashOut: number;
  expenses: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
}> {
  // استخدام الدالة الموحدة من calculationService
  const { calculateExpectedCash } = await import("./calculationService");

  const result = await calculateExpectedCash(shiftId.toString());

  const shift = await db.get<Shift>("shifts", shiftId.toString());

  return {
    startingCash: result.startingCash,
    salesCash: result.salesCash,
    cashIn: result.cashIn,
    cashOut: result.cashOut,
    expenses: result.expenses,
    expectedCash: result.expectedCash,
    actualCash: shift?.actualCash,
    difference: shift?.difference,
  };
}

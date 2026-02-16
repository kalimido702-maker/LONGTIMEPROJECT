/**
 * Hook لحساب أرصدة العملاء الفعلية من الحركات (فواتير + مدفوعات + مرتجعات + بونص)
 * بدلاً من الاعتماد على currentBalance المخزن في IndexedDB الذي قد يكون قديماً
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { db, Customer, Invoice, Payment } from "@/shared/lib/indexedDB";

export interface CustomerBalanceMap {
  [customerId: string]: number;
}

/**
 * حساب أرصدة جميع العملاء دفعة واحدة من الحركات الفعلية
 * أخف وأسرع من استدعاء generateAccountStatement لكل عميل
 */
export async function calculateAllCustomerBalances(): Promise<CustomerBalanceMap> {
  const balanceMap: CustomerBalanceMap = {};

  try {
    // تحميل كل البيانات دفعة واحدة
    const [customers, invoices, payments, salesReturns] = await Promise.all([
      db.getAll<Customer>("customers"),
      db.getAll<Invoice>("invoices"),
      db.getAll<Payment>("payments"),
      db.getAll<any>("salesReturns"),
    ]);

    // تحميل البونص من localStorage
    let allBonuses: any[] = [];
    try {
      const savedBonuses = localStorage.getItem("pos-bonuses");
      if (savedBonuses) {
        allBonuses = JSON.parse(savedBonuses);
      }
    } catch {
      // ignore
    }

    // تهيئة الأرصدة من الرصيد السابق
    customers.forEach((c) => {
      balanceMap[String(c.id)] = Number(c.previousStatement) || 0;
    });

    // إضافة الفواتير (عليه / مدين)
    invoices.forEach((inv) => {
      const cid = String(inv.customerId);
      if (inv.customerId && balanceMap[cid] !== undefined) {
        balanceMap[cid] += Number(inv.total) || 0;
      }
    });

    // خصم المدفوعات (له / دائن)
    payments.forEach((pay: any) => {
      const cid = String(pay.customerId);
      if (pay.customerId && balanceMap[cid] !== undefined) {
        balanceMap[cid] -= Number(pay.amount) || 0;
      }
    });

    // خصم المرتجعات (له / دائن)
    salesReturns.forEach((ret: any) => {
      const cid = String(ret.customerId);
      if (ret.customerId && balanceMap[cid] !== undefined) {
        balanceMap[cid] -= Number(ret.total || ret.amount) || 0;
      }
    });

    // خصم البونص (له / دائن)
    allBonuses.forEach((bonus: any) => {
      const cid = String(bonus.customerId);
      if (bonus.customerId && balanceMap[cid] !== undefined) {
        balanceMap[cid] -= Number(bonus.bonusAmount || bonus.amount) || 0;
      }
    });
  } catch (error) {
    console.error("Error calculating customer balances:", error);
  }

  return balanceMap;
}

/**
 * حساب رصيد عميل واحد من الحركات الفعلية
 */
export async function calculateSingleCustomerBalance(customerId: string): Promise<number> {
  const map = await calculateAllCustomerBalances();
  return map[String(customerId)] || 0;
}

/**
 * Hook يقوم بحساب أرصدة العملاء الفعلية ويعيد دالة getBalance
 * يُستخدم في الصفحات التي تعرض أرصدة عملاء متعددة
 */
export function useCustomerBalances(dependencies: any[] = []) {
  const [balanceMap, setBalanceMap] = useState<CustomerBalanceMap>({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const map = await calculateAllCustomerBalances();
      if (mountedRef.current) {
        setBalanceMap(map);
      }
    } catch (error) {
      console.error("Error in useCustomerBalances:", error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, dependencies);

  /**
   * الحصول على الرصيد الفعلي لعميل معين
   * يرجع الرصيد المحسوب إذا كان متاحاً، وإلا يرجع القيمة الاحتياطية
   */
  const getBalance = useCallback(
    (customerId: string, fallback: number = 0): number => {
      const key = String(customerId);
      if (balanceMap[key] !== undefined) {
        return balanceMap[key];
      }
      return fallback;
    },
    [balanceMap]
  );

  return { balanceMap, getBalance, loading, refresh };
}

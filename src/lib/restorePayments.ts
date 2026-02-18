/**
 * Utility to restore collection payments from localStorage to IndexedDB
 * 
 * This handles the case where sync (forceResync) clears IndexedDB payments
 * but the data still exists in localStorage (pos-collections).
 * 
 * Called from multiple components to ensure data consistency.
 */

import { db } from "@/shared/lib/indexedDB";

/**
 * Check localStorage for collection payments that are missing from IndexedDB
 * and restore them. Returns the restored records.
 */
export async function restoreCollectionPayments(): Promise<any[]> {
    try {
        const allPayments = await db.getAll<any>("payments");
        const saved = localStorage.getItem('pos-collections');
        if (!saved) return [];

        const localCollections = JSON.parse(saved) as any[];
        const existingIds = new Set(allPayments.map((p: any) => String(p.id)));
        const restored: any[] = [];

        for (const lc of localCollections) {
            if (lc.id && !existingIds.has(String(lc.id))) {
                const dbRecord = {
                    id: lc.id,
                    customerId: String(lc.customerId),
                    customerName: lc.customerName || "",
                    amount: Number(lc.amount) || 0,
                    paymentMethodId: lc.paymentMethodId || "",
                    paymentMethodName: lc.paymentMethodName || "",
                    paymentType: "collection",
                    paymentDate: lc.createdAt || new Date().toISOString(),
                    createdAt: lc.createdAt || new Date().toISOString(),
                    userId: lc.userId || "",
                    userName: lc.userName || "",
                    notes: lc.notes,
                };
                try {
                    await db.add("payments", dbRecord);
                    restored.push(dbRecord);
                } catch { /* skip duplicates */ }
            }
        }

        if (restored.length > 0) {
            console.log(`[restorePayments] 🔄 Restored ${restored.length} collection payments from localStorage to IndexedDB`);
        }

        return restored;
    } catch {
        return [];
    }
}

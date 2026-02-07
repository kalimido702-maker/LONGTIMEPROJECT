import { Migration } from "./Migration.interface";

/**
 * Migration v5 - Add purchaseReturns field to shifts
 */
export const migration_v5: Migration = {
  version: 5,
  name: "add_purchase_returns_to_shifts",

  up(db: IDBDatabase, transaction: IDBTransaction): void {
    if (!db.objectStoreNames.contains("shifts")) return;

    const shiftsStore = transaction.objectStore("shifts");
    const getAllRequest = shiftsStore.getAll();

    getAllRequest.onsuccess = () => {
      const shifts = getAllRequest.result;
      shifts.forEach((shift: any) => {
        if (shift.purchaseReturns === undefined) {
          shift.purchaseReturns = 0;
          shiftsStore.put(shift);
        }
      });
    };
  },
};

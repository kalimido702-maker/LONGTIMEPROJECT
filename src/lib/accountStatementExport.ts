/**
 * Account Statement Export - تصدير كشف حساب العميل
 * يتبع نفس تنسيق الملف المرفق
 */

import * as XLSX from "xlsx";
import { toast } from "sonner";
import { db, Customer, Invoice, Payment } from "@/shared/lib/indexedDB";

export interface AccountStatementRow {
    date: string;
    movement: string;
    debit: number; // عليه / مدين
    credit: number; // له / دائن
    balance: number;
    movementId: string;
    notes: string;
}

export interface AccountStatementSummary {
    totalSales: number;
    totalReturns: number;
    totalPayments: number;
    totalDebt: number;
}

export interface AccountStatementData {
    customer: Customer;
    dateFrom: Date;
    dateTo: Date;
    rows: AccountStatementRow[];
    summary: AccountStatementSummary;
    openingBalance: number;
    closingBalance: number;
}

/**
 * Generate account statement data for a customer
 */
export async function generateAccountStatement(
    customerId: string,
    dateFrom: Date,
    dateTo: Date
): Promise<AccountStatementData | null> {
    const customer = await db.get<Customer>("customers", customerId);
    if (!customer) {
        toast.error("العميل غير موجود");
        return null;
    }

    // Get all invoices for this customer
    const allInvoices = await db.getAll<Invoice>("invoices");
    const custIdStr = String(customerId);
    const customerInvoices = allInvoices.filter(
        (inv) => String(inv.customerId) === custIdStr
    );

    // Get all payments for this customer
    const allPayments = await db.getAll<Payment>("payments");

    // ====== استعادة سجلات القبض من localStorage إذا كانت مفقودة ======
    let finalPayments = allPayments;
    try {
        const savedCollections = localStorage.getItem('pos-collections');
        if (savedCollections) {
            const localCollections = JSON.parse(savedCollections) as any[];
            const existingIds = new Set(allPayments.map((p: any) => String(p.id)));
            const missingRecords: any[] = [];
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
                        missingRecords.push(dbRecord);
                        console.log('[AccountStatement] ✅ Restored payment:', lc.id);
                    } catch { /* skip duplicates */ }
                }
            }
            if (missingRecords.length > 0) {
                finalPayments = [...allPayments, ...missingRecords] as Payment[];
                console.log(`[AccountStatement] 🔄 Restored ${missingRecords.length} payments from localStorage`);
            }
        }
    } catch { /* ignore */ }

    const customerPayments = finalPayments.filter(
        (pay: any) => String(pay.customerId) === custIdStr
    );
    console.log('[AccountStatement] All payments in DB:', finalPayments.length, 'Customer payments:', customerPayments.length, 'Customer ID:', custIdStr);

    // Get sales returns
    const allReturns = await db.getAll<any>("salesReturns");
    const customerReturns = allReturns.filter(
        (ret) => String(ret.customerId) === custIdStr
    );

    // Get bonuses from IndexedDB (with localStorage fallback for migration)
    let customerBonuses: any[] = [];
    try {
        const allBonuses = await db.getAll<any>("customerBonuses");
        customerBonuses = allBonuses.filter(
            (bonus) => String(bonus.customerId) === custIdStr
        );
        // Fallback: check localStorage for old data not yet migrated
        if (customerBonuses.length === 0) {
            const savedBonuses = localStorage.getItem("pos-bonuses");
            if (savedBonuses) {
                const oldBonuses = JSON.parse(savedBonuses) as any[];
                customerBonuses = oldBonuses.filter(
                    (bonus) => String(bonus.customerId) === custIdStr
                );
            }
        }
        console.log('[AccountStatement] Customer bonuses:', customerBonuses.length);
    } catch (error) {
        console.error("Error loading bonuses:", error);
    }

    // Build rows
    const rows: AccountStatementRow[] = [];
    let runningBalance = Number(customer.previousStatement) || 0;

    // Combine all movements and sort by date
    const movements: {
        date: Date;
        type: "invoice" | "payment" | "return" | "bonus";
        data: any;
    }[] = [];

    customerInvoices.forEach((inv) => {
        movements.push({
            date: new Date(inv.createdAt),
            type: "invoice",
            data: inv,
        });
    });

    customerPayments.forEach((pay: any) => {
        movements.push({
            date: new Date(pay.createdAt || pay.paymentDate),
            type: "payment",
            data: pay,
        });
    });

    customerReturns.forEach((ret) => {
        movements.push({
            date: new Date(ret.createdAt),
            type: "return",
            data: ret,
        });
    });

    customerBonuses.forEach((bonus) => {
        movements.push({
            date: new Date(bonus.createdAt),
            type: "bonus",
            data: bonus,
        });
    });

    // Sort by date
    movements.sort((a, b) => a.date.getTime() - b.date.getTime());

    console.log('[AccountStatement] Customer:', customer.name);
    console.log('[AccountStatement] Total movements found:', movements.length);
    console.log('[AccountStatement] Invoices:', customerInvoices.length);
    console.log('[AccountStatement] Payments:', customerPayments.length);
    console.log('[AccountStatement] Returns:', customerReturns.length);
    console.log('[AccountStatement] Date range:', dateFrom, 'to', dateTo);

    // Filter by date range and build rows
    const summary: AccountStatementSummary = {
        totalSales: 0,
        totalReturns: 0,
        totalPayments: 0,
        totalDebt: 0,
    };

    // Normalize date range for proper comparison
    const startOfDay = new Date(dateFrom);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);

    // First pass: Calculate opening balance from ALL movements BEFORE the date range
    // This ensures the balance reflects the full history, not just the filtered period
    let openingBalance = Number(customer.previousStatement) || 0;
    movements.forEach((mov) => {
        if (mov.date >= startOfDay) return; // Only process movements BEFORE the range

        switch (mov.type) {
            case "invoice":
                openingBalance += Number(mov.data.total) || 0;
                break;
            case "payment":
                openingBalance -= Number(mov.data.amount) || 0;
                break;
            case "return":
                openingBalance -= Number(mov.data.total || mov.data.amount) || 0;
                break;
            case "bonus":
                openingBalance -= Number(mov.data.bonusAmount || mov.data.amount) || 0;
                break;
        }
    });

    // Second pass: Build rows for movements IN the date range, starting from the calculated opening balance
    runningBalance = openingBalance;

    movements.forEach((mov, index) => {
        // Filter by date range (using normalized dates)
        if (mov.date < startOfDay || mov.date > endOfDay) return;

        let debit = 0;
        let credit = 0;
        let movementType = "";
        let movementId = "";
        let notes = "";

        switch (mov.type) {
            case "invoice":
                debit = Number(mov.data.total) || 0;
                movementType = "بيع";
                movementId = mov.data.invoiceNumber || mov.data.id;
                notes = mov.data.notes || "";
                summary.totalSales += debit;
                break;
            case "payment":
                credit = Number(mov.data.amount) || 0;
                movementType = "قبض";
                movementId = mov.data.id;
                notes = mov.data.notes || "";
                summary.totalPayments += credit;
                break;
            case "return":
                credit = Number(mov.data.total || mov.data.amount) || 0;
                movementType = "مرتجع بيع";
                movementId = mov.data.id;
                notes = mov.data.notes || "";
                summary.totalReturns += credit;
                break;
            case "bonus":
                credit = Number(mov.data.bonusAmount || mov.data.amount) || 0;
                const bonusRecordType = mov.data.type || 'bonus';
                if (bonusRecordType === 'discount') {
                    movementType = "خصم خاص";
                    const discountDate = mov.data.createdAt ? new Date(mov.data.createdAt).toLocaleDateString("ar-EG") : "";
                    notes = mov.data.notes || (discountDate ? `خصم خاص (${discountDate})` : "خصم خاص");
                } else {
                    movementType = "بونص";
                    const bonusDate = mov.data.createdAt ? new Date(mov.data.createdAt).toLocaleDateString("ar-EG") : "";
                    const periodStart = mov.data.periodStart ? new Date(mov.data.periodStart).toLocaleDateString("ar-EG") : "";
                    const periodEnd = mov.data.periodEnd ? new Date(mov.data.periodEnd).toLocaleDateString("ar-EG") : "";
                    const periodStr = periodStart && periodEnd ? ` | من ${periodStart} إلى ${periodEnd}` : "";
                    notes = `بونص ${mov.data.bonusPercentage || 0}%${bonusDate ? ` (تسجيل: ${bonusDate})` : ""}${periodStr}`;
                }
                movementId = mov.data.id;
                // البونص/الخصم تنزل من الرصيد لكن لا تُحسب ضمن إجمالي المدفوعات
                break;
        }

        runningBalance = runningBalance + debit - credit;

        rows.push({
            date: mov.date.toLocaleDateString("ar-EG"),
            movement: movementType,
            debit,
            credit,
            balance: runningBalance,
            movementId,
            notes,
        });
    });

    summary.totalDebt = runningBalance;

    return {
        customer,
        dateFrom,
        dateTo,
        rows,
        summary,
        openingBalance: openingBalance,
        closingBalance: runningBalance,
    };
}

/**
 * Export account statement to Excel
 */
export async function exportAccountStatement(
    customerId: string,
    dateFrom: Date,
    dateTo: Date,
    companyName: string = "شركة لونج تايم للأدوات الكهربائية"
): Promise<boolean> {
    const data = await generateAccountStatement(customerId, dateFrom, dateTo);
    if (!data) return false;

    try {
        const workbook = XLSX.utils.book_new();

        // Create worksheet data
        const wsData: any[][] = [];

        // Header rows
        wsData.push([companyName]);
        wsData.push([`كشف حساب السيد / ${data.customer.name}`]);
        wsData.push([
            data.closingBalance,
            "تاريخ اليوم",
            `بداية من: ${dateFrom.toLocaleDateString("ar-EG")} إلى ${dateTo.toLocaleDateString("ar-EG")}`,
        ]);
        wsData.push([]); // Empty row

        // Table headers
        wsData.push([
            "ملاحظات",
            "رقم الحركة",
            "الرصيد",
            "له / دائن",
            "عليه / مدين",
            "الحركة",
            "التاريخ",
            "م",
        ]);

        // Data rows
        data.rows.forEach((row, index) => {
            wsData.push([
                row.notes,
                row.movementId,
                row.balance,
                row.credit || "",
                row.debit || "",
                row.movement,
                row.date,
                index + 1,
            ]);
        });

        // Empty row
        wsData.push([]);

        // Summary section
        wsData.push(["ملخص"]);
        wsData.push([]);
        wsData.push([data.summary.totalSales, "", "", "", "", "", "بيع"]);
        wsData.push([data.summary.totalReturns, "", "", "", "", "", "مرتجع بيع"]);
        wsData.push([data.summary.totalPayments, "", "", "", "", "", "قبض"]);
        wsData.push([data.summary.totalDebt, "", "", "", "", "", "الديون"]);

        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(wsData);

        // Set column widths
        worksheet["!cols"] = [
            { wch: 25 }, // ملاحظات
            { wch: 15 }, // رقم الحركة
            { wch: 12 }, // الرصيد
            { wch: 12 }, // له / دائن
            { wch: 12 }, // عليه / مدين
            { wch: 12 }, // الحركة
            { wch: 12 }, // التاريخ
            { wch: 5 }, // م
        ];

        // Merge cells for headers
        worksheet["!merges"] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Company name
            { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }, // Customer name
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, "كشف الحساب");

        // Generate filename
        const filename = `كشف_حساب_${data.customer.name}_${new Date().toLocaleDateString("ar-EG").replace(/\//g, "-")}.xlsx`;

        // Save file
        XLSX.writeFile(workbook, filename);

        toast.success(`تم تصدير كشف الحساب بنجاح`);
        return true;
    } catch (error) {
        console.error("Export error:", error);
        toast.error("حدث خطأ أثناء التصدير");
        return false;
    }
}

/**
 * Export invoice to Excel
 */
export async function exportInvoiceToExcel(
    invoice: Invoice,
    companyName: string = "لونج تايم للصناعات الكهربائية",
    companyWebsite: string = "longtimelt.com"
): Promise<boolean> {
    try {
        const workbook = XLSX.utils.book_new();
        const wsData: any[][] = [];

        // Header
        wsData.push([companyName]);
        wsData.push([]);
        wsData.push([]);
        wsData.push(["فاتورة الى:"]);
        wsData.push([
            invoice.createdAt.slice(0, 10),
            invoice.invoiceNumber || invoice.id,
            invoice.customerName,
            "الساده/",
        ]);
        wsData.push([]);
        wsData.push([]);
        wsData.push([]);
        wsData.push(["الملاحظات"]);

        // Table headers
        wsData.push([
            "العدد في الكرتونة",
            "الإجمالى",
            "الفئة",
            "الكمية",
            "اســــم الـــصـــنــــف",
            "م",
        ]);
        wsData.push(["الوحده", "العدد", "كود الصنف"]);
        wsData.push([]);

        // Items
        invoice.items.forEach((item, index) => {
            wsData.push([
                item.unitsPerCarton || "",
                item.total,
                item.price,
                item.quantity,
                item.productName,
                index + 1,
            ]);
            wsData.push([item.unitName, "", item.productId]);
        });

        wsData.push([]);

        // Totals
        const subtotal = invoice.subtotal;
        const additions = 0; // If you have additions, calculate here
        const afterAdditions = subtotal + additions;
        const discount = invoice.discount;
        const afterDiscount = afterAdditions - discount;
        const previousBalance = 0; // Get from customer if needed
        const currentBalance = afterDiscount + previousBalance;

        wsData.push([subtotal, "الاجمالي", companyWebsite]);
        wsData.push([additions || "-", "اضافة"]);
        wsData.push([additions ? afterAdditions : "-", "الاجمالي بعد الاضافة"]);
        wsData.push([discount || "-", "خصم خاص"]);
        wsData.push([discount ? afterDiscount : subtotal, "بعد الخصم"]);
        wsData.push([previousBalance, "الرصيد السابق"]);
        wsData.push([currentBalance, "الرصيد الحالي"]);

        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(wsData);

        // Set column widths
        worksheet["!cols"] = [
            { wch: 15 },
            { wch: 12 },
            { wch: 10 },
            { wch: 10 },
            { wch: 30 },
            { wch: 5 },
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, "فاتورة");

        // Generate filename
        const filename = `فاتورة_${invoice.invoiceNumber || invoice.id}_${invoice.customerName || "عميل"}.xlsx`;

        // Save file
        XLSX.writeFile(workbook, filename);

        toast.success(`تم تصدير الفاتورة بنجاح`);
        return true;
    } catch (error) {
        console.error("Export error:", error);
        toast.error("حدث خطأ أثناء التصدير");
        return false;
    }
}

export default {
    generateAccountStatement,
    exportAccountStatement,
    exportInvoiceToExcel,
};

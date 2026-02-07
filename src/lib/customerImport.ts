/**
 * Customer Import Utility
 * استيراد العملاء من Excel مع أرصدتهم السابقة
 */

import * as XLSX from "xlsx";
import { toast } from "sonner";
import { db, Customer, SalesRep } from "@/shared/lib/indexedDB";

export interface CustomerImportRow {
    name: string;
    phone: string;
    address?: string;
    previousStatement?: number; // الرصيد السابق
    creditLimit?: number;
    salesRepName?: string; // اسم المندوب
    notes?: string;
}

export interface ImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
}

/**
 * Download sample Excel template for customer import
 */
export function downloadCustomerImportTemplate(): void {
    const sampleData = [
        {
            "اسم العميل": "أحمد محمد",
            "رقم الهاتف": "01012345678",
            "العنوان": "القاهرة - مدينة نصر",
            "الرصيد السابق": 5000,
            "حد الائتمان": 10000,
            "المندوب": "صلاح",
            "ملاحظات": "عميل قديم",
        },
        {
            "اسم العميل": "محمود علي",
            "رقم الهاتف": "01098765432",
            "العنوان": "الجيزة - الهرم",
            "الرصيد السابق": 2500,
            "حد الائتمان": 5000,
            "المندوب": "عثمان",
            "ملاحظات": "",
        },
        {
            "اسم العميل": "سمير حسن",
            "رقم الهاتف": "01122334455",
            "العنوان": "الإسكندرية",
            "الرصيد السابق": 0,
            "حد الائتمان": 3000,
            "المندوب": "",
            "ملاحظات": "عميل جديد",
        },
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);

    // Set column widths
    worksheet["!cols"] = [
        { wch: 20 }, // اسم العميل
        { wch: 15 }, // رقم الهاتف
        { wch: 25 }, // العنوان
        { wch: 15 }, // الرصيد السابق
        { wch: 15 }, // حد الائتمان
        { wch: 15 }, // المندوب
        { wch: 25 }, // ملاحظات
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "العملاء");

    // Instructions sheet
    const instructions = [
        { ملاحظة: "الحقول المطلوبة: اسم العميل، رقم الهاتف" },
        { ملاحظة: "الرصيد السابق: المبلغ المستحق على العميل قبل الاستيراد" },
        { ملاحظة: "المندوب: اكتب اسم المندوب كما هو مسجل في النظام" },
        { ملاحظة: "سيتم تخطي العملاء برقم هاتف موجود مسبقاً" },
    ];
    const instructionSheet = XLSX.utils.json_to_sheet(instructions);
    instructionSheet["!cols"] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, instructionSheet, "تعليمات");

    XLSX.writeFile(workbook, "نموذج_استيراد_العملاء.xlsx");
    toast.success("تم تحميل نموذج الاستيراد");
}

/**
 * Import customers from Excel file
 */
export async function importCustomersFromExcel(
    file: File
): Promise<ImportResult> {
    const result: ImportResult = {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [],
    };

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

        if (rows.length === 0) {
            result.errors.push("الملف فارغ أو لا يحتوي على بيانات");
            return result;
        }

        // Load existing customers and sales reps
        const existingCustomers = await db.getAll<Customer>("customers");
        const salesReps = await db.getAll<SalesRep>("salesReps");

        const existingPhones = new Set(
            existingCustomers.map((c) => c.phone?.replace(/\D/g, ""))
        );

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number (1-indexed + header)

            try {
                // Map Arabic column names
                const name = row["اسم العميل"] || row["name"] || row["الاسم"];
                const phone = String(row["رقم الهاتف"] || row["phone"] || row["الهاتف"] || "");
                const address = row["العنوان"] || row["address"] || "";
                const previousStatement = parseFloat(row["الرصيد السابق"] || row["previousStatement"] || "0") || 0;
                const creditLimit = parseFloat(row["حد الائتمان"] || row["creditLimit"] || "0") || 0;
                const salesRepName = row["المندوب"] || row["salesRepName"] || "";
                const notes = row["ملاحظات"] || row["notes"] || "";

                // Validate required fields
                if (!name) {
                    result.errors.push(`صف ${rowNum}: اسم العميل مطلوب`);
                    result.skipped++;
                    continue;
                }

                // Check for duplicate phone
                const cleanPhone = phone.replace(/\D/g, "");
                if (cleanPhone && existingPhones.has(cleanPhone)) {
                    result.errors.push(`صف ${rowNum}: رقم الهاتف ${phone} موجود مسبقاً`);
                    result.skipped++;
                    continue;
                }

                // Find sales rep by name
                let salesRepId: string | undefined;
                if (salesRepName) {
                    const rep = salesReps.find(
                        (r) => r.name.toLowerCase() === salesRepName.toLowerCase()
                    );
                    if (rep) {
                        salesRepId = rep.id;
                    }
                }

                // Create customer
                const customer: Customer = {
                    id: `imported_${Date.now()}_${i}`,
                    name: String(name),
                    phone: cleanPhone,
                    address: String(address),
                    previousStatement,
                    currentBalance: previousStatement, // الرصيد الحالي = الرصيد السابق
                    creditLimit,
                    salesRepId,
                    notes: String(notes),
                    bonusBalance: 0,
                    loyaltyPoints: 0,
                    createdAt: new Date().toISOString(),
                };

                await db.add("customers", customer);
                existingPhones.add(cleanPhone);
                result.imported++;
            } catch (error) {
                result.errors.push(`صف ${rowNum}: ${(error as Error).message}`);
                result.skipped++;
            }
        }

        result.success = result.imported > 0;
        return result;
    } catch (error) {
        result.errors.push(`خطأ في قراءة الملف: ${(error as Error).message}`);
        return result;
    }
}

export default {
    downloadCustomerImportTemplate,
    importCustomersFromExcel,
};

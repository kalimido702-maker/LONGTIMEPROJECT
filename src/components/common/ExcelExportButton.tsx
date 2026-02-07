/**
 * ExcelExportButton - زر تصدير البيانات إلى Excel
 * مكون قابل لإعادة الاستخدام لجميع القوائم
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export interface ExcelColumn {
    header: string; // العنوان في Excel
    key: string; // المفتاح في البيانات
    width?: number; // عرض العمود (اختياري)
    formatter?: (value: any, row: any) => any; // تنسيق القيمة (اختياري)
}

export interface ExcelExportButtonProps {
    data: any[];
    columns: ExcelColumn[];
    filename: string;
    sheetName?: string;
    buttonText?: string;
    buttonVariant?: "default" | "outline" | "ghost" | "secondary";
    buttonSize?: "default" | "sm" | "lg" | "icon";
    disabled?: boolean;
    className?: string;
}

export function ExcelExportButton({
    data,
    columns,
    filename,
    sheetName = "Sheet1",
    buttonText = "تصدير Excel",
    buttonVariant = "outline",
    buttonSize = "default",
    disabled = false,
    className = "",
}: ExcelExportButtonProps) {
    const handleExport = async () => {
        if (data.length === 0) {
            toast.warning("لا توجد بيانات للتصدير");
            return;
        }

        try {
            // تحويل البيانات إلى صفوف Excel
            const excelData = data.map((row) => {
                const excelRow: Record<string, any> = {};
                columns.forEach((col) => {
                    let value = row[col.key];
                    // تطبيق المنسق إذا موجود
                    if (col.formatter) {
                        value = col.formatter(value, row);
                    }
                    excelRow[col.header] = value ?? "";
                });
                return excelRow;
            });

            // إنشاء Workbook و Worksheet
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // تحديد عرض الأعمدة
            const columnWidths = columns.map((col) => ({
                wch: col.width || 15,
            }));
            worksheet["!cols"] = columnWidths;

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

            // تصدير الملف
            const exportFilename = filename.endsWith(".xlsx")
                ? filename
                : `${filename}.xlsx`;
            XLSX.writeFile(workbook, exportFilename);

            toast.success(`تم تصدير ${data.length} سجل بنجاح`);
        } catch (error) {
            console.error("Export error:", error);
            toast.error("حدث خطأ أثناء التصدير");
        }
    };

    return (
        <Button
            variant={buttonVariant}
            size={buttonSize}
            onClick={handleExport}
            disabled={disabled || data.length === 0}
            className={className}
        >
            <Download className="h-4 w-4 ml-2" />
            {buttonText}
        </Button>
    );
}

// دالة مساعدة لتصدير البيانات مباشرة بدون component
export async function exportToExcel(
    data: any[],
    columns: ExcelColumn[],
    filename: string,
    sheetName: string = "Sheet1"
) {
    if (data.length === 0) {
        toast.warning("لا توجد بيانات للتصدير");
        return;
    }

    try {
        const excelData = data.map((row) => {
            const excelRow: Record<string, any> = {};
            columns.forEach((col) => {
                let value = row[col.key];
                if (col.formatter) {
                    value = col.formatter(value, row);
                }
                excelRow[col.header] = value ?? "";
            });
            return excelRow;
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const columnWidths = columns.map((col) => ({
            wch: col.width || 15,
        }));
        worksheet["!cols"] = columnWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const exportFilename = filename.endsWith(".xlsx")
            ? filename
            : `${filename}.xlsx`;
        XLSX.writeFile(workbook, exportFilename);

        toast.success(`تم تصدير ${data.length} سجل بنجاح`);
        return true;
    } catch (error) {
        console.error("Export error:", error);
        toast.error("حدث خطأ أثناء التصدير");
        return false;
    }
}

export default ExcelExportButton;

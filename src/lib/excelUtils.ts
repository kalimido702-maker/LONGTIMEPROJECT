/**
 * Excel Utils - دوال مساعدة لتصدير واستيراد Excel
 */

import * as XLSX from "xlsx";
import { Product, Unit, PriceType } from "@/shared/lib/indexedDB";

/**
 * تصدير المنتجات إلى Excel (مع دعم الوحدات المتعددة بصفوف منفصلة)
 */
export const exportProductsToExcel = async (
  products: Product[],
  units: Unit[],
  priceTypes: PriceType[],
  productUnitsGetter: (productId: string) => Promise<any[]> // دالة للحصول على ProductUnits
): Promise<void> => {
  const data: any[] = [];
  const defaultPriceType = priceTypes.find((pt) => pt.isDefault);

  for (const product of products) {
    const unit = units.find((u) => u.id === product.unitId);
    const priceTypeId = product.defaultPriceTypeId || defaultPriceType?.id;
    const displayPrice =
      priceTypeId && product.prices?.[priceTypeId]
        ? product.prices[priceTypeId]
        : product.price || 0;

    // صف المنتج الأساسي
    data.push({
      ID: product.id,
      "نوع الصف": "منتج",
      "الاسم بالعربي": product.nameAr || "",
      "الاسم بالإنجليزي": product.name || "",
      القسم: product.category || "",
      الكمية: product.stock || 0,
      "سعر التكلفة": product.costPrice || 0,
      "سعر البيع": displayPrice,
      الوحدة: unit?.name || "",
      "معرف الوحدة": product.unitId || "",
      "معامل التحويل": 1, // الوحدة الأساسية
      الباركود: product.barcode || "",
      "الحد الأدنى": product.minStock || 0,
      "تاريخ الصلاحية": product.expiryDate || "",
      صورة: product.imageUrl ? "نعم" : "لا",
    });

    // صفوف الوحدات المتعددة
    const productUnits = await productUnitsGetter(product.id);
    for (const productUnit of productUnits) {
      const unitPrice = productUnit.prices?.[priceTypeId] || 0;

      data.push({
        ID: product.id,
        "نوع الصف": "وحدة",
        "الاسم بالعربي": product.nameAr || "",
        "الاسم بالإنجليزي": product.name || "",
        القسم: product.category || "",
        الكمية: "", // فارغ للوحدات
        "سعر التكلفة": productUnit.costPrice || 0,
        "سعر البيع": unitPrice,
        الوحدة: productUnit.unitName || "",
        "معرف الوحدة": productUnit.unitId || "",
        "معامل التحويل": productUnit.conversionFactor,
        الباركود: productUnit.barcode || "",
        "الحد الأدنى": "", // فارغ للوحدات
        "تاريخ الصلاحية": "", // فارغ للوحدات
        صورة: "", // فارغ للوحدات
      });
    }
  }

  // إنشاء worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);

  // تعيين عرض الأعمدة
  const columnWidths = [
    { wch: 25 }, // ID
    { wch: 10 }, // نوع الصف
    { wch: 20 }, // الاسم بالعربي
    { wch: 20 }, // الاسم بالإنجليزي
    { wch: 15 }, // القسم
    { wch: 10 }, // الكمية
    { wch: 12 }, // سعر التكلفة
    { wch: 12 }, // سعر البيع
    { wch: 15 }, // الوحدة
    { wch: 25 }, // معرف الوحدة
    { wch: 12 }, // معامل التحويل
    { wch: 15 }, // الباركود
    { wch: 12 }, // الحد الأدنى
    { wch: 15 }, // تاريخ الصلاحية
    { wch: 10 }, // صورة
  ];
  worksheet["!cols"] = columnWidths;

  // إنشاء workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "المنتجات");

  // تصدير الملف
  const filename = `المنتجات_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, filename);
};

/**
 * استيراد المنتجات من Excel (مع دعم الوحدات المتعددة بصفوف منفصلة)
 */
export const importProductsFromExcel = async (
  file: File
): Promise<{
  data: any[];
  errors: string[];
  updates: number;
  inserts: number;
  productUnitsData: Map<string, any[]>; // وحدات لكل منتج
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          reject(new Error("فشل قراءة الملف"));
          return;
        }

        // قراءة الملف
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // تحويل إلى JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        }) as any[][];

        if (jsonData.length < 2) {
          reject(new Error("الملف فارغ أو غير صحيح"));
          return;
        }

        // تخطي صف العناوين
        const dataRows = jsonData.slice(1);
        const errors: string[] = [];
        const validData: any[] = [];
        const productUnitsData = new Map<string, any[]>();
        let updates = 0;
        let inserts = 0;

        // Group rows by Product ID + Row Type
        dataRows.forEach((row, index) => {
          // تخطي الصفوف الفارغة
          if (!row || row.length === 0 || !row[2]) {
            // العمود 2 هو الاسم بالعربي
            return;
          }

          try {
            const productId = row[0]?.toString().trim();
            const rowType = row[1]?.toString().trim() || "منتج"; // نوع الصف

            if (rowType === "منتج") {
              // صف منتج
              const rowData = {
                id: productId || undefined,
                nameAr: row[2]?.toString().trim() || "",
                name: row[3]?.toString().trim() || "",
                category: row[4]?.toString().trim() || "",
                stock: parseFloat(row[5]) || 0,
                costPrice: parseFloat(row[6]) || 0,
                price: parseFloat(row[7]) || 0,
                unitName: row[8]?.toString().trim() || "",
                unitId: row[9]?.toString().trim() || "",
                barcode: row[11]?.toString().trim() || "",
                minStock: parseInt(row[12]) || 10,
                expiryDate: row[13]?.toString().trim() || "",
                hasImage: row[14]?.toString().trim() === "نعم",
                isUpdate: !!productId,
              };

              // التحقق من الحقول المطلوبة
              if (!rowData.nameAr) {
                errors.push(`الصف ${index + 2}: الاسم بالعربي مطلوب`);
                return;
              }

              if (rowData.isUpdate) {
                updates++;
              } else {
                inserts++;
              }

              validData.push(rowData);
            } else if (rowType === "وحدة") {
              // صف وحدة متعددة
              if (!productId) {
                errors.push(`الصف ${index + 2}: يجب أن يكون للوحدة ID منتج`);
                return;
              }

              const unitData = {
                unitName: row[8]?.toString().trim() || "",
                unitId: row[9]?.toString().trim() || "",
                conversionFactor: parseFloat(row[10]) || 1,
                barcode: row[11]?.toString().trim() || "",
                costPrice: parseFloat(row[6]) || 0,
                price: parseFloat(row[7]) || 0,
              };

              if (!unitData.unitId) {
                errors.push(`الصف ${index + 2}: يجب تحديد معرف الوحدة`);
                return;
              }

              // إض افة الوحدة لقائمة وحدات المنتج
              if (!productUnitsData.has(productId)) {
                productUnitsData.set(productId, []);
              }
              productUnitsData.get(productId)!.push(unitData);
            }
          } catch (error) {
            errors.push(`الصف ${index + 2}: خطأ في القراءة`);
          }
        });

        resolve({
          data: validData,
          errors,
          updates,
          inserts,
          productUnitsData,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("خطأ في قراءة الملف"));
    };

    reader.readAsBinaryString(file);
  });
};

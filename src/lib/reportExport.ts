import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// تحميل خط عربي (Amiri) - يجب أن يكون مضمناً في المشروع
// يمكن استخدام خط Cairo أو أي خط عربي آخر
const arabicFont = "Arial"; // سيتم استبداله بخط عربي مناسب

interface ExportColumn {
  header: string;
  dataKey: string;
  width?: number;
}

interface ExportOptions {
  title: string;
  subtitle?: string;
  fileName: string;
  data: any[];
  columns: ExportColumn[];
  summary?: { label: string; value: string | number }[];
  orientation?: "portrait" | "landscape";
}

/**
 * تصدير تقرير بصيغة PDF مع جداول منظمة
 */
export const exportToPDF = (options: ExportOptions) => {
  const {
    title,
    subtitle,
    fileName,
    data,
    columns,
    summary,
    orientation = "portrait",
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  // إعدادات الخط العربي
  doc.setFont("helvetica");
  doc.setR2L(true);

  let yPosition = 15;

  // العنوان الرئيسي
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, doc.internal.pageSize.width / 2, yPosition, {
    align: "center",
  });
  yPosition += 10;

  // العنوان الفرعي
  if (subtitle) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, doc.internal.pageSize.width / 2, yPosition, {
      align: "center",
    });
    yPosition += 10;
  }

  // التاريخ والوقت
  const now = new Date().toLocaleString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(10);
  doc.text(
    `تاريخ الطباعة: ${now}`,
    doc.internal.pageSize.width - 15,
    yPosition,
    { align: "right" }
  );
  yPosition += 5;

  // الجدول
  autoTable(doc, {
    startY: yPosition,
    head: [columns.map((col) => col.header)],
    body: data.map((row) =>
      columns.map((col) => {
        const value = row[col.dataKey];
        // تنسيق الأرقام والعملات
        if (typeof value === "number") {
          return value.toLocaleString("ar-EG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
        return value || "-";
      })
    ),
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3,
      halign: "center",
      valign: "middle",
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: columns.reduce((acc, col, index) => {
      if (col.width) {
        acc[index] = { cellWidth: col.width };
      }
      return acc;
    }, {} as any),
    margin: { top: 10, right: 15, bottom: 10, left: 15 },
    didDrawPage: (data) => {
      // رقم الصفحة
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `صفحة ${data.pageNumber} من ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: "center" }
      );
    },
  });

  // الملخص
  if (summary && summary.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("الملخص:", doc.internal.pageSize.width - 15, finalY, {
      align: "right",
    });

    let summaryY = finalY + 7;
    summary.forEach((item) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${item.label}:`, doc.internal.pageSize.width - 15, summaryY, {
        align: "right",
      });
      doc.setFont("helvetica", "bold");
      doc.text(
        typeof item.value === "number"
          ? item.value.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) +
              " جنيه"
          : String(item.value),
        doc.internal.pageSize.width - 80,
        summaryY,
        { align: "right" }
      );
      summaryY += 7;
    });
  }

  // حفظ الملف
  doc.save(`${fileName}.pdf`);
};

/**
 * تصدير تقرير بصيغة Excel
 */
export const exportToExcel = (options: ExportOptions) => {
  const { title, fileName, data, columns, summary } = options;

  // تحويل البيانات إلى صف مناسب لـ Excel
  const excelData = data.map((row) => {
    const newRow: any = {};
    columns.forEach((col) => {
      newRow[col.header] = row[col.dataKey];
    });
    return newRow;
  });

  // إنشاء worksheet
  const ws = XLSX.utils.json_to_sheet(excelData);

  // إضافة عنوان في أول صف
  XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: "A1" });

  // إضافة التاريخ
  const now = new Date().toLocaleString("ar-EG");
  XLSX.utils.sheet_add_aoa(ws, [[`تاريخ الطباعة: ${now}`]], { origin: "A2" });

  // إضافة صف فارغ
  XLSX.utils.sheet_add_aoa(ws, [[]], { origin: "A3" });

  // إضافة الملخص إذا كان موجوداً
  if (summary && summary.length > 0) {
    const summaryStartRow = data.length + 5;
    XLSX.utils.sheet_add_aoa(ws, [["الملخص"]], {
      origin: `A${summaryStartRow}`,
    });

    summary.forEach((item, index) => {
      const row = summaryStartRow + index + 1;
      XLSX.utils.sheet_add_aoa(
        ws,
        [
          [
            item.label,
            typeof item.value === "number" ? item.value.toFixed(2) : item.value,
          ],
        ],
        { origin: `A${row}` }
      );
    });
  }

  // تنسيق الأعمدة
  const colWidths = columns.map((col) => ({
    wch: Math.max(col.header.length, 15),
  }));
  ws["!cols"] = colWidths;

  // إنشاء workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "التقرير");

  // حفظ الملف
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

/**
 * طباعة التقرير مباشرة
 */
export const printReport = (options: ExportOptions) => {
  const { title, subtitle, data, columns, summary } = options;

  // إنشاء نافذة جديدة للطباعة
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("الرجاء السماح بفتح النوافذ المنبثقة للطباعة");
    return;
  }

  const now = new Date().toLocaleString("ar-EG");

  // HTML للطباعة
  const html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
        }
        
        body {
          font-family: 'Arial', sans-serif;
          direction: rtl;
          padding: 20px;
        }
        
        h1 {
          text-align: center;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        h2 {
          text-align: center;
          color: #7f8c8d;
          font-size: 14px;
          margin-bottom: 20px;
        }
        
        .meta {
          text-align: center;
          color: #95a5a6;
          font-size: 12px;
          margin-bottom: 30px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        
        th, td {
          border: 1px solid #bdc3c7;
          padding: 10px;
          text-align: center;
        }
        
        th {
          background-color: #34495e;
          color: white;
          font-weight: bold;
        }
        
        tr:nth-child(even) {
          background-color: #ecf0f1;
        }
        
        .summary {
          margin-top: 30px;
          padding: 20px;
          background-color: #f8f9fa;
          border: 2px solid #dee2e6;
          border-radius: 8px;
        }
        
        .summary h3 {
          margin-top: 0;
          color: #2c3e50;
        }
        
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #dee2e6;
        }
        
        .summary-row:last-child {
          border-bottom: none;
          font-weight: bold;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${subtitle ? `<h2>${subtitle}</h2>` : ""}
      <div class="meta">تاريخ الطباعة: ${now}</div>
      
      <table>
        <thead>
          <tr>
            ${columns.map((col) => `<th>${col.header}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
            <tr>
              ${columns
                .map((col) => {
                  const value = row[col.dataKey];
                  const formatted =
                    typeof value === "number"
                      ? value.toLocaleString("ar-EG", {
                          minimumFractionDigits: 2,
                        })
                      : value || "-";
                  return `<td>${formatted}</td>`;
                })
                .join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      
      ${
        summary && summary.length > 0
          ? `
        <div class="summary">
          <h3>الملخص</h3>
          ${summary
            .map(
              (item) => `
            <div class="summary-row">
              <span>${item.label}:</span>
              <strong>
                ${
                  typeof item.value === "number"
                    ? item.value.toLocaleString("ar-EG", {
                        minimumFractionDigits: 2,
                      }) + " جنيه"
                    : item.value
                }
              </strong>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
      
      <script>
        window.onload = function() {
          window.print();
          // إغلاق النافذة بعد الطباعة
          setTimeout(() => window.close(), 100);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Report Print Service
 * خدمة طباعة التقارير بتنسيق لونج تايم للمصناعات الكهربائية
 */

interface ReportPrintOptions {
  title: string;
  subtitle?: string;
  dateRange?: { from: string; to: string };
  printDate?: string;
  headerInfo?: { label: string; value: string }[];
  columns: { header: string; dataKey: string; align?: "right" | "center" | "left" }[];
  data: any[];
  summary?: { label: string; value: string | number }[];
  totalRow?: { label: string; value: string | number };
}

const COMPANY_HEADER = "لونج تايم للمصناعات الكهربائية - التقارير الداخلية";

function formatValue(value: any): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString("en-US");
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

function getReportCSS(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    
    @page {
      size: A4;
      margin: 12mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      direction: rtl;
      background: #fff;
      color: #000;
      font-size: 11px;
      padding: 8mm;
    }
    
    .report-header {
      text-align: center;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid #333;
    }
    
    .company-name {
      font-size: 16px;
      font-weight: 700;
      color: #000;
      margin-bottom: 4px;
    }
    
    .report-title {
      font-size: 14px;
      font-weight: 700;
      background: #e0e0e0;
      padding: 6px 16px;
      display: inline-block;
      margin: 6px auto;
      border: 1px solid #999;
    }
    
    .report-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 8px 0;
      font-size: 11px;
      flex-wrap: wrap;
    }
    
    .meta-item {
      margin: 2px 8px;
    }

    .meta-center {
      text-align: center;
      font-size: 11px;
      margin: 4px 0;
    }
    
    .report-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 10px;
    }
    
    .report-table th {
      background: #d0d0d0;
      border: 1px solid #999;
      padding: 4px 6px;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
    }
    
    .report-table td {
      border: 1px solid #999;
      padding: 3px 6px;
      text-align: center;
    }
    
    .report-table tr:nth-child(even) {
      background: #f5f5f5;
    }
    
    .report-table td.text-right {
      text-align: right;
    }
    
    .report-table td.text-left {
      text-align: left;
    }
    
    .total-row {
      margin-top: 8px;
      display: flex;
      justify-content: flex-start;
      gap: 4px;
    }
    
    .total-row table {
      border-collapse: collapse;
    }
    
    .total-row td {
      border: 1px solid #999;
      padding: 4px 12px;
      font-weight: 700;
      font-size: 11px;
    }
    
    .summary-section {
      margin-top: 12px;
    }
    
    .summary-table {
      border-collapse: collapse;
    }
    
    .summary-table td {
      border: 1px solid #999;
      padding: 4px 12px;
      font-size: 11px;
    }
    
    .summary-table td:first-child {
      font-weight: 700;
      background: #e8e8e8;
    }
    
    @media print {
      body { padding: 0; }
    }
  `;
}

function generateReportHTML(options: ReportPrintOptions): string {
  const { title, subtitle, dateRange, printDate, headerInfo, columns, data, summary, totalRow } = options;

  const now = printDate || new Date().toLocaleString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Header info section
  let headerInfoHTML = "";
  if (headerInfo && headerInfo.length > 0) {
    headerInfoHTML = `
      <div class="report-meta">
        ${headerInfo.map(item => `<span class="meta-item"><strong>${item.label}:</strong> ${item.value}</span>`).join("")}
      </div>
    `;
  }

  // Date range
  let dateRangeHTML = "";
  if (dateRange) {
    dateRangeHTML = `<div class="meta-center">من ${dateRange.from} إلى ${dateRange.to} | تاريخ الطباعة: ${now}</div>`;
  } else if (subtitle) {
    dateRangeHTML = `<div class="meta-center">${subtitle}</div>`;
  }

  // Table
  const tableHTML = `
    <table class="report-table">
      <thead>
        <tr>
          ${columns.map(col => `<th>${col.header}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>
            ${columns.map(col => {
              const align = col.align || "center";
              return `<td class="text-${align}">${formatValue(row[col.dataKey])}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  // Total row
  let totalHTML = "";
  if (totalRow) {
    totalHTML = `
      <div class="total-row">
        <table>
          <tr>
            <td>${totalRow.label}</td>
            <td>${formatValue(totalRow.value)}</td>
          </tr>
        </table>
      </div>
    `;
  }

  // Summary section
  let summaryHTML = "";
  if (summary && summary.length > 0) {
    summaryHTML = `
      <div class="summary-section">
        <table class="summary-table">
          <tr><td colspan="2" style="text-align:center; font-weight:700; background:#d0d0d0;">الملخص</td></tr>
          ${summary.map(item => `
            <tr>
              <td>${item.label}</td>
              <td>${formatValue(item.value)}</td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>${getReportCSS()}</style>
    </head>
    <body>
      <div class="report-header">
        <div class="company-name">${COMPANY_HEADER}</div>
      </div>
      
      <div class="report-title">${title}</div>
      
      ${dateRangeHTML}
      ${headerInfoHTML}
      ${tableHTML}
      ${totalHTML}
      ${summaryHTML}
      
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 200);
        };
      </script>
    </body>
    </html>
  `;
}

function openPrintWindow(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("الرجاء السماح بفتح النوافذ المنبثقة للطباعة");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}

// ==========================================
// تقرير مديونية العملاء (#17)
// ==========================================
export interface DebtReportData {
  name: string;
  balance: number;
  supervisorName: string;
  salesRepName: string;
}

export function printCustomerDebtReport(
  data: DebtReportData[],
  options: {
    supervisorFilter?: string;
    totalDebt: number;
  }
): void {
  const html = generateReportHTML({
    title: "تقرير مديونية العملاء",
    headerInfo: [
      { label: "المشرف", value: options.supervisorFilter || "-------" },
      { label: "اجمالي المديونية", value: formatValue(options.totalDebt) },
      { label: "تاريخ الطباعة", value: new Date().toLocaleDateString("ar-EG") },
    ],
    columns: [
      { header: "اسم الحساب", dataKey: "name", align: "right" },
      { header: "الرصيد الحالي", dataKey: "balance" },
      { header: "المشرف", dataKey: "supervisorName" },
      { header: "المندوب", dataKey: "salesRepName" },
    ],
    data,
    totalRow: { label: "الإجمالي", value: options.totalDebt },
  });
  openPrintWindow(html);
}

// ==========================================
// تقرير عمليات القبض (#15)
// ==========================================
export interface CollectionReportData {
  customerName: string;
  amount: number;
  currentBalance: number;
  operationId: string;
  date: string;
  notes: string;
  supervisorName: string;
}

export function printCollectionReport(
  data: CollectionReportData[],
  options: {
    dateFrom: string;
    dateTo: string;
    totalOperations: number;
    totalAmount: number;
  }
): void {
  const html = generateReportHTML({
    title: "تقرير عمليات القبض",
    dateRange: { from: options.dateFrom, to: options.dateTo },
    columns: [
      { header: "اسم العميل", dataKey: "customerName", align: "right" },
      { header: "المبلغ", dataKey: "amount" },
      { header: "رصيد العميل الحالي", dataKey: "currentBalance" },
      { header: "رقم العملية", dataKey: "operationId" },
      { header: "التاريخ", dataKey: "date" },
      { header: "ملاحظات", dataKey: "notes" },
      { header: "المشرف", dataKey: "supervisorName" },
    ],
    data,
    summary: [
      { label: "إجمالي العمليات", value: options.totalOperations },
      { label: "إجمالي المبلغ", value: options.totalAmount },
    ],
  });
  openPrintWindow(html);
}

// ==========================================
// تقرير فواتير العملاء (#14)
// ==========================================
export interface CustomerInvoicesReportData {
  customerName: string;
  invoiceCount: number;
  invoiceValue: number;
  supervisorName: string;
}

export function printCustomerInvoicesReport(
  data: CustomerInvoicesReportData[],
  options: {
    dateFrom: string;
    dateTo: string;
    totalSales: number;
    totalCustomers: number;
  }
): void {
  const html = generateReportHTML({
    title: "فواتير العملاء",
    dateRange: { from: options.dateFrom, to: options.dateTo },
    columns: [
      { header: "اسم العميل", dataKey: "customerName", align: "right" },
      { header: "عدد الفواتير", dataKey: "invoiceCount" },
      { header: "قيمة الفوتير", dataKey: "invoiceValue" },
      { header: "المشرف", dataKey: "supervisorName" },
    ],
    data,
    summary: [
      { label: "إجمالي المبيعات", value: options.totalSales },
      { label: "عدد العملاء", value: options.totalCustomers },
    ],
  });
  openPrintWindow(html);
}

// ==========================================
// تقرير مدفوعات العملاء (#16)
// ==========================================
export interface CustomerPaymentsReportData {
  customerName: string;
  paymentCount: number;
  paymentValue: number;
  supervisorName: string;
}

export function printCustomerPaymentsReport(
  data: CustomerPaymentsReportData[],
  options: {
    dateFrom: string;
    dateTo: string;
    totalPayments: number;
    totalCustomers: number;
    totalOperations: number;
  }
): void {
  const html = generateReportHTML({
    title: "مدفوعات العملاء",
    dateRange: { from: options.dateFrom, to: options.dateTo },
    columns: [
      { header: "اسم العميل", dataKey: "customerName", align: "right" },
      { header: "عدد عمليات الدفع", dataKey: "paymentCount" },
      { header: "قيمة المدفوعات", dataKey: "paymentValue" },
      { header: "المشرف", dataKey: "supervisorName" },
    ],
    data,
    summary: [
      { label: "إجمالي المدفوعات", value: options.totalPayments },
      { label: "عدد العملاء", value: options.totalCustomers },
      { label: "عدد العمليات", value: options.totalOperations },
    ],
  });
  openPrintWindow(html);
}

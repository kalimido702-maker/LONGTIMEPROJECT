
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { generateAccountStatement, AccountStatementData } from "@/lib/accountStatementExport";

/**
 * Load logo as base64 (Reused from invoicePdfService principle)
 */
async function loadLogoBase64(): Promise<string | null> {
    try {
        const logoModule = await import("@/assets/images/longtime-logo.png");
        if (typeof logoModule.default === "string") {
            return logoModule.default;
        }
        return null;
    } catch (error) {
        console.error("Failed to load logo:", error);
        return null;
    }
}

/**
 * Generate QR Code
 */
async function generateQRCode(text: string = "https://longtimelt.com"): Promise<string> {
    try {
        return await QRCode.toDataURL(text);
    } catch (error) {
        console.error("Error generating QR code:", error);
        return "";
    }
}

/**
 * Format number in English locale
 */
const formatNum = (num: number, minDecimals = 0, maxDecimals = 2) => {
    return (num || 0).toLocaleString("en-US", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals
    });
};

function numberToArabicWords(num: number): string {
    // Simplified version - you may want to use a more complete library
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
    const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    const parts: string[] = [];
    let remaining = Math.floor(num);

    // Thousands
    if (remaining >= 1000) {
        const thousands = Math.floor(remaining / 1000);
        if (thousands === 1) {
            parts.push('ألف');
        } else if (thousands === 2) {
            parts.push('ألفان');
        } else if (thousands >= 3 && thousands <= 10) {
            parts.push(ones[thousands] + ' آلاف');
        } else {
            parts.push('ألف');
        }
        remaining %= 1000;
    }

    // Hundreds
    if (remaining >= 100) {
        parts.push(hundreds[Math.floor(remaining / 100)]);
        remaining %= 100;
    }

    // Tens and ones
    if (remaining >= 20) {
        const ten = Math.floor(remaining / 10);
        const one = remaining % 10;
        if (one > 0) {
            parts.push(ones[one] + ' و ' + tens[ten]);
        } else {
            parts.push(tens[ten]);
        }
    } else if (remaining >= 10) {
        parts.push(teens[remaining - 10]);
    } else if (remaining > 0) {
        parts.push(ones[remaining]);
    }

    let result = parts.join(' و ');
    if (!result) result = 'صفر';

    // Add decimal part if exists
    const decimalPart = Math.round((num % 1) * 100);
    if (decimalPart > 0) {
        result += ' جنيه مصري';
    } else {
        result += ' جنيه مصري';
    }

    return result;
}


/**
 * Generate HTML for Account Statement
 */
export async function generateStatementHTML(data: AccountStatementData): Promise<string> {
    const logoBase64 = await loadLogoBase64();

    const rowsHtml = data.rows.map((row, index) => {
        // Shorten long movement IDs (e.g., RET-1234567890 → RET-...7890)
        let displayId = row.movementId || '-';
        if (displayId.length > 12) {
            displayId = displayId.substring(0, 4) + '...' + displayId.slice(-4);
        }
        return `
        <tr>
            <td>${index + 1}</td>
            <td>${row.date}</td>
            <td>${row.movement}</td>
            <td>${row.debit > 0 ? Math.round(row.debit) : '-'}</td>
            <td>${row.credit > 0 ? Math.round(row.credit) : '-'}</td>
            <td>${Math.round(row.balance)}</td>
            <td>${displayId}</td>
            <td>${row.notes || '-'}</td>
        </tr>
    `;
    }).join("");

    const formatDate = (date: Date): string => {
        const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('ar-EG', options);
    };

    const formatShortDate = (date: Date): string => {
        return date.toLocaleDateString('en-GB');
    };

    const now = new Date();
    const printDateTime = `${formatShortDate(now)} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>كشف حساب ${data.customer.name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
        
        @page {
            size: A4;
            margin: 15mm;
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
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            position: relative;
            font-size: 12px;
        }
        
        .container {
            padding: 10mm 15mm;
        }
        
        /* Header */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }
        
        .logo-container {
            width: 100px;
        }
        
        .logo {
            width: 100%;
            height: auto;
        }
        
        .company-info {
            text-align: right;
            flex: 1;
            padding-right: 20px;
        }
        
        .company-name {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        
        .header-line::before {
            content: '';
            display: block;
            height: 2px;
        }

        .header-line {
            height: 2px;
            background: #000;
            width: 55%;
            margin-bottom: 20px;
            margin-top: 25px;
        }
        
        .report-title {
            font-size: 18px;
            font-weight: 700;
        }
        
        /* Customer Info Bar */
        .customer-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .opening-balance-box {
            border: 2px solid #000;
            padding: 8px 8px;
            font-size: 24px;
            font-weight: 700;
            min-width: 120px;
            text-align: center;
        }
        
        .period-info {
            text-align: right;
            font-size: 12px;
        }
        
        .period-label {
            font-weight: 600;
        }
        
        /* Table */
        .table-container {
            margin-bottom: 20px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        
        th {
            background: #c0c0c0;
            color: #000;
            padding: 8px 4px;
            text-align: center;
            border: 1px solid #000;
            font-weight: 600;
        }
        
        td {
            padding: 6px 4px;
            border: 1px solid #000;
            text-align: center;
            word-break: break-all;
            font-size: 11px;
        }
        
        tr:nth-child(even) {
            background: #fff;
        }
        
        tr:nth-child(odd) {
            background: #fff;
        }
        
        .balance-row td {
            font-weight: 600;
            border-top: 2px solid #000;
        }
        
        /* Summary Section */
        .summary-section {
            margin-top: 20px;
        }
        
        .summary-title {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 15px;
            text-align: right;
        }
        
        .summary-table {
            width: 100%;
            max-width: 400px;
            margin-right: 0;
            margin-left: auto;
            border-collapse: collapse;
        }
        
        .summary-table td {
            border: none;
            border-bottom: 1px solid #ccc;
            padding: 6px 10px;
            text-align: right;
        }
        
        .summary-table td:first-child {
            text-align: left;
            font-weight: 600;
        }
        
        .debt-row td {
            background: #c00000;
            color: #fff;
            border: 1px solid #000;
            font-weight: 700;
            font-size: 14px;
            padding: 6px 10px;
        }
        
        .debt-row td:first-child {
            text-align: center;
        }
        
        /* Footer Text */
        .footer-text {
            text-align: center;
            margin-top: 15px;
            font-size: 11px;
            font-weight: 600;
        }
        
        /* Page Footer */
        .page-footer {
            position: absolute;
            bottom: 10mm;
            left: 15mm;
            right: 15mm;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="company-info">
                <div class="company-name">شركة لونج تايم للصناعات الكهربائية</div>
                <div class="header-line"></div>
                <div class="report-title">كشف حساب السيد / ${data.customer.name}</div>
            </div>
            <div class="logo-container">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Logo">` : ''}
            </div>
        </div>

        <!-- Customer Info Bar -->
        <div class="customer-bar">
            <div class="period-info">
                <span class="period-label">بداية من: ${formatDate(data.dateFrom)} وحتى: ${formatShortDate(data.dateTo)}</span>
            </div>
            <div class="opening-balance-box">${Math.round(data.closingBalance)}</div>
        </div>

        <!-- Table -->
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%">م</th>
                        <th style="width: 12%">التاريخ</th>
                        <th style="width: 12%">الحركة</th>
                        <th style="width: 12%">عليه / مدين</th>
                        <th style="width: 12%">له / دائن</th>
                        <th style="width: 15%">الرصيد</th>
                        <th style="width: 15%">رقم الحركة</th>
                        <th style="width: 15%">ملاحظات</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr class="balance-row">
                        <td colspan="5" style="text-align: left; padding-left: 20px;">الرصيد</td>
                        <td>${Math.round(data.closingBalance)}</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
        
        <!-- Summary Section -->
        <div class="summary-section">
            <div class="summary-title">تقرير</div>
            <table class="summary-table">
                <tr>
                    <td style="text-align: right;">إجمالي المبيعات</td>
                    <td>${Math.round(data.summary.totalSales)}</td>
                </tr>
                <tr>
                    <td style="text-align: right;">إجمالي المرتجعات</td>
                    <td>${Math.round(data.summary.totalReturns)}</td>
                </tr>
                <tr>
                    <td style="text-align: right;">إجمالي المدفوعات</td>
                    <td>${Math.round(data.summary.totalPayments)}</td>
                </tr>
                <tr class="debt-row">
                    <td style="text-align: right; padding-bottom: 10px;">الديون</td>
                    <td style="padding-bottom: 10px;">${Math.round(data.closingBalance)}</td>
                </tr>
            </table>
        </div>

        <!-- Footer Text -->
        <div class="footer-text">
        </div>
    </div>

    <!-- Page Footer -->
    <div class="page-footer">
        <div>1 / 1</div>
        <div>${printDateTime}</div>
    </div>
</body>
</html>
    `;
}
/**
 * Generate PDF Blob
 */
export async function generateStatementPDF(customerId: string, from: Date, to: Date): Promise<Blob | null> {
    const data = await generateAccountStatement(customerId, from, to);
    if (!data) return null;

    const html = await generateStatementHTML(data);

    // Create temporary container
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.width = "210mm"; // A4 width
    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, {
            scale: 2, // High resolution
            useCORS: true,
            logging: false,
            windowWidth: 794, // A4 width in px at 96 DPI
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Calculate the height of the image in mm
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        // If content fits on one page, just add it
        if (imgHeight <= pdfHeight) {
            pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeight);
        } else {
            // Multi-page: split the content across pages
            let position = 0;
            let remainingHeight = imgHeight;
            let pageNumber = 0;

            while (remainingHeight > 0) {
                if (pageNumber > 0) {
                    pdf.addPage();
                }

                // Calculate how much of the source image to use for this page
                const pageHeightInSourcePx = (pdfHeight / imgHeight) * canvas.height;
                const sourceY = pageNumber * pageHeightInSourcePx;

                pdf.addImage(
                    imgData,
                    "JPEG",
                    0,
                    -position,
                    pdfWidth,
                    imgHeight
                );

                position += pdfHeight;
                remainingHeight -= pdfHeight;
                pageNumber++;

                // Safety limit to prevent infinite loops
                if (pageNumber > 20) break;
            }
        }

        return pdf.output("blob");
    } catch (error) {
        console.error("PDF Generation Error:", error);
        return null;
    } finally {
        document.body.removeChild(container);
    }
}

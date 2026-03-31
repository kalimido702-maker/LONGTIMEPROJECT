/**
 * Invoice Template Engine
 * محرك قوالب الفاتورة - يستخدم Handlebars لتحويل القالب HTML إلى فاتورة كاملة
 */

import Handlebars from "handlebars";
import type { InvoicePDFData, InvoiceItemData } from "@/services/invoicePdfService";

// ===== Handlebars Helpers =====

Handlebars.registerHelper("formatNumber", (num: any, decimals?: any) => {
  if (num === undefined || num === null || num === "") return "";
  const n = Number(num);
  if (isNaN(n) || !isFinite(n)) return "0";
  const maxDec = typeof decimals === "number" ? decimals : 2;
  const hasDecimals = n % 1 !== 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: hasDecimals ? Math.min(2, maxDec) : 0,
    maximumFractionDigits: hasDecimals ? maxDec : 0,
  });
});

Handlebars.registerHelper("add", (a: any, b: any) => Number(a) + Number(b));
Handlebars.registerHelper("subtract", (a: any, b: any) => Number(a) - Number(b));
Handlebars.registerHelper("multiply", (a: any, b: any) => Number(a) * Number(b));

Handlebars.registerHelper("eq", (a: any, b: any) => a == b);
Handlebars.registerHelper("gt", (a: any, b: any) => Number(a) > Number(b));
Handlebars.registerHelper("lt", (a: any, b: any) => Number(a) < Number(b));
Handlebars.registerHelper("and", (a: any, b: any) => a && b);
Handlebars.registerHelper("or", (a: any, b: any) => a || b);
Handlebars.registerHelper("not", (a: any) => !a);

Handlebars.registerHelper("ifCond", function (this: any, v1: any, operator: string, v2: any, options: any) {
  switch (operator) {
    case "==": return v1 == v2 ? options.fn(this) : options.inverse(this);
    case "===": return v1 === v2 ? options.fn(this) : options.inverse(this);
    case "!=": return v1 != v2 ? options.fn(this) : options.inverse(this);
    case ">": return Number(v1) > Number(v2) ? options.fn(this) : options.inverse(this);
    case "<": return Number(v1) < Number(v2) ? options.fn(this) : options.inverse(this);
    case ">=": return Number(v1) >= Number(v2) ? options.fn(this) : options.inverse(this);
    case "<=": return Number(v1) <= Number(v2) ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
  }
});

// ===== Template Compilation =====

export function compileInvoiceTemplate(templateHTML: string, data: InvoicePDFData & {
  logoBase64?: string | null;
  qrCodeBase64?: string | null;
}): string {
  const template = Handlebars.compile(templateHTML, { noEscape: true });

  // Prepare items with 1-based index
  const items = data.items.map((item, i) => ({
    ...item,
    _index: i + 1,
  }));

  const context = {
    ...data,
    items,
    itemCount: items.length,
  };

  return template(context);
}

// ===== Sample Data for Preview =====

export function getSampleInvoiceData(): InvoicePDFData & {
  logoBase64: string | null;
  qrCodeBase64: string | null;
} {
  const sampleItems: (InvoiceItemData & { _index: number })[] = [
    { productName: "مفتاح كهربائي ثنائي", productCode: "SW-001", quantity: 10, price: 25, total: 250, unitsPerCarton: 50, _index: 1 },
    { productName: "فيشة ثلاثية دولي", productCode: "PL-003", quantity: 5, price: 40, total: 200, unitsPerCarton: 30, _index: 2 },
    { productName: "كابل كهربائي 2.5مم", productCode: "CB-025", quantity: 3, price: 150, total: 450, unitsPerCarton: 10, _index: 3 },
    { productName: "لمبة LED 12 وات", productCode: "LED-12", quantity: 20, price: 35, total: 700, unitsPerCarton: 24, _index: 4 },
    { productName: "بريزة مزدوجة أرضية", productCode: "SK-002", quantity: 8, price: 55, total: 440, unitsPerCarton: 20, _index: 5 },
  ];

  return {
    id: "sample-1",
    invoiceNumber: "INV-2024-0042",
    date: new Date().toLocaleDateString("ar-EG"),
    customerName: "شركة النور للمقاولات",
    customerAddress: "شارع التحرير، القاهرة",
    salesRepName: "أحمد محمد",
    items: sampleItems,
    subtotal: 2040,
    discount: 40,
    total: 2000,
    previousBalance: 1500,
    currentBalance: 3500,
    notes: "التسليم خلال 3 أيام عمل",
    isReturn: false,
    logoBase64: null,
    qrCodeBase64: null,
  };
}

// ===== Available Variables Reference =====

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
  category: "invoice" | "customer" | "items" | "totals" | "meta" | "helpers";
}

export function getAvailableVariables(): TemplateVariable[] {
  return [
    // Invoice
    { name: "{{invoiceNumber}}", description: "رقم الفاتورة", example: "INV-2024-0042", category: "invoice" },
    { name: "{{date}}", description: "تاريخ الفاتورة", example: "٢٥/٣/٢٠٢٦", category: "invoice" },
    { name: "{{isReturn}}", description: "هل هي فاتورة مرتجع؟", example: "true/false", category: "invoice" },
    { name: "{{notes}}", description: "ملاحظات الفاتورة", example: "التسليم خلال 3 أيام", category: "invoice" },
    { name: "{{salesRepName}}", description: "اسم مندوب المبيعات", example: "أحمد محمد", category: "invoice" },

    // Customer
    { name: "{{customerName}}", description: "اسم العميل", example: "شركة النور", category: "customer" },
    { name: "{{customerAddress}}", description: "عنوان العميل", example: "شارع التحرير", category: "customer" },

    // Items (inside {{#each items}})
    { name: "{{_index}}", description: "رقم الصنف (1, 2, 3...)", example: "1", category: "items" },
    { name: "{{productName}}", description: "اسم المنتج", example: "مفتاح كهربائي", category: "items" },
    { name: "{{productCode}}", description: "كود المنتج", example: "SW-001", category: "items" },
    { name: "{{quantity}}", description: "الكمية", example: "10", category: "items" },
    { name: "{{price}}", description: "سعر الوحدة", example: "25", category: "items" },
    { name: "{{total}}", description: "إجمالي الصنف", example: "250", category: "items" },
    { name: "{{unitsPerCarton}}", description: "عدد الوحدات في الكرتونة", example: "50", category: "items" },

    // Totals
    { name: "{{subtotal}}", description: "الإجمالي قبل الخصم", example: "2040", category: "totals" },
    { name: "{{discount}}", description: "قيمة الخصم", example: "40", category: "totals" },
    { name: "{{total}}", description: "الإجمالي النهائي", example: "2000", category: "totals" },
    { name: "{{previousBalance}}", description: "الرصيد السابق", example: "1500", category: "totals" },
    { name: "{{currentBalance}}", description: "الرصيد الحالي", example: "3500", category: "totals" },
    { name: "{{itemCount}}", description: "عدد الأصناف", example: "5", category: "totals" },

    // Meta
    { name: "{{logoBase64}}", description: "صورة اللوجو (base64)", example: "data:image/png;...", category: "meta" },
    { name: "{{qrCodeBase64}}", description: "صورة QR Code (base64)", example: "data:image/png;...", category: "meta" },

    // Helpers
    { name: "{{formatNumber value 2}}", description: "تنسيق رقم بكسور عشرية", example: "2,040.00", category: "helpers" },
    { name: "{{#each items}}...{{/each}}", description: "حلقة لعرض الأصناف", example: "", category: "helpers" },
    { name: "{{#if field}}...{{/if}}", description: "عرض مشروط", example: "", category: "helpers" },
    { name: "{{#ifCond a '>' b}}...{{/ifCond}}", description: "مقارنة متقدمة (==, !=, >, <, >=, <=)", example: "", category: "helpers" },
    { name: "{{add a b}}", description: "جمع رقمين", example: "{{add subtotal discount}}", category: "helpers" },
    { name: "{{subtract a b}}", description: "طرح رقمين", example: "{{subtract total discount}}", category: "helpers" },
  ];
}

// ===== Default Template =====

export const DEFAULT_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{#if isReturn}}فاتورة مرتجعات{{else}}فاتورة بيع{{/if}} رقم {{invoiceNumber}}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        
        @page { size: A4; margin: 0; }
        
        * {
            margin: 0; padding: 0; box-sizing: border-box;
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
            font-size: 14px;
        }
        
        .invoice-container { padding: 10mm 12mm 12mm 12mm; }
        
        .header-section {
            display: flex;
            flex-direction: row-reverse;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .header-top {
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-start;
        }
        
        .logo-section { text-align: left; margin-right: auto; margin-left: 0; }
        .logo-container { width: 150px; }
        .logo { width: 100%; height: auto; }
        
        .meta-section { margin-top: 15px; }
        .meta-table { border-collapse: collapse; width: 200px; }
        .meta-table th {
            background: #2d8a9e; color: white; padding: 5px 6px;
            font-size: 12px; font-weight: 600; text-align: center; border: none;
        }
        .meta-table td {
            background: #fff; padding: 5px 6px; font-size: 14px;
            font-weight: 700; text-align: center; border: none;
            border-bottom: 4px solid #2d8a9e;
        }
        
        .company-section { text-align: right; margin-bottom: 10px; }
        .company-name { font-size: 24px; font-weight: 800; color: #000; }
        
        .invoice-type-bar {
            background: #2d8a9e; color: white; display: block;
            padding: 4px 20px 4px 12px; font-size: 13px;
            font-weight: 600; margin-top: 4px;
        }
        
        .customer-section { margin-bottom: 8px; margin-top: 8px; text-align: right; }
        .customer-name { font-size: 18px; font-weight: 800; color: #000; }
        .customer-address { font-size: 14px; color: #333; font-weight: 600; margin-top: 3px; }
        
        .items-table-container { margin-bottom: 15px; }
        .items-table { width: 100%; border-collapse: collapse; }
        
        .items-table th {
            background: #2d8a9e; color: white; padding: 7px 4px;
            font-size: 13px; font-weight: 700; text-align: center;
            vertical-align: middle; border: 1px solid rgba(255,255,255,0.3);
            border-bottom: 2px solid #2d8a9e;
        }
        .items-table th.col-name { text-align: right; padding-right: 10px; }
        
        .items-table td {
            padding: 8px 4px; font-size: 14px; font-weight: 600;
            text-align: center; vertical-align: middle; color: #000;
            border: 1px solid #aaa; border-bottom: 1px solid #888;
        }
        .items-table td.col-name { text-align: right; padding-right: 10px; font-size: 13px; }
        .items-table td.col-index { font-weight: 700; }
        .items-table td.col-total { font-weight: 700; }
        
        .col-index { width: 5%; }
        .col-name { width: 35%; }
        .col-qty { width: 8%; }
        .col-unit { width: 10%; }
        .col-price { width: 13%; }
        .col-total { width: 13%; }
        
        .items-table th.col-index, .items-table td.col-index { border-right: 2px solid #2d8a9e; }
        .items-table th.col-total, .items-table td.col-total { border-left: 2px solid #2d8a9e; }
        .items-table thead th { border-top: 2px solid #2d8a9e; }
        .items-table tbody tr:last-child td { border-bottom: 2px solid #2d8a9e; }
        
        .col-spacer {
            width: 5%; border: none !important;
            background: #fff !important; padding: 0 !important;
        }
        .items-table th.col-spacer, .items-table td.col-spacer {
            background: #fff !important; border: none !important;
        }
        
        .col-units { width: 11%; }
        .items-table th.col-units { border: 2px solid #2d8a9e; }
        .items-table td.col-units {
            border-right: 2px solid #2d8a9e;
            border-left: 2px solid #2d8a9e;
            border-bottom: 1px solid #aaa;
        }
        .items-table tbody tr:last-child td.col-units { border-bottom: 2px solid #2d8a9e; }
        
        .footer {
            display: flex; flex-direction: row;
            justify-content: space-between; align-items: flex-start;
            margin-top: 12px;
        }
        
        .totals-block { width: 260px; order: 2; }
        .total-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 5px 0; font-size: 15px; font-weight: 700;
            border-bottom: 2px solid #000;
        }
        .total-row .amount { font-weight: 800; }
        
        .qr-section {
            display: flex; flex-direction: row; align-items: center;
            gap: 12px; order: 1;
        }
        .site-url { font-size: 14px; font-weight: 700; color: #2d8a9e; text-decoration: none; }
        .qr-code { width: 110px; height: 110px; }
        
        .notes-section {
            margin-top: 12px; padding: 8px 12px;
            border: 1.5px solid #2d8a9e; border-radius: 4px; text-align: right;
        }
        .notes-label { font-size: 13px; font-weight: 700; color: #2d8a9e; margin-bottom: 4px; }
        .notes-text { font-size: 14px; font-weight: 600; color: #333; line-height: 1.6; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="header-section">
            <div class="header-top">
                <div class="meta-section">
                    <table class="meta-table">
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{{invoiceNumber}}</td>
                                <td>{{date}}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {{#if logoBase64}}
                <div class="logo-section">
                    <div class="logo-container">
                        <img src="{{logoBase64}}" class="logo" alt="Logo">
                    </div>
                </div>
                {{/if}}
            </div>
            
            <div class="company-section">
                <div class="company-name">لونج تايم للصناعات الكهربائية</div>
                <div class="invoice-type-bar">{{#if isReturn}}مرتجع من:{{else}}فاتورة إلى:{{/if}}</div>
                <div class="customer-section">
                    <div class="customer-name">السادة / {{customerName}}</div>
                    {{#if customerAddress}}
                    <div class="customer-address">{{customerAddress}}</div>
                    {{/if}}
                </div>
            </div>
        </div>
        
        <div class="items-table-container">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-index">م</th>
                        <th class="col-name">اسم الصنف</th>
                        <th class="col-qty">الكمية</th>
                        <th class="col-unit">الوحدة</th>
                        <th class="col-price">الفئة</th>
                        <th class="col-total">الإجمالي</th>
                        <th class="col-spacer"></th>
                        <th class="col-units">العدد في<br>الكرتونة</th>
                    </tr>
                </thead>
                <tbody>
                    {{#each items}}
                    <tr>
                        <td class="col-index">{{_index}}</td>
                        <td class="col-name">{{productName}}</td>
                        <td class="col-qty">{{formatNumber quantity 0}}</td>
                        <td class="col-unit">قطعة</td>
                        <td class="col-price">{{formatNumber price 2}}</td>
                        <td class="col-total">{{formatNumber total 2}}</td>
                        <td class="col-spacer"></td>
                        <td class="col-units">{{#if unitsPerCarton}}{{formatNumber unitsPerCarton 0}}{{/if}}</td>
                    </tr>
                    {{/each}}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            {{#if qrCodeBase64}}
            <div class="qr-section">
                <img src="{{qrCodeBase64}}" class="qr-code" alt="QR Code">
                <a href="https://longtimelt.com" class="site-url">longtimelt.com</a>
            </div>
            {{/if}}

            <div class="totals-block">
                {{#if discount}}
                {{#ifCond discount '>' 0}}
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">{{formatNumber subtotal 0}}</span>
                </div>
                <div class="total-row">
                    <span>الخصم</span>
                    <span class="amount">{{formatNumber discount 0}}</span>
                </div>
                <div class="total-row">
                    <span>الإجمالي بعد الخصم</span>
                    <span class="amount">{{formatNumber total 0}}</span>
                </div>
                {{else}}
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">{{formatNumber total 0}}</span>
                </div>
                {{/ifCond}}
                {{else}}
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">{{formatNumber total 0}}</span>
                </div>
                {{/if}}
                
                {{#if previousBalance}}
                <div class="total-row">
                    <span>الرصيد السابق</span>
                    <span class="amount">{{formatNumber previousBalance 0}}</span>
                </div>
                {{/if}}
                
                {{#if currentBalance}}
                <div class="total-row">
                    <span>الرصيد الحالي</span>
                    <span class="amount">{{formatNumber currentBalance 0}}</span>
                </div>
                {{/if}}
            </div>
        </div>
        
        {{#if notes}}
        <div class="notes-section">
            <div class="notes-label">ملاحظات:</div>
            <div class="notes-text">{{notes}}</div>
        </div>
        {{/if}}
    </div>
</body>
</html>`;

// ===== Editor HTML → Handlebars Template Conversion =====
// The visual editor uses data-invoice-* attributes with sample data.
// This function converts that HTML to a proper Handlebars template.

// Inline CSS rules into elements by matching selectors (handles GrapesJS style extraction)
function inlineCSSIntoHTML(root: Element, css: string, doc: Document) {
  if (!css || !css.trim()) return;
  // Parse CSS rules: selector { properties }
  const ruleRegex = /([^{}@][^{]*)\{([^}]+)\}/g;
  let match;
  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const styles = match[2].trim();
    // Skip universal, body, @rules, and pseudo-selectors
    if (!selector || selector === "*" || selector === "body" || selector.includes(":")) continue;
    try {
      root.querySelectorAll(selector).forEach((el) => {
        const existing = el.getAttribute("style") || "";
        el.setAttribute("style", styles + ";" + existing);
      });
    } catch (_e) {
      // Invalid selector – skip
    }
  }
}

export function convertEditorToTemplate(editorHTML: string, editorCSS: string): string {
  const doc = new DOMParser().parseFromString(
    `<div id="__conv_root">${editorHTML}</div>`,
    "text/html"
  );
  const root = doc.getElementById("__conv_root")!;

  // 0. Inline GrapesJS CSS rules into elements so styles survive conversion
  inlineCSSIntoHTML(root, editorCSS, doc);

  // 1. Remove visual-only sample rows
  root.querySelectorAll("[data-invoice-sample]").forEach((el) => el.remove());

  // 2. data-invoice-raw → replace innerHTML with raw Handlebars expression
  root.querySelectorAll("[data-invoice-raw]").forEach((el) => {
    const raw = el.getAttribute("data-invoice-raw")!;
    el.removeAttribute("data-invoice-raw");
    el.innerHTML = raw;
  });

  // 3. data-invoice-format → {{formatNumber field dec}}
  root.querySelectorAll("[data-invoice-format]").forEach((el) => {
    const format = el.getAttribute("data-invoice-format")!;
    const [field, dec] = format.split(":");
    el.removeAttribute("data-invoice-format");
    el.textContent = `{{formatNumber ${field} ${dec || 2}}}`;
  });

  // 4. data-invoice-field → {{field}}
  root.querySelectorAll("[data-invoice-field]").forEach((el) => {
    const field = el.getAttribute("data-invoice-field")!;
    el.removeAttribute("data-invoice-field");
    el.textContent = `{{${field}}}`;
  });

  // 5. data-invoice-src → set src attribute to {{field}}
  root.querySelectorAll("[data-invoice-src]").forEach((el) => {
    const field = el.getAttribute("data-invoice-src")!;
    el.removeAttribute("data-invoice-src");
    el.setAttribute("src", `{{${field}}}`);
  });

  // 6. data-invoice-if → comment markers for {{#if}}
  root.querySelectorAll("[data-invoice-if]").forEach((el) => {
    const field = el.getAttribute("data-invoice-if")!;
    el.removeAttribute("data-invoice-if");
    const start = doc.createComment(`HBS_IF:${field}`);
    const end = doc.createComment(`HBS_ENDIF:${field}`);
    el.parentNode!.insertBefore(start, el);
    if (el.nextSibling) {
      el.parentNode!.insertBefore(end, el.nextSibling);
    } else {
      el.parentNode!.appendChild(end);
    }
  });

  // 7. data-invoice-each → comment markers for {{#each}} (inside the element)
  root.querySelectorAll("[data-invoice-each]").forEach((el) => {
    const arrayName = el.getAttribute("data-invoice-each")!;
    el.removeAttribute("data-invoice-each");
    const start = doc.createComment(`HBS_EACH:${arrayName}`);
    const end = doc.createComment(`HBS_ENDEACH:${arrayName}`);
    el.insertBefore(start, el.firstChild);
    el.appendChild(end);
  });

  // Get HTML string and replace comment markers with Handlebars
  let html = root.innerHTML;
  html = html.replace(/<!--HBS_IF:(\w+)-->/g, "{{#if $1}}");
  html = html.replace(/<!--HBS_ENDIF:\w+-->/g, "{{/if}}");
  html = html.replace(/<!--HBS_EACH:(\w+)-->/g, "{{#each $1}}");
  html = html.replace(/<!--HBS_ENDEACH:\w+-->/g, "{{/each}}");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; background: #fff; color: #000; width: 210mm; min-height: 297mm; margin: 0 auto; font-size: 14px; }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
}

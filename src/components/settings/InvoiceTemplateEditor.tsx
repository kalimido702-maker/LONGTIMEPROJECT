/**
 * InvoiceTemplateEditor - محرر قالب الفاتورة البصري
 * GrapesJS drag & drop editor - بدون كود - تحكم كامل ٣٦٠°
 * Uses data-invoice-* attributes for data binding (no raw Handlebars in editor canvas)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import grapesjs, { type Editor as GjsEditor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, RotateCcw, Eye, Undo2, Redo2, Tablet, Smartphone, Monitor, FileCode, Download, Upload } from "lucide-react";
import { saveInvoiceTemplate, loadEditorProjectData, saveEditorProjectData } from "@/lib/invoiceTemplateConfig";
import { compileInvoiceTemplate, getSampleInvoiceData, convertEditorToTemplate } from "@/lib/invoiceTemplateEngine";

// ===== Default editor body (data-invoice-* attributes + sample data) =====
const DEFAULT_EDITOR_BODY = `<div style="padding:30px 40px;font-family:'Cairo',sans-serif;direction:rtl;">
  <div style="display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
    <div style="text-align:right;">
      <div style="font-size:24px;font-weight:800;color:#000;">لونج تايم للصناعات الكهربائية</div>
      <div data-invoice-raw="{{#if isReturn}}مرتجع من:{{else}}فاتورة إلى:{{/if}}" style="background:#2d8a9e;color:white;padding:4px 20px;font-size:13px;font-weight:600;margin-top:4px;">فاتورة إلى:</div>
      <div style="margin-top:8px;">
        <div style="font-size:18px;font-weight:800;">السادة / <span data-invoice-field="customerName">شركة النور للمقاولات</span></div>
        <div data-invoice-if="customerAddress" style="font-size:14px;color:#333;font-weight:600;margin-top:3px;"><span data-invoice-field="customerAddress">شارع التحرير، القاهرة</span></div>
      </div>
    </div>
    <div style="text-align:left;">
      <div data-invoice-if="logoBase64" style="width:150px;margin-bottom:10px;">
        <img data-invoice-src="logoBase64" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='80' fill='%23ddd'%3E%3Crect width='150' height='80' rx='8'/%3E%3Ctext x='75' y='45' text-anchor='middle' fill='%23999' font-size='14'%3ELogo%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;" alt="Logo">
      </div>
      <table style="border-collapse:collapse;width:200px;">
        <thead><tr>
          <th style="background:#2d8a9e;color:white;padding:5px 6px;font-size:12px;font-weight:600;text-align:center;">رقم الفاتورة</th>
          <th style="background:#2d8a9e;color:white;padding:5px 6px;font-size:12px;font-weight:600;text-align:center;">التاريخ</th>
        </tr></thead>
        <tbody><tr>
          <td data-invoice-field="invoiceNumber" style="padding:5px 6px;font-size:14px;font-weight:700;text-align:center;border-bottom:4px solid #2d8a9e;">INV-2024-0042</td>
          <td data-invoice-field="date" style="padding:5px 6px;font-size:14px;font-weight:700;text-align:center;border-bottom:4px solid #2d8a9e;">٢٩/٣/٢٠٢٦</td>
        </tr></tbody>
      </table>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
    <thead><tr>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);width:5%;">م</th>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:right;padding-right:10px;border:1px solid rgba(255,255,255,0.3);width:35%;">اسم الصنف</th>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);width:10%;">الكمية</th>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);width:10%;">الوحدة</th>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);width:13%;">الفئة</th>
      <th style="background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);width:13%;">الإجمالي</th>
    </tr></thead>
    <tbody data-invoice-each="items">
      <tr>
        <td data-invoice-field="_index" style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">1</td>
        <td data-invoice-field="productName" style="padding:8px 4px;font-size:13px;font-weight:600;text-align:right;padding-right:10px;border:1px solid #aaa;">مفتاح كهربائي ثنائي</td>
        <td data-invoice-format="quantity:0" style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">10</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">قطعة</td>
        <td data-invoice-format="price:2" style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">25.00</td>
        <td data-invoice-format="total:2" style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">250.00</td>
      </tr>
      <tr data-invoice-sample="">
        <td style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">2</td>
        <td style="padding:8px 4px;font-size:13px;font-weight:600;text-align:right;padding-right:10px;border:1px solid #aaa;">فيشة ثلاثية دولي</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">5</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">قطعة</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">40.00</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">200.00</td>
      </tr>
      <tr data-invoice-sample="">
        <td style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">3</td>
        <td style="padding:8px 4px;font-size:13px;font-weight:600;text-align:right;padding-right:10px;border:1px solid #aaa;">كابل كهربائي 2.5مم</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">3</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">قطعة</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;">150.00</td>
        <td style="padding:8px 4px;font-size:14px;font-weight:700;text-align:center;border:1px solid #aaa;">450.00</td>
      </tr>
    </tbody>
  </table>
  <div style="display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:flex-start;margin-top:12px;">
    <div style="width:260px;">
      <div data-invoice-if="discount" style="display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;"><span>الإجمالي قبل الخصم</span><span data-invoice-format="subtotal:0" style="font-weight:800;">2,040</span></div>
      <div data-invoice-if="discount" style="display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;"><span>الخصم</span><span data-invoice-format="discount:0" style="font-weight:800;">40</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;"><span>الإجمالي</span><span data-invoice-format="total:0" style="font-weight:800;">2,000</span></div>
      <div data-invoice-if="previousBalance" style="display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;"><span>الرصيد السابق</span><span data-invoice-format="previousBalance:0" style="font-weight:800;">1,500</span></div>
      <div data-invoice-if="currentBalance" style="display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;"><span>الرصيد الحالي</span><span data-invoice-format="currentBalance:0" style="font-weight:800;">3,500</span></div>
    </div>
    <div data-invoice-if="qrCodeBase64" style="display:flex;align-items:center;gap:12px;">
      <img data-invoice-src="qrCodeBase64" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110' fill='%23ddd'%3E%3Crect width='110' height='110' rx='8'/%3E%3Ctext x='55' y='60' text-anchor='middle' fill='%23999' font-size='12'%3EQR%3C/text%3E%3C/svg%3E" style="width:110px;height:110px;" alt="QR">
      <a href="https://longtimelt.com" style="font-size:14px;font-weight:700;color:#2d8a9e;text-decoration:none;">longtimelt.com</a>
    </div>
  </div>
  <div data-invoice-if="notes" style="margin-top:12px;padding:8px 12px;border:1.5px solid #2d8a9e;border-radius:4px;text-align:right;">
    <div style="font-size:13px;font-weight:700;color:#2d8a9e;margin-bottom:4px;">ملاحظات:</div>
    <div data-invoice-field="notes" style="font-size:14px;font-weight:600;color:#333;line-height:1.6;">التسليم خلال 3 أيام عمل</div>
  </div>
  <div style="text-align:center;margin-top:15px;font-size:13px;color:#555;font-weight:600;">شكراً لتعاملكم معنا</div>
</div>`;

// ===== Invoice blocks with data-invoice-* attributes and sample data =====
function registerInvoiceBlocks(editor: GjsEditor) {
  const bm = editor.BlockManager;
  const TH = "background:#2d8a9e;color:white;padding:7px 4px;font-size:13px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.3);";
  const TD = "padding:8px 4px;font-size:14px;font-weight:600;text-align:center;border:1px solid #aaa;";
  const TOTAL_ROW = "display:flex;justify-content:space-between;padding:5px 0;font-size:15px;font-weight:700;border-bottom:2px solid #000;font-family:'Cairo',sans-serif;width:260px;";

  // ── بيانات الفاتورة ──
  bm.add("invoice-header", {
    label: "ترويسة الفاتورة الكاملة",
    category: "بيانات الفاتورة",
    content: DEFAULT_EDITOR_BODY,
  });

  bm.add("company-name", {
    label: "اسم الشركة",
    category: "بيانات الفاتورة",
    content: `<div style="font-size:24px;font-weight:800;color:#000;text-align:right;font-family:'Cairo',sans-serif;">لونج تايم للصناعات الكهربائية</div>`,
  });

  bm.add("invoice-number", {
    label: "رقم الفاتورة",
    category: "بيانات الفاتورة",
    content: `<span data-invoice-field="invoiceNumber" style="font-weight:700;font-family:'Cairo',sans-serif;">INV-2024-0042</span>`,
  });

  bm.add("invoice-date", {
    label: "التاريخ",
    category: "بيانات الفاتورة",
    content: `<span data-invoice-field="date" style="font-weight:700;font-family:'Cairo',sans-serif;">٢٩/٣/٢٠٢٦</span>`,
  });

  bm.add("invoice-type-bar", {
    label: "شريط نوع الفاتورة",
    category: "بيانات الفاتورة",
    content: `<div data-invoice-raw="{{#if isReturn}}مرتجع من:{{else}}فاتورة إلى:{{/if}}" style="background:#2d8a9e;color:white;padding:4px 20px;font-size:13px;font-weight:600;font-family:'Cairo',sans-serif;">فاتورة إلى:</div>`,
  });

  bm.add("sales-rep", {
    label: "اسم المندوب",
    category: "بيانات الفاتورة",
    content: `<div style="font-size:14px;font-weight:600;font-family:'Cairo',sans-serif;">المندوب: <span data-invoice-field="salesRepName">أحمد محمد</span></div>`,
  });

  // ── بيانات العميل ──
  bm.add("customer-name", {
    label: "اسم العميل",
    category: "بيانات العميل",
    content: `<div style="font-size:18px;font-weight:800;color:#000;text-align:right;font-family:'Cairo',sans-serif;">السادة / <span data-invoice-field="customerName">شركة النور للمقاولات</span></div>`,
  });

  bm.add("customer-address", {
    label: "عنوان العميل",
    category: "بيانات العميل",
    content: `<div data-invoice-if="customerAddress" style="font-size:14px;color:#333;font-weight:600;font-family:'Cairo',sans-serif;"><span data-invoice-field="customerAddress">شارع التحرير، القاهرة</span></div>`,
  });

  bm.add("customer-section", {
    label: "قسم العميل كامل",
    category: "بيانات العميل",
    content: `<div style="margin:8px 0;text-align:right;font-family:'Cairo',sans-serif;">
        <div style="font-size:18px;font-weight:800;color:#000;">السادة / <span data-invoice-field="customerName">شركة النور للمقاولات</span></div>
        <div data-invoice-if="customerAddress" style="font-size:14px;color:#333;font-weight:600;margin-top:3px;"><span data-invoice-field="customerAddress">شارع التحرير، القاهرة</span></div>
      </div>`,
  });

  // ── جدول الأصناف ──
  bm.add("items-table-full", {
    label: "جدول الأصناف (كامل)",
    category: "جدول الأصناف",
    content: `<table style="width:100%;border-collapse:collapse;font-family:'Cairo',sans-serif;margin-bottom:15px;">
        <thead><tr>
            <th style="${TH}width:5%;">م</th>
            <th style="${TH}text-align:right;padding-right:10px;width:25%;">اسم الصنف</th>
            <th style="${TH}width:10%;">الكود</th>
            <th style="${TH}width:8%;">الكمية</th>
            <th style="${TH}width:10%;">الوحدة</th>
            <th style="${TH}width:13%;">الفئة</th>
            <th style="${TH}width:13%;">الإجمالي</th>
            <th style="${TH}width:11%;">العدد/كرتونة</th>
        </tr></thead>
        <tbody data-invoice-each="items">
          <tr>
            <td data-invoice-field="_index" style="${TD}font-weight:700;">1</td>
            <td data-invoice-field="productName" style="${TD}text-align:right;padding-right:10px;font-size:13px;">مفتاح كهربائي ثنائي</td>
            <td data-invoice-field="productCode" style="${TD}">SW-001</td>
            <td data-invoice-format="quantity:0" style="${TD}">10</td>
            <td style="${TD}">قطعة</td>
            <td data-invoice-format="price:2" style="${TD}">25.00</td>
            <td data-invoice-format="total:2" style="${TD}font-weight:700;">250.00</td>
            <td data-invoice-raw="{{#if unitsPerCarton}}{{formatNumber unitsPerCarton 0}}{{/if}}" style="${TD}">50</td>
          </tr>
          <tr data-invoice-sample="">
            <td style="${TD}font-weight:700;">2</td>
            <td style="${TD}text-align:right;padding-right:10px;font-size:13px;">فيشة ثلاثية دولي</td>
            <td style="${TD}">PL-003</td>
            <td style="${TD}">5</td>
            <td style="${TD}">قطعة</td>
            <td style="${TD}">40.00</td>
            <td style="${TD}font-weight:700;">200.00</td>
            <td style="${TD}">30</td>
          </tr>
          <tr data-invoice-sample="">
            <td style="${TD}font-weight:700;">3</td>
            <td style="${TD}text-align:right;padding-right:10px;font-size:13px;">كابل كهربائي 2.5مم</td>
            <td style="${TD}">CB-025</td>
            <td style="${TD}">3</td>
            <td style="${TD}">قطعة</td>
            <td style="${TD}">150.00</td>
            <td style="${TD}font-weight:700;">450.00</td>
            <td style="${TD}">10</td>
          </tr>
        </tbody>
      </table>`,
  });

  bm.add("items-table-simple", {
    label: "جدول الأصناف (بسيط)",
    category: "جدول الأصناف",
    content: `<table style="width:100%;border-collapse:collapse;font-family:'Cairo',sans-serif;margin-bottom:15px;">
        <thead><tr>
            <th style="${TH}width:5%;">م</th>
            <th style="${TH}text-align:right;padding-right:10px;width:45%;">اسم الصنف</th>
            <th style="${TH}width:15%;">الكمية</th>
            <th style="${TH}width:15%;">السعر</th>
            <th style="${TH}width:20%;">الإجمالي</th>
        </tr></thead>
        <tbody data-invoice-each="items">
          <tr>
            <td data-invoice-field="_index" style="${TD}font-weight:700;">1</td>
            <td data-invoice-field="productName" style="${TD}text-align:right;padding-right:10px;font-size:13px;">مفتاح كهربائي ثنائي</td>
            <td data-invoice-format="quantity:0" style="${TD}">10</td>
            <td data-invoice-format="price:2" style="${TD}">25.00</td>
            <td data-invoice-format="total:2" style="${TD}font-weight:700;">250.00</td>
          </tr>
          <tr data-invoice-sample="">
            <td style="${TD}font-weight:700;">2</td>
            <td style="${TD}text-align:right;padding-right:10px;font-size:13px;">فيشة ثلاثية دولي</td>
            <td style="${TD}">5</td>
            <td style="${TD}">40.00</td>
            <td style="${TD}font-weight:700;">200.00</td>
          </tr>
          <tr data-invoice-sample="">
            <td style="${TD}font-weight:700;">3</td>
            <td style="${TD}text-align:right;padding-right:10px;font-size:13px;">كابل كهربائي 2.5مم</td>
            <td style="${TD}">3</td>
            <td style="${TD}">150.00</td>
            <td style="${TD}font-weight:700;">450.00</td>
          </tr>
        </tbody>
      </table>`,
  });

  // ── الإجماليات ──
  bm.add("totals-full", {
    label: "الإجماليات (كامل)",
    category: "الإجماليات",
    content: `<div style="width:260px;font-family:'Cairo',sans-serif;">
        <div data-invoice-if="discount" style="${TOTAL_ROW}"><span>الإجمالي قبل الخصم</span><span data-invoice-format="subtotal:0" style="font-weight:800;">2,040</span></div>
        <div data-invoice-if="discount" style="${TOTAL_ROW}"><span>الخصم</span><span data-invoice-format="discount:0" style="font-weight:800;">40</span></div>
        <div style="${TOTAL_ROW}"><span>الإجمالي</span><span data-invoice-format="total:0" style="font-weight:800;">2,000</span></div>
        <div data-invoice-if="previousBalance" style="${TOTAL_ROW}"><span>الرصيد السابق</span><span data-invoice-format="previousBalance:0" style="font-weight:800;">1,500</span></div>
        <div data-invoice-if="currentBalance" style="${TOTAL_ROW}"><span>الرصيد الحالي</span><span data-invoice-format="currentBalance:0" style="font-weight:800;">3,500</span></div>
      </div>`,
  });

  bm.add("total-only", {
    label: "الإجمالي فقط",
    category: "الإجماليات",
    content: `<div style="${TOTAL_ROW}"><span>الإجمالي</span><span data-invoice-format="total:0" style="font-weight:800;">2,000</span></div>`,
  });

  bm.add("discount-row", {
    label: "سطر الخصم",
    category: "الإجماليات",
    content: `<div data-invoice-if="discount" style="${TOTAL_ROW}"><span>الخصم</span><span data-invoice-format="discount:0" style="font-weight:800;">40</span></div>`,
  });

  bm.add("previous-balance", {
    label: "الرصيد السابق",
    category: "الإجماليات",
    content: `<div data-invoice-if="previousBalance" style="${TOTAL_ROW}"><span>الرصيد السابق</span><span data-invoice-format="previousBalance:0" style="font-weight:800;">1,500</span></div>`,
  });

  bm.add("current-balance", {
    label: "الرصيد الحالي",
    category: "الإجماليات",
    content: `<div data-invoice-if="currentBalance" style="${TOTAL_ROW}"><span>الرصيد الحالي</span><span data-invoice-format="currentBalance:0" style="font-weight:800;">3,500</span></div>`,
  });

  // ── عناصر إضافية ──
  bm.add("logo-block", {
    label: "اللوجو",
    category: "عناصر إضافية",
    content: `<div data-invoice-if="logoBase64" style="width:150px;"><img data-invoice-src="logoBase64" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='80' fill='%23ddd'%3E%3Crect width='150' height='80' rx='8'/%3E%3Ctext x='75' y='45' text-anchor='middle' fill='%23999' font-size='14'%3ELogo%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;" alt="Logo"></div>`,
  });

  bm.add("qr-code", {
    label: "QR Code",
    category: "عناصر إضافية",
    content: `<div data-invoice-if="qrCodeBase64" style="display:flex;align-items:center;gap:12px;font-family:'Cairo',sans-serif;">
        <img data-invoice-src="qrCodeBase64" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110' fill='%23ddd'%3E%3Crect width='110' height='110' rx='8'/%3E%3Ctext x='55' y='60' text-anchor='middle' fill='%23999' font-size='12'%3EQR%3C/text%3E%3C/svg%3E" style="width:110px;height:110px;" alt="QR Code">
        <a href="https://longtimelt.com" style="font-size:14px;font-weight:700;color:#2d8a9e;text-decoration:none;">longtimelt.com</a>
      </div>`,
  });

  bm.add("notes-section", {
    label: "الملاحظات",
    category: "عناصر إضافية",
    content: `<div data-invoice-if="notes" style="margin-top:12px;padding:8px 12px;border:1.5px solid #2d8a9e;border-radius:4px;text-align:right;font-family:'Cairo',sans-serif;">
        <div style="font-size:13px;font-weight:700;color:#2d8a9e;margin-bottom:4px;">ملاحظات:</div>
        <div data-invoice-field="notes" style="font-size:14px;font-weight:600;color:#333;line-height:1.6;white-space:pre-wrap;">التسليم خلال 3 أيام عمل</div>
      </div>`,
  });

  bm.add("item-count", {
    label: "عدد الأصناف",
    category: "عناصر إضافية",
    content: `<span style="font-weight:600;font-family:'Cairo',sans-serif;">عدد الأصناف: <span data-invoice-field="itemCount">5</span></span>`,
  });

  bm.add("footer-text", {
    label: "نص تذييل",
    category: "عناصر إضافية",
    content: `<div style="text-align:center;margin-top:12px;font-size:13px;color:#555;font-weight:600;font-family:'Cairo',sans-serif;">شكراً لتعاملكم معنا</div>`,
  });

  // ── تخطيطات ──
  bm.add("two-columns", {
    label: "عمودين",
    category: "تخطيطات",
    content: `<div style="display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:flex-start;gap:20px;">
        <div style="flex:1;min-width:0;">عمود يمين</div>
        <div style="flex:1;min-width:0;">عمود يسار</div>
      </div>`,
  });

  bm.add("three-columns", {
    label: "ثلاثة أعمدة",
    category: "تخطيطات",
    content: `<div style="display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:flex-start;gap:15px;">
        <div style="flex:1;min-width:0;">عمود ١</div>
        <div style="flex:1;min-width:0;">عمود ٢</div>
        <div style="flex:1;min-width:0;">عمود ٣</div>
      </div>`,
  });

  bm.add("section-box", {
    label: "صندوق / قسم",
    category: "تخطيطات",
    content: `<div style="padding:10px;border:1px solid #ddd;border-radius:4px;margin:8px 0;">محتوى القسم</div>`,
  });

  bm.add("divider", {
    label: "فاصل",
    category: "تخطيطات",
    content: `<hr style="border:none;border-top:2px solid #2d8a9e;margin:10px 0;">`,
  });

  // ── نصوص ──
  bm.add("heading", {
    label: "عنوان",
    category: "نصوص",
    content: `<h2 style="font-size:20px;font-weight:700;font-family:'Cairo',sans-serif;">عنوان</h2>`,
  });

  bm.add("paragraph", {
    label: "نص",
    category: "نصوص",
    content: `<p style="font-size:14px;font-weight:600;font-family:'Cairo',sans-serif;">نص حر</p>`,
  });

  bm.add("label-value", {
    label: "تسمية وقيمة",
    category: "نصوص",
    content: `<div style="font-size:14px;font-family:'Cairo',sans-serif;"><strong>التسمية:</strong> القيمة</div>`,
  });
}

// Register custom component types so data-bound elements are non-editable
function registerDataComponentTypes(editor: GjsEditor) {
  editor.DomComponents.addType("invoice-data", {
    isComponent: (el) => {
      if (!(el instanceof HTMLElement)) return false;
      return (
        el.hasAttribute("data-invoice-field") ||
        el.hasAttribute("data-invoice-format") ||
        el.hasAttribute("data-invoice-raw")
      );
    },
    model: {
      defaults: {
        editable: false,
        droppable: false,
      },
    },
  });
}

// ===== Editor CSS theme =====
const EDITOR_STYLES = `
  .gjs-one-bg { background-color: #1e1e2e !important; }
  .gjs-two-color { color: #cdd6f4 !important; }
  .gjs-three-bg { background-color: #313244 !important; }
  .gjs-four-color, .gjs-four-color-h:hover { color: #89b4fa !important; }
  .gjs-pn-panel { font-family: 'Cairo', sans-serif; }
  .gjs-block { font-family: 'Cairo', sans-serif; min-height: auto !important; width: 100% !important; }
  .gjs-block__media { display: none !important; }
  .gjs-block-label { font-size: 12px !important; font-weight: 600; padding: 8px 6px !important; }
  .gjs-blocks-cs .gjs-block-category .gjs-title {
    font-family: 'Cairo', sans-serif; font-weight: 700; font-size: 13px;
    direction: rtl; text-align: right; padding: 8px 10px;
    border-bottom: 1px solid #45475a; background: #181825 !important;
  }
  .gjs-sm-sector-title { font-family: 'Cairo', sans-serif; font-weight: 700; direction: rtl; text-align: right; }
  .gjs-sm-label { font-family: 'Cairo', sans-serif; direction: rtl; }
  .gjs-trt-trait { direction: rtl; font-family: 'Cairo', sans-serif; }
  .gjs-layer-name { direction: rtl; font-family: 'Cairo', sans-serif; }
  .gjs-frame-wrapper { background: #e8e8e8 !important; }
  .gjs-cv-canvas { background: #e8e8e8 !important; }
`;

// Parse external HTML for import
function parseTemplateForEditor(html: string): { body: string; css: string } {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  let css = styleMatch ? styleMatch[1] : "";
  css = css.replace(/@import\s+url\([^)]+\);?\s*/g, "");
  css = css.replace(/@page\s*\{[^}]*\}\s*/g, "");
  css = css.replace(/\*\s*\{[^}]*\}\s*/g, "");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1].trim() : html;
  return { body, css };
}

// ===== Main Component =====
export function InvoiceTemplateEditor() {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GjsEditor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState("");
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [activePanel, setActivePanel] = useState<"blocks" | "styles" | "layers">("blocks");

  // Convert editor HTML → Handlebars template
  const getTemplateHTML = useCallback((): string => {
    const editor = editorRef.current;
    if (!editor) return "";
    const bodyHTML = editor.getHtml() || "";
    const css = editor.getCss() || "";
    return convertEditorToTemplate(bodyHTML, css);
  }, []);

  // Initialize GrapesJS
  useEffect(() => {
    if (!editorContainerRef.current) return;
    let destroyed = false;

    (async () => {
      const editorProjectData = await loadEditorProjectData();
      if (destroyed) return;

      const editor = grapesjs.init({
        container: editorContainerRef.current!,
        height: "100%",
        width: "auto",
        fromElement: false,
        storageManager: false,

        canvas: {
          styles: [
            "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap",
          ],
        },

        deviceManager: {
          devices: [
            { name: "A4", width: "210mm" },
            { name: "Tablet", width: "768px" },
            { name: "Mobile", width: "375px" },
          ],
        },

        panels: { defaults: [] },

        blockManager: { appendTo: "#invoice-blocks-panel" },

        styleManager: {
          appendTo: "#invoice-styles-panel",
          sectors: [
            {
              name: "المظهر",
              open: true,
              properties: [
                { type: "color", property: "color", name: "لون النص" },
                { type: "color", property: "background-color", name: "لون الخلفية" },
              ],
            },
            {
              name: "الخط",
              open: true,
              properties: [
                {
                  type: "select", property: "font-family", name: "نوع الخط",
                  options: [
                    { id: "'Cairo', sans-serif", label: "Cairo" },
                    { id: "'Tajawal', sans-serif", label: "Tajawal" },
                    { id: "'Noto Sans Arabic', sans-serif", label: "Noto Sans Arabic" },
                    { id: "Arial, sans-serif", label: "Arial" },
                  ],
                },
                { type: "number", property: "font-size", name: "حجم الخط", units: ["px", "em", "rem", "%"], min: 8 },
                {
                  type: "select", property: "font-weight", name: "سمك الخط",
                  options: [
                    { id: "400", label: "عادي" },
                    { id: "600", label: "متوسط" },
                    { id: "700", label: "سميك" },
                    { id: "800", label: "أسمك" },
                  ],
                },
                {
                  type: "select", property: "text-align", name: "المحاذاة",
                  options: [
                    { id: "right", label: "يمين" },
                    { id: "center", label: "وسط" },
                    { id: "left", label: "يسار" },
                  ],
                },
                { type: "number", property: "line-height", name: "ارتفاع السطر", units: ["px", "em", ""] },
              ],
            },
            {
              name: "الأبعاد",
              open: false,
              properties: [
                { type: "number", property: "width", name: "العرض", units: ["px", "%", "mm"] },
                { type: "number", property: "height", name: "الارتفاع", units: ["px", "%", "mm"] },
                { type: "number", property: "min-height", name: "أقل ارتفاع", units: ["px", "%", "mm"] },
                { type: "composite", property: "margin", name: "الهامش الخارجي",
                  properties: [
                    { type: "number", property: "margin-top", units: ["px", "%", "mm"] },
                    { type: "number", property: "margin-right", units: ["px", "%", "mm"] },
                    { type: "number", property: "margin-bottom", units: ["px", "%", "mm"] },
                    { type: "number", property: "margin-left", units: ["px", "%", "mm"] },
                  ],
                },
                { type: "composite", property: "padding", name: "الهامش الداخلي",
                  properties: [
                    { type: "number", property: "padding-top", units: ["px", "%", "mm"] },
                    { type: "number", property: "padding-right", units: ["px", "%", "mm"] },
                    { type: "number", property: "padding-bottom", units: ["px", "%", "mm"] },
                    { type: "number", property: "padding-left", units: ["px", "%", "mm"] },
                  ],
                },
              ],
            },
            {
              name: "التخطيط",
              open: false,
              properties: [
                {
                  type: "select", property: "display", name: "نوع العرض",
                  options: [
                    { id: "block", label: "كتلة" },
                    { id: "flex", label: "مرن (Flex)" },
                    { id: "inline-block", label: "سطري-كتلة" },
                    { id: "inline", label: "سطري" },
                    { id: "none", label: "مخفي" },
                    { id: "grid", label: "شبكة (Grid)" },
                  ],
                },
                {
                  type: "select", property: "flex-direction", name: "اتجاه Flex",
                  options: [
                    { id: "row", label: "أفقي" },
                    { id: "row-reverse", label: "أفقي معكوس" },
                    { id: "column", label: "عمودي" },
                    { id: "column-reverse", label: "عمودي معكوس" },
                  ],
                },
                {
                  type: "select", property: "justify-content", name: "التوزيع الأفقي",
                  options: [
                    { id: "flex-start", label: "البداية" },
                    { id: "center", label: "الوسط" },
                    { id: "flex-end", label: "النهاية" },
                    { id: "space-between", label: "توزيع متساوي" },
                    { id: "space-around", label: "توزيع حول" },
                  ],
                },
                {
                  type: "select", property: "align-items", name: "المحاذاة العمودية",
                  options: [
                    { id: "flex-start", label: "أعلى" },
                    { id: "center", label: "وسط" },
                    { id: "flex-end", label: "أسفل" },
                    { id: "stretch", label: "تمديد" },
                  ],
                },
                { type: "number", property: "gap", name: "المسافة بين العناصر", units: ["px", "%"] },
              ],
            },
            {
              name: "الإطار",
              open: false,
              properties: [
                { type: "number", property: "border-width", name: "سمك الإطار", units: ["px"] },
                {
                  type: "select", property: "border-style", name: "نمط الإطار",
                  options: [
                    { id: "none", label: "بدون" },
                    { id: "solid", label: "خط" },
                    { id: "dashed", label: "متقطع" },
                    { id: "dotted", label: "منقط" },
                    { id: "double", label: "مزدوج" },
                  ],
                },
                { type: "color", property: "border-color", name: "لون الإطار" },
                { type: "number", property: "border-radius", name: "تدوير الزوايا", units: ["px", "%"] },
              ],
            },
          ],
        },

        layerManager: { appendTo: "#invoice-layers-panel" },
        selectorManager: { appendTo: "#invoice-selectors-panel" },
        assetManager: { embedAsBase64: true },
      });

      // Register custom types BEFORE loading content
      registerDataComponentTypes(editor);
      registerInvoiceBlocks(editor);

      // Load editor content
      if (editorProjectData) {
        editor.loadProjectData(editorProjectData);
      } else {
        editor.setComponents(DEFAULT_EDITOR_BODY);
      }

      // Track changes
      editor.on("change:changesCount", () => {
        if (!destroyed) setHasChanges(true);
      });

      // Inject editor theme CSS
      const styleEl = document.createElement("style");
      styleEl.textContent = EDITOR_STYLES;
      editorContainerRef.current?.appendChild(styleEl);

      editorRef.current = editor;
      setLoading(false);
    })();

    return () => {
      destroyed = true;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // === Handlers ===
  const handleSave = async () => {
    setSaving(true);
    try {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor not ready");

      // Convert editor HTML → Handlebars template and save
      const html = getTemplateHTML();
      await saveInvoiceTemplate(html);

      // Save editor project data for restoring later
      await saveEditorProjectData(editor.getProjectData());

      setHasChanges(false);
      toast.success("تم حفظ القالب بنجاح");
    } catch (err) {
      console.error("Save error:", err);
      toast.error("فشل حفظ القالب");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setComponents(DEFAULT_EDITOR_BODY);
    editor.setStyle("");
    setHasChanges(true);
    toast.info("تم استعادة القالب الافتراضي - اضغط حفظ لتأكيد");
  };

  const handlePreview = async () => {
    if (showPreview) { setShowPreview(false); return; }
    try {
      const html = getTemplateHTML();
      const sampleData = getSampleInvoiceData();

      // Load real logo and QR for preview
      let logoBase64: string | null = null;
      try {
        const logoModule = await import("@/assets/images/longtime-logo.png");
        const logoUrl = typeof logoModule.default === "string" ? logoModule.default : null;
        if (logoUrl) {
          if (logoUrl.startsWith("data:")) {
            logoBase64 = logoUrl;
          } else {
            const resp = await fetch(logoUrl);
            const blob = await resp.blob();
            logoBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch (_) { /* no logo available */ }

      let qrCodeBase64: string | null = null;
      try {
        const QRCode = (await import("qrcode")).default;
        qrCodeBase64 = await QRCode.toDataURL("https://longtimelt.com", { width: 100, margin: 1 });
      } catch (_) { /* no QR available */ }

      const compiled = compileInvoiceTemplate(html, { ...sampleData, logoBase64, qrCodeBase64 });
      setPreviewHTML(compiled);
      setShowPreview(true);
    } catch (err: any) {
      toast.error("خطأ في المعاينة: " + (err?.message || ""));
    }
  };

  useEffect(() => {
    if (previewRef.current && previewHTML && showPreview) {
      const doc = previewRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(previewHTML); doc.close(); }
    }
  }, [previewHTML, showPreview]);

  const handleExport = () => {
    const html = getTemplateHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoice-template.html";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير القالب");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".html,.htm";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const editor = editorRef.current;
      if (editor) {
        const { body, css } = parseTemplateForEditor(text);
        editor.setComponents(body);
        editor.setStyle(css);
        setHasChanges(true);
        toast.success("تم استيراد القالب");
      }
    };
    input.click();
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card className="p-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">محرر قالب الفاتورة</h2>
            {hasChanges && <Badge variant="destructive" className="text-xs">تغييرات غير محفوظة</Badge>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Device switching */}
            <div className="flex items-center border rounded-md overflow-hidden ml-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => editorRef.current?.setDevice("A4")} title="A4">
                <Monitor className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => editorRef.current?.setDevice("Tablet")} title="Tablet">
                <Tablet className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => editorRef.current?.setDevice("Mobile")} title="Mobile">
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
            {/* Undo/Redo */}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editorRef.current?.UndoManager.undo()} title="تراجع">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editorRef.current?.UndoManager.redo()} title="إعادة">
              <Redo2 className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={handleImport}><Upload className="h-4 w-4 ml-1" />استيراد</Button>
            <Button variant="ghost" size="sm" onClick={handleExport}><Download className="h-4 w-4 ml-1" />تصدير</Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant={showPreview ? "secondary" : "outline"} size="sm" onClick={handlePreview}>
              <Eye className="h-4 w-4 ml-1" />{showPreview ? "إغلاق المعاينة" : "معاينة"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-4 w-4 ml-1" />القالب الافتراضي</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              <Save className="h-4 w-4 ml-1" />{saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Preview overlay - always mounted, toggled with display */}
      <Card className="p-0 overflow-hidden" style={{ height: "80vh", display: showPreview ? "block" : "none" }}>
        <div className="bg-muted px-4 py-2 flex items-center justify-between border-b">
          <h3 className="font-bold text-sm">معاينة الفاتورة (ببيانات تجريبية)</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>إغلاق</Button>
        </div>
        <iframe ref={previewRef} className="w-full border-0" style={{ height: "calc(80vh - 40px)", background: "#f4f4f4" }} title="معاينة" />
      </Card>

      {/* Editor Layout - always mounted, hidden with CSS when preview is active */}
      <div className="flex gap-0 border rounded-lg overflow-hidden" style={{ height: "78vh", display: showPreview ? "none" : "flex" }}>
        {/* Right sidebar - panels */}
        <div className="w-72 shrink-0 bg-[#1e1e2e] text-white flex flex-col border-l border-[#45475a]" style={{ direction: "rtl" }}>
          <div className="flex border-b border-[#45475a]">
            {(["blocks", "styles", "layers"] as const).map((p) => (
              <button
                key={p}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${activePanel === p ? "bg-[#313244] text-[#89b4fa]" : "text-[#a6adc8] hover:text-white"}`}
                onClick={() => setActivePanel(p)}
              >
                {p === "blocks" ? "العناصر" : p === "styles" ? "التنسيق" : "الطبقات"}
              </button>
            ))}
          </div>
          <div id="invoice-selectors-panel" style={{ display: activePanel === "styles" ? "block" : "none" }} />
          <div className="flex-1 overflow-y-auto">
            <div id="invoice-blocks-panel" style={{ display: activePanel === "blocks" ? "block" : "none" }} />
            <div id="invoice-styles-panel" style={{ display: activePanel === "styles" ? "block" : "none" }} />
            <div id="invoice-layers-panel" style={{ display: activePanel === "layers" ? "block" : "none" }} />
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="text-muted-foreground">جاري تحميل المحرر...</div>
            </div>
          )}
          <div ref={editorContainerRef} className="h-full" />
        </div>
      </div>
    </div>
  );
}

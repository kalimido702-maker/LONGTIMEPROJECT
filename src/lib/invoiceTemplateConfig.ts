/**
 * Invoice Template Storage
 * تخزين قالب HTML الفاتورة في IndexedDB - يتزامن مع السيرفر تلقائياً
 */

import { db, Setting } from "@/shared/lib/indexedDB";
import { DEFAULT_INVOICE_TEMPLATE } from "@/lib/invoiceTemplateEngine";

const SETTING_KEY = "invoice_template_html";
const EDITOR_DATA_KEY = "invoice_template_editor";

/**
 * Load invoice HTML template from IndexedDB settings
 * Returns default template if not found
 */
export async function loadInvoiceTemplate(): Promise<string> {
  try {
    await db.init();
    const setting = await (db as any).get("settings", SETTING_KEY) as Setting | undefined;
    if (setting?.value) {
      return setting.value;
    }
  } catch (error) {
    console.error("Error loading invoice template:", error);
  }
  return DEFAULT_INVOICE_TEMPLATE;
}

/**
 * Save invoice HTML template to IndexedDB settings (auto-syncs via SyncableRepository)
 */
export async function saveInvoiceTemplate(templateHTML: string): Promise<void> {
  await db.init();
  const existing = await (db as any).get("settings", SETTING_KEY) as Setting | undefined;

  if (existing) {
    await (db as any).update("settings", {
      ...existing,
      value: templateHTML,
      category: "receipt" as const,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await (db as any).add("settings", {
      key: SETTING_KEY,
      value: templateHTML,
      category: "receipt" as const,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Load GrapesJS editor project data from IndexedDB
 * Returns null if not found
 */
export async function loadEditorProjectData(): Promise<any | null> {
  try {
    await db.init();
    const setting = await (db as any).get("settings", EDITOR_DATA_KEY) as Setting | undefined;
    if (setting?.value) {
      return JSON.parse(setting.value);
    }
  } catch (error) {
    console.error("Error loading editor project data:", error);
  }
  return null;
}

/**
 * Save GrapesJS editor project data to IndexedDB
 */
export async function saveEditorProjectData(data: any): Promise<void> {
  await db.init();
  const jsonStr = JSON.stringify(data);
  const existing = await (db as any).get("settings", EDITOR_DATA_KEY) as Setting | undefined;

  if (existing) {
    await (db as any).update("settings", {
      ...existing,
      value: jsonStr,
      category: "receipt" as const,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await (db as any).add("settings", {
      key: EDITOR_DATA_KEY,
      value: jsonStr,
      category: "receipt" as const,
      updatedAt: new Date().toISOString(),
    });
  }
}

import { BaseSeeder } from "./Seeder.interface";
import { IndexedDBRepository } from "../IndexedDBRepository";
import { Setting } from "@/domain/entities/Index";

/**
 * SettingsSeeder - إضافة الإعدادات الافتراضية
 */
export class SettingsSeeder extends BaseSeeder {
  name = "SettingsSeeder";

  async shouldRun(repository: IndexedDBRepository<Setting>): Promise<boolean> {
    const count = await repository.count();
    return count === 0;
  }

  async seed(repository: IndexedDBRepository<Setting>): Promise<void> {
    const defaultSettings: Setting[] = [
      {
        key: "company_name",
        value: "MASR POS Pro",
        description: "اسم الشركة",
        category: "company",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "company_phone",
        value: "",
        description: "رقم هاتف الشركة",
        category: "company",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "company_address",
        value: "",
        description: "عنوان الشركة",
        category: "company",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "tax_number",
        value: "",
        description: "الرقم الضريبي",
        category: "tax",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "tax_rate",
        value: "14",
        description: "نسبة الضريبة %",
        category: "tax",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "currency",
        value: "EGP",
        description: "العملة",
        category: "system",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "receipt_footer",
        value: "شكراً لزيارتكم - نتمنى رؤيتكم مرة أخرى",
        description: "نص أسفل الفاتورة",
        category: "receipt",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "receipt_header",
        value: "",
        description: "نص أعلى الفاتورة",
        category: "receipt",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "enable_auto_print",
        value: "false",
        description: "تفعيل الطباعة التلقائية",
        category: "system",
        updatedAt: new Date().toISOString(),
      },
      {
        key: "low_stock_alert",
        value: "10",
        description: "حد التنبيه للمخزون المنخفض",
        category: "system",
        updatedAt: new Date().toISOString(),
      },
    ];

    await repository.batchAdd(defaultSettings);
    this.log(`✅ Created ${defaultSettings.length} default settings`);
  }
}

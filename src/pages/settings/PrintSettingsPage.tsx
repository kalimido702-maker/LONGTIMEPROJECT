import { POSHeader } from "@/components/POS/POSHeader";
import { PrintSettingsTab } from "@/components/settings/PrintSettingsTab";

const PrintSettingsPage = () => {
  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />
      <div className="flex-1 overflow-auto p-6">
        <PrintSettingsTab />
      </div>
    </div>
  );
};

export default PrintSettingsPage;

import { POSHeader } from "@/components/POS/POSHeader";
import { InvoiceTemplateEditor } from "@/components/settings/InvoiceTemplateEditor";

const InvoiceTemplatePage = () => {
  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />
      <div className="flex-1 overflow-hidden">
        <InvoiceTemplateEditor />
      </div>
    </div>
  );
};

export default InvoiceTemplatePage;

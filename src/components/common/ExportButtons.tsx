import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { exportToPDF, exportToExcel } from "@/lib/reportExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportButtonsProps {
  title: string;
  subtitle?: string;
  fileName: string;
  data: any[];
  columns: Array<{ header: string; dataKey: string; width?: number }>;
  summary?: Array<{ label: string; value: string | number }>;
  orientation?: "portrait" | "landscape";
}

export const ExportButtons = ({
  title,
  subtitle,
  fileName,
  data,
  columns,
  summary,
  orientation = "portrait",
}: ExportButtonsProps) => {
  const exportOptions = {
    title,
    subtitle,
    fileName,
    data,
    columns,
    summary,
    orientation,
  };

  const handleExportPDF = () => {
    exportToPDF(exportOptions);
  };

  const handleExportExcel = () => {
    exportToExcel(exportOptions);
  };

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            تصدير
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleExportPDF}
            className="gap-2 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            تصدير PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleExportExcel}
            className="gap-2 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            تصدير Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TABLE_SETTINGS } from "@/lib/constants";

interface DataPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  /** Arabic label for the entity, e.g. "فاتورة", "عميل" */
  entityName: string;
  getVisiblePages: () => number[];
  goToPage: (page: number) => void;
  goToNext: () => void;
  goToPrev: () => void;
  changePageSize: (size: number) => void;
}

export function DataPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  entityName,
  getVisiblePages,
  goToPage,
  goToNext,
  goToPrev,
  changePageSize,
}: DataPaginationProps) {
  if (totalItems === 0) return null;

  const visiblePages = getVisiblePages();

  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">عرض</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(v) => changePageSize(Number(v))}
        >
          <SelectTrigger className="w-[80px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLE_SETTINGS.PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          من أصل {totalItems} {entityName}
        </span>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrev}
            disabled={currentPage === 1}
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </Button>

          {visiblePages[0] > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                className="w-8 h-8 p-0"
              >
                1
              </Button>
              {visiblePages[0] > 2 && (
                <span className="px-1 text-muted-foreground">...</span>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => goToPage(page)}
              className="w-8 h-8 p-0"
            >
              {page}
            </Button>
          ))}

          {visiblePages[visiblePages.length - 1] < totalPages && (
            <>
              {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                <span className="px-1 text-muted-foreground">...</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages)}
                className="w-8 h-8 p-0"
              >
                {totalPages}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={goToNext}
            disabled={currentPage === totalPages}
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

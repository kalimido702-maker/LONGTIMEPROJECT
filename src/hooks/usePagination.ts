import { useState, useMemo, useCallback, useEffect } from "react";
import { TABLE_SETTINGS } from "@/lib/constants";

interface UsePaginationOptions {
  /** Dependencies that should reset the page to 1 when they change */
  resetDeps?: unknown[];
}

export function usePagination<T>(
  items: T[],
  options?: UsePaginationOptions
) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(TABLE_SETTINGS.DEFAULT_PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...(options?.resetDeps || [])]);

  // Also reset when items length changes dramatically (e.g. new data loaded)
  useEffect(() => {
    if (currentPage > 1 && (currentPage - 1) * pageSize >= items.length) {
      setCurrentPage(1);
    }
  }, [items.length, currentPage, pageSize]);

  const totalPages = Math.ceil(items.length / pageSize);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const getVisiblePages = useCallback(() => {
    const maxVisible = TABLE_SETTINGS.MAX_VISIBLE_PAGES;
    const pages: number[] = [];
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)));
  }, [totalPages]);

  const goToNext = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const changePageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    pageSize,
    totalPages,
    paginatedItems,
    totalItems: items.length,
    getVisiblePages,
    goToPage,
    goToNext,
    goToPrev,
    changePageSize,
    setCurrentPage,
  };
}

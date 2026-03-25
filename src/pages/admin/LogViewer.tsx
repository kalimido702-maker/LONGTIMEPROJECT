/**
 * LogViewer - صفحة عرض السجلات المتكاملة
 * Comprehensive log viewer with filtering, search, real-time updates, and export
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ScrollText,
  Search,
  Download,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Skull,
  Pause,
  Play,
  Filter,
  FileJson,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getLoggingService } from '@/infrastructure/logging';
import {
  LogLevel,
  LogCategory,
  type LogEntry,
  type LogFilter,
  type LogStats,
} from '@/infrastructure/logging/types';

// ==================== Constants ====================

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  [LogLevel.DEBUG]: { label: 'تصحيح', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: Bug },
  [LogLevel.INFO]: { label: 'معلومات', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Info },
  [LogLevel.WARN]: { label: 'تحذير', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: AlertTriangle },
  [LogLevel.ERROR]: { label: 'خطأ', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: AlertCircle },
  [LogLevel.FATAL]: { label: 'حرج', color: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200', icon: Skull },
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  [LogCategory.SYNC]: 'المزامنة',
  [LogCategory.DATABASE]: 'قاعدة البيانات',
  [LogCategory.NETWORK]: 'الشبكة',
  [LogCategory.AUTH]: 'المصادقة',
  [LogCategory.UI]: 'الواجهة',
  [LogCategory.POS]: 'نقطة البيع',
  [LogCategory.INVOICE]: 'الفواتير',
  [LogCategory.PAYMENT]: 'المدفوعات',
  [LogCategory.WHATSAPP]: 'الواتساب',
  [LogCategory.SYSTEM]: 'النظام',
  [LogCategory.GENERAL]: 'عام',
  [LogCategory.PRINT]: 'الطباعة',
  [LogCategory.NAVIGATION]: 'التنقل',
  [LogCategory.PERFORMANCE]: 'الأداء',
  [LogCategory.ELECTRON]: 'Electron',
};

const PAGE_SIZE = 100;

// ==================== Component ====================

export default function LogViewer() {
  const { toast } = useToast();
  const logger = getLoggingService();

  // Filter states
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Data states
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // UI states
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showStats, setShowStats] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Build filter
  const currentFilter = useMemo((): LogFilter => {
    const filter: LogFilter = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (levelFilter !== 'all') filter.level = levelFilter as LogLevel;
    if (categoryFilter !== 'all') filter.category = categoryFilter as LogCategory;
    if (debouncedSearch) filter.search = debouncedSearch;
    return filter;
  }, [levelFilter, categoryFilter, debouncedSearch, page]);

  // Load logs
  const loadLogs = useCallback(async (resetPage = false) => {
    setLoading(true);
    try {
      const filter = { ...currentFilter };
      if (resetPage) {
        filter.offset = 0;
        setPage(0);
      }
      const results = await logger.query(filter);
      if (resetPage) {
        setLogs(results);
      } else {
        setLogs(prev => page === 0 ? results : [...prev, ...results]);
      }
      setHasMore(results.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFilter, logger, page]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const s = await logger.getStats();
      setStats(s);
    } catch (err) {
      // ignore
    }
  }, [logger]);

  // Initial load
  useEffect(() => {
    loadLogs(true);
    loadStats();
  }, [levelFilter, categoryFilter, debouncedSearch]);

  // Load more when page changes
  useEffect(() => {
    if (page > 0) loadLogs();
  }, [page]);

  // Real-time updates via subscription
  useEffect(() => {
    if (!autoRefresh) return;

    const unsubscribe = logger.subscribe((entry) => {
      if (!autoRefreshRef.current) return;

      // Check if entry matches current filters
      if (levelFilter !== 'all' && entry.level !== levelFilter) return;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return;
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        const match = entry.message?.toLowerCase().includes(s) ||
          entry.source?.toLowerCase().includes(s);
        if (!match) return;
      }

      // Only add to page 0 view
      if (page === 0) {
        setLogs(prev => [entry, ...prev].slice(0, PAGE_SIZE * (page + 1)));
      }
    });

    return unsubscribe;
  }, [autoRefresh, levelFilter, categoryFilter, debouncedSearch, page, logger]);

  // Periodic stats refresh
  useEffect(() => {
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // ==================== Actions ====================

  const handleClearAll = async () => {
    try {
      await logger.clear();
      setLogs([]);
      setStats(null);
      await loadStats();
      toast({ title: 'تم مسح جميع السجلات بنجاح' });
    } catch {
      toast({ title: 'فشل في مسح السجلات', variant: 'destructive' });
    }
  };

  const handleExportJSON = async () => {
    try {
      const data = await logger.exportLogs();
      downloadFile(data, `logs_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      toast({ title: 'تم تصدير السجلات بنجاح (JSON)' });
    } catch {
      toast({ title: 'فشل في تصدير السجلات', variant: 'destructive' });
    }
  };

  const handleExportCSV = async () => {
    try {
      const data = await logger.exportLogsAsCSV();
      downloadFile(data, `logs_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
      toast({ title: 'تم تصدير السجلات بنجاح (CSV)' });
    } catch {
      toast({ title: 'فشل في تصدير السجلات', variant: 'destructive' });
    }
  };

  const handleRefresh = () => {
    loadLogs(true);
    loadStats();
  };

  const resetFilters = () => {
    setLevelFilter('all');
    setCategoryFilter('all');
    setSearchText('');
    setDebouncedSearch('');
    setPage(0);
  };

  // ==================== Render ====================

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  const formatTimestampShort = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  const hasActiveFilters = levelFilter !== 'all' || categoryFilter !== 'all' || searchText !== '';

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-primary text-primary-foreground px-4 py-3 flex items-center gap-2">
        <ScrollText className="h-5 w-5" />
        <h1 className="text-lg font-bold">سجلات النظام</h1>
        <span className="text-xs opacity-70">Ctrl+Shift+L</span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Stats Cards */}
        {showStats && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <StatsCard
              label="الإجمالي"
              value={stats.total}
              className="bg-background border"
            />
            <StatsCard
              label="تصحيح"
              value={stats.byLevel[LogLevel.DEBUG] || 0}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
            <StatsCard
              label="معلومات"
              value={stats.byLevel[LogLevel.INFO] || 0}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
            />
            <StatsCard
              label="تحذيرات"
              value={stats.byLevel[LogLevel.WARN] || 0}
              className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800"
            />
            <StatsCard
              label="أخطاء"
              value={stats.byLevel[LogLevel.ERROR] || 0}
              className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
            />
            <StatsCard
              label="حرج"
              value={stats.byLevel[LogLevel.FATAL] || 0}
              className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700"
            />
          </div>
        )}

        {/* Toolbar */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث في السجلات..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pr-9"
                />
              </div>

              {/* Level Filter */}
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="المستوى" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المستويات</SelectItem>
                  {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 ml-1" />
                  مسح الفلاتر
                </Button>
              )}

              <div className="flex-1" />

              {/* Action Buttons */}
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                title={autoRefresh ? 'إيقاف التحديث التلقائي' : 'تشغيل التحديث التلقائي'}
              >
                {autoRefresh ? <Pause className="h-4 w-4 ml-1" /> : <Play className="h-4 w-4 ml-1" />}
                {autoRefresh ? 'مباشر' : 'متوقف'}
              </Button>

              <Button variant="outline" size="sm" onClick={() => setShowStats(!showStats)}>
                <BarChart3 className="h-4 w-4 ml-1" />
                {showStats ? 'إخفاء' : 'إحصائيات'}
              </Button>

              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>

              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <FileJson className="h-4 w-4 ml-1" />
                JSON
              </Button>

              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <FileSpreadsheet className="h-4 w-4 ml-1" />
                CSV
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 ml-1" />
                    مسح الكل
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>مسح جميع السجلات؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم حذف جميع سجلات النظام نهائياً. لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      مسح الكل
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Log Table */}
        <Card className="flex-1">
          <div className="overflow-auto max-h-[calc(100vh-350px)]" ref={scrollRef}>
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-[160px]">الوقت</TableHead>
                  <TableHead className="w-[90px]">المستوى</TableHead>
                  <TableHead className="w-[110px]">التصنيف</TableHead>
                  <TableHead>الرسالة</TableHead>
                  <TableHead className="w-[100px]">المصدر</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <ScrollText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p className="text-lg">لا توجد سجلات</p>
                      <p className="text-sm">
                        {hasActiveFilters ? 'جرب تغيير الفلاتر' : 'ستظهر السجلات هنا عند بدء استخدام التطبيق'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log, idx) => {
                    const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG[LogLevel.DEBUG];
                    const LevelIcon = levelCfg.icon;
                    const isExpanded = expandedId === (log.id ?? idx);
                    const hasDetails = log.data || log.stack;

                    return (
                      <React.Fragment key={log.id ?? idx}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 ${
                            log.level === LogLevel.ERROR || log.level === LogLevel.FATAL
                              ? 'bg-red-50/50 dark:bg-red-950/20'
                              : log.level === LogLevel.WARN
                              ? 'bg-yellow-50/30 dark:bg-yellow-950/10'
                              : ''
                          }`}
                          onClick={() => hasDetails && setExpandedId(isExpanded ? null : (log.id ?? idx))}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {formatTimestampShort(log.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${levelCfg.color} gap-1 text-xs font-normal`} variant="secondary">
                              <LevelIcon className="h-3 w-3" />
                              {levelCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {CATEGORY_LABELS[log.category] || log.category}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[500px]">
                            <p className="truncate text-sm">{log.message}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.source || '-'}
                          </TableCell>
                          <TableCell>
                            {hasDetails && (
                              isExpanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded Detail Row */}
                        {isExpanded && hasDetails && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-3">
                              <div className="space-y-2">
                                {/* Full timestamp */}
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">الوقت الكامل: </span>
                                  {formatTimestamp(log.timestamp)}
                                  {log.sessionId && (
                                    <span className="mr-4">
                                      <span className="font-medium">الجلسة: </span>
                                      {log.sessionId}
                                    </span>
                                  )}
                                </div>

                                {/* Data */}
                                {log.data && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">البيانات:</p>
                                    <pre
                                      className="bg-background p-2 rounded text-xs overflow-auto max-h-[300px] border"
                                      dir="ltr"
                                    >
                                      {typeof log.data === 'string'
                                        ? log.data
                                        : JSON.stringify(log.data, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {/* Stack trace */}
                                {log.stack && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Stack Trace:</p>
                                    <pre
                                      className="bg-background p-2 rounded text-xs overflow-auto max-h-[200px] border text-red-600 dark:text-red-400"
                                      dir="ltr"
                                    >
                                      {log.stack}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Load More */}
          {hasMore && logs.length > 0 && (
            <div className="p-3 text-center border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 ml-1 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-1" />
                )}
                تحميل المزيد
              </Button>
              <span className="text-xs text-muted-foreground mr-2">
                ({logs.length} سجل معروض)
              </span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ==================== Helper Components ====================

function StatsCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`rounded-lg p-3 text-center ${className}`}>
      <p className="text-2xl font-bold">{value.toLocaleString('ar-EG')}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ==================== Utility ====================

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

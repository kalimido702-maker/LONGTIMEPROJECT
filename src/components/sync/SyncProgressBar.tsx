/**
 * SyncProgressBar Component
 * Shows a non-intrusive progress bar at the bottom of the screen during sync operations.
 * Displays real-time progress for pull/push/processing phases.
 * Auto-hides when sync is complete.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudDownload, CloudUpload, Loader2, CheckCircle2, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getSmartSync } from '@/infrastructure/sync/SmartSyncManager';
import type { SyncProgressEvent } from '@/infrastructure/sync/SmartSyncManager';

type SyncPhase = 'idle' | 'pulling' | 'pushing' | 'processing' | 'done' | 'error';

interface SyncState {
    phase: SyncPhase;
    message: string;
    current: number;
    total: number;
    recordCount: number;
}

const TABLE_LABELS: Record<string, string> = {
    products: 'المنتجات',
    product_categories: 'الفئات',
    product_units: 'وحدات المنتجات',
    units: 'الوحدات',
    price_types: 'أنواع الأسعار',
    warehouses: 'المخازن',
    customers: 'العملاء',
    suppliers: 'الموردين',
    employees: 'الموظفين',
    supervisors: 'المشرفين',
    sales_reps: 'مندوبين المبيعات',
    users: 'المستخدمين',
    roles: 'الصلاحيات',
    invoices: 'الفواتير',
    invoice_items: 'عناصر الفواتير',
    sales_returns: 'المرتجعات',
    purchases: 'المشتريات',
    purchase_items: 'عناصر المشتريات',
    purchase_returns: 'مرتجعات المشتريات',
    expenses: 'المصروفات',
    expense_categories: 'فئات المصروفات',
    expense_items: 'عناصر المصروفات',
    deposits: 'الإيداعات',
    deposit_sources: 'مصادر الإيداعات',
    payments: 'المدفوعات',
    payment_methods: 'طرق الدفع',
    shifts: 'الورديات',
    settings: 'الإعدادات',
    audit_logs: 'سجل المراجعة',
};

export function SyncProgressBar() {
    const [state, setState] = useState<SyncState>({
        phase: 'idle',
        message: '',
        current: 0,
        total: 0,
        recordCount: 0,
    });
    const [dismissed, setDismissed] = useState(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasDataRef = useRef(false);

    const handleProgress = useCallback((event: SyncProgressEvent) => {
        // Only show the bar when there's actual data being synced
        if (event.recordCount && event.recordCount > 0) {
            hasDataRef.current = true;
        }
        if (!hasDataRef.current) return;

        setDismissed(false);
        // Clear any pending hide timer
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }

        const tableLabel = event.table ? (TABLE_LABELS[event.table] || event.table) : '';
        let message = event.message;
        if (event.phase === 'pulling' && event.table && event.current && event.total) {
            message = `جاري تحميل ${tableLabel} (${event.current}/${event.total})`;
            if (event.recordCount) {
                message += ` — ${event.recordCount} سجل`;
            }
        } else if (event.phase === 'pushing' && event.current && event.total) {
            message = `جاري رفع البيانات (${event.current}/${event.total})`;
            if (event.recordCount) {
                message += ` — ${event.recordCount} سجل`;
            }
        }

        setState({
            phase: event.phase,
            message,
            current: event.current || 0,
            total: event.total || 0,
            recordCount: event.recordCount || 0,
        });
    }, []);

    const handleStatusChange = useCallback((status: string) => {
        if (status === 'pulling') {
            // Reset data flag at start of sync cycle
            hasDataRef.current = false;
            // Don't show bar yet - wait for actual progress with records
        } else if (status === 'pushing') {
            // Don't show bar yet - wait for actual progress with records
        } else if (status === 'idle' || status === 'offline') {
            // Only show "done" if actual data was synced
            if (hasDataRef.current) {
                setState(prev => {
                    if (prev.phase === 'pulling' || prev.phase === 'pushing' || prev.phase === 'processing') {
                        return {
                            ...prev,
                            phase: 'done',
                            message: `تمت المزامنة بنجاح${prev.recordCount > 0 ? ` — ${prev.recordCount} سجل` : ''}`,
                        };
                    }
                    return prev;
                });
                // Auto-hide after 3 seconds
                hideTimerRef.current = setTimeout(() => {
                    setState({ phase: 'idle', message: '', current: 0, total: 0, recordCount: 0 });
                    hasDataRef.current = false;
                }, 3000);
            } else {
                // No data was synced, just reset silently
                setState({ phase: 'idle', message: '', current: 0, total: 0, recordCount: 0 });
            }
        } else if (status === 'error') {
            setState(prev => ({
                ...prev,
                phase: 'error',
                message: 'حدث خطأ أثناء المزامنة',
            }));
            // Auto-hide after 5 seconds
            hideTimerRef.current = setTimeout(() => {
                setState({ phase: 'idle', message: '', current: 0, total: 0, recordCount: 0 });
            }, 5000);
        }
    }, []);

    useEffect(() => {
        let syncManager: ReturnType<typeof getSmartSync> | null = null;

        // Small delay to ensure infrastructure is initialized
        const initTimer = setTimeout(() => {
            try {
                syncManager = getSmartSync();
                syncManager.on('syncProgress', handleProgress);
                syncManager.on('statusChange', handleStatusChange);
            } catch {
                // SmartSync not initialized yet, retry later
                const retryTimer = setTimeout(() => {
                    try {
                        syncManager = getSmartSync();
                        syncManager.on('syncProgress', handleProgress);
                        syncManager.on('statusChange', handleStatusChange);
                    } catch {
                        // Still not ready - will just not show progress
                    }
                }, 3000);
                return () => clearTimeout(retryTimer);
            }
        }, 500);

        return () => {
            clearTimeout(initTimer);
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
            }
            if (syncManager) {
                syncManager.off('syncProgress', handleProgress);
                syncManager.off('statusChange', handleStatusChange);
            }
        };
    }, [handleProgress, handleStatusChange]);

    // Don't render if idle or dismissed
    if (state.phase === 'idle' || dismissed) {
        return null;
    }

    const progressPercent = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

    const phaseConfig = {
        pulling: {
            icon: <CloudDownload className="h-4 w-4 animate-bounce" />,
            gradient: 'from-blue-600 to-blue-700',
            progressBg: 'bg-blue-400',
        },
        pushing: {
            icon: <CloudUpload className="h-4 w-4 animate-bounce" />,
            gradient: 'from-indigo-600 to-indigo-700',
            progressBg: 'bg-indigo-400',
        },
        processing: {
            icon: <Loader2 className="h-4 w-4 animate-spin" />,
            gradient: 'from-amber-600 to-amber-700',
            progressBg: 'bg-amber-400',
        },
        done: {
            icon: <CheckCircle2 className="h-4 w-4" />,
            gradient: 'from-green-600 to-green-700',
            progressBg: 'bg-green-400',
        },
        error: {
            icon: <X className="h-4 w-4" />,
            gradient: 'from-red-600 to-red-700',
            progressBg: 'bg-red-400',
        },
    };

    const config = phaseConfig[state.phase as keyof typeof phaseConfig] || phaseConfig.pulling;

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r ${config.gradient} text-white shadow-lg transition-all duration-300 ease-in-out`}
            dir="rtl"
        >
            <div className="container mx-auto px-4 py-2">
                <div className="flex items-center justify-between gap-3">
                    {/* Icon and Message */}
                    <div className="flex items-center gap-2 min-w-0">
                        {config.icon}
                        <span className="text-sm font-medium truncate">
                            {state.message}
                        </span>
                    </div>

                    {/* Progress Bar (when we have total) */}
                    {state.total > 0 && state.phase !== 'done' && (
                        <div className="flex items-center gap-2 flex-shrink-0 w-48">
                            <Progress
                                value={progressPercent}
                                className={`h-1.5 ${config.progressBg} flex-1`}
                            />
                            <span className="text-xs whitespace-nowrap opacity-80">
                                {progressPercent}%
                            </span>
                        </div>
                    )}

                    {/* Dismiss button */}
                    {state.phase === 'done' && (
                        <button
                            onClick={() => setDismissed(true)}
                            className="text-white/70 hover:text-white p-1 rounded transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SyncProgressBar;

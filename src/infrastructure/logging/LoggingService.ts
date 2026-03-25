/**
 * LoggingService - نظام تسجيل شامل ومتكامل
 * Comprehensive local logging system
 * 
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, FATAL)
 * - Multiple categories (SYNC, DATABASE, NETWORK, AUTH, UI, POS, etc.)
 * - IndexedDB persistence (separate database)
 * - Console interception (captures all console.log/warn/error)
 * - Global error capturing (window.onerror, unhandledrejection)
 * - Auto-cleanup of old logs
 * - Export functionality
 * - In-memory buffer for batching writes
 * - Singleton pattern
 */

import { LogStore } from './LogStore';
import {
  LogEntry,
  LogFilter,
  LogLevel,
  LogCategory,
  LogStats,
  LoggingConfig,
  DEFAULT_LOGGING_CONFIG,
  LOG_LEVEL_PRIORITY,
  LogListener,
} from './types';

class LoggingService {
  private static instance: LoggingService | null = null;

  private store: LogStore;
  private config: LoggingConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string;
  private initialized = false;
  private listeners: Set<LogListener> = new Set();

  // Keep references to original console methods
  private originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  private constructor(config?: Partial<LoggingConfig>) {
    this.config = { ...DEFAULT_LOGGING_CONFIG, ...config };
    this.store = new LogStore();
    this.sessionId = this.generateSessionId();
  }

  static getInstance(config?: Partial<LoggingConfig>): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService(config);
    }
    return LoggingService.instance;
  }

  /**
   * Initialize the logging service
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.store.init();
      this.initialized = true;

      // Setup auto-cleanup
      this.scheduleCleanup();

      // Setup console interception
      if (this.config.interceptConsole) {
        this.interceptConsole();
      }

      // Setup global error capturing
      if (this.config.captureGlobalErrors) {
        this.captureGlobalErrors();
      }

      // Log the initialization itself
      this.info(LogCategory.SYSTEM, 'نظام التسجيل تم تهيئته بنجاح', {
        config: this.config,
        sessionId: this.sessionId,
      });
    } catch (err) {
      this.originalConsole.error('[LoggingService] Failed to initialize:', err);
    }
  }

  // ========== Core Logging Methods ==========

  debug(category: LogCategory, message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, category, message, data, source);
  }

  info(category: LogCategory, message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, category, message, data, source);
  }

  warn(category: LogCategory, message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, category, message, data, source);
  }

  error(category: LogCategory, message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, category, message, data, source);
  }

  fatal(category: LogCategory, message: string, data?: any, source?: string): void {
    this.log(LogLevel.FATAL, category, message, data, source);
  }

  /**
   * Log with explicit level
   */
  log(level: LogLevel, category: LogCategory, message: string, data?: any, source?: string): void {
    // Check minimum level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data !== undefined ? this.safeSerialize(data) : undefined,
      source,
      stack: level === LogLevel.ERROR || level === LogLevel.FATAL ? new Error().stack : undefined,
      sessionId: this.sessionId,
    };

    // Notify real-time listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore listener errors
      }
    }

    // Buffer for batch write
    this.buffer.push(entry);
    this.scheduleFlush();
  }

  // ========== Query Methods ==========

  async query(filter: LogFilter = {}): Promise<LogEntry[]> {
    await this.flush();
    return this.store.query(filter);
  }

  async getStats(): Promise<LogStats> {
    await this.flush();
    return this.store.getStats();
  }

  async count(level?: LogLevel): Promise<number> {
    await this.flush();
    return this.store.count(level);
  }

  // ========== Management Methods ==========

  async clear(): Promise<void> {
    this.buffer = [];
    await this.store.clear();
    this.info(LogCategory.SYSTEM, 'تم مسح جميع السجلات');
  }

  async exportLogs(): Promise<string> {
    await this.flush();
    const logs = await this.store.exportAll();
    return JSON.stringify(logs, null, 2);
  }

  async exportLogsAsCSV(): Promise<string> {
    await this.flush();
    const logs = await this.store.exportAll();
    const headers = ['timestamp', 'level', 'category', 'message', 'source', 'data', 'stack'];
    const rows = logs.map(log => headers.map(h => {
      const val = (log as any)[h];
      if (val === undefined || val === null) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Escape CSV
      return `"${str.replace(/"/g, '""')}"`;
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Subscribe to real-time log entries
   */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ========== Console Interception ==========

  private interceptConsole(): void {
    const self = this;

    console.log = function (...args: any[]) {
      if (self.config.mirrorToConsole) {
        self.originalConsole.log(...args);
      }
      self.captureConsoleCall(LogLevel.DEBUG, args);
    };

    console.info = function (...args: any[]) {
      if (self.config.mirrorToConsole) {
        self.originalConsole.info(...args);
      }
      self.captureConsoleCall(LogLevel.INFO, args);
    };

    console.warn = function (...args: any[]) {
      if (self.config.mirrorToConsole) {
        self.originalConsole.warn(...args);
      }
      self.captureConsoleCall(LogLevel.WARN, args);
    };

    console.error = function (...args: any[]) {
      if (self.config.mirrorToConsole) {
        self.originalConsole.error(...args);
      }
      self.captureConsoleCall(LogLevel.ERROR, args);
    };

    console.debug = function (...args: any[]) {
      if (self.config.mirrorToConsole) {
        self.originalConsole.debug(...args);
      }
      self.captureConsoleCall(LogLevel.DEBUG, args);
    };
  }

  private captureConsoleCall(level: LogLevel, args: any[]): void {
    if (!this.initialized) return;

    // Build message from first arg
    const message = args.length > 0 ? this.formatArg(args[0]) : '';
    const data = args.length > 1 ? args.slice(1).map(a => this.safeSerialize(a)) : undefined;

    // Try to detect category from console message prefixes
    const category = this.detectCategory(message);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data && data.length === 1 ? data[0] : data,
      source: 'console',
      sessionId: this.sessionId,
    };

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore
      }
    }

    this.buffer.push(entry);
    this.scheduleFlush();
  }

  /**
   * Detect log category from message content
   */
  private detectCategory(message: string): LogCategory {
    const msg = message.toLowerCase();
    if (msg.includes('[sync') || msg.includes('sync ') || msg.includes('مزامنة'))
      return LogCategory.SYNC;
    if (msg.includes('[db') || msg.includes('database') || msg.includes('indexeddb') || msg.includes('قاعدة'))
      return LogCategory.DATABASE;
    if (msg.includes('[network') || msg.includes('fetch') || msg.includes('api') || msg.includes('http') || msg.includes('websocket') || msg.includes('ws '))
      return LogCategory.NETWORK;
    if (msg.includes('[auth') || msg.includes('login') || msg.includes('دخول') || msg.includes('ترخيص') || msg.includes('license'))
      return LogCategory.AUTH;
    if (msg.includes('[pos') || msg.includes('نقطة البيع') || msg.includes('cart'))
      return LogCategory.POS;
    if (msg.includes('فاتور') || msg.includes('invoice'))
      return LogCategory.INVOICE;
    if (msg.includes('دفع') || msg.includes('payment') || msg.includes('قبض') || msg.includes('collection'))
      return LogCategory.PAYMENT;
    if (msg.includes('whatsapp') || msg.includes('واتساب'))
      return LogCategory.WHATSAPP;
    if (msg.includes('[print') || msg.includes('طباعة') || msg.includes('printer'))
      return LogCategory.PRINT;
    if (msg.includes('electron') || msg.includes('[main]'))
      return LogCategory.ELECTRON;
    if (msg.includes('navigate') || msg.includes('route') || msg.includes('tab'))
      return LogCategory.NAVIGATION;
    return LogCategory.GENERAL;
  }

  // ========== Global Error Capturing ==========

  private captureGlobalErrors(): void {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.log(LogLevel.ERROR, LogCategory.SYSTEM, event.message || 'Unhandled error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: 'window.onerror',
      }, event.filename);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      this.log(LogLevel.ERROR, LogCategory.SYSTEM, `Unhandled Promise Rejection: ${message}`, {
        type: 'unhandledrejection',
        stack,
      });
    });

    // Capture network errors via performance observer
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'resource') {
              const resource = entry as PerformanceResourceTiming;
              // Log failed network requests (transferSize 0 usually means failure for non-cached)
              if (resource.transferSize === 0 && resource.decodedBodySize === 0 && resource.duration > 0) {
                // Only log API calls, not static assets
                if (resource.name.includes('/api/') || resource.name.includes('/sync/')) {
                  this.debug(LogCategory.NETWORK, `Resource loaded: ${resource.name}`, {
                    duration: Math.round(resource.duration),
                    size: resource.transferSize,
                  });
                }
              }
            }
          }
        });
        observer.observe({ entryTypes: ['resource'] });
      } catch {
        // PerformanceObserver not supported in all contexts
      }
    }
  }

  // ========== Buffer Management ==========

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    // Flush every 500ms or when buffer reaches 50 entries
    if (this.buffer.length >= 50) {
      this.flush();
    } else {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, 500);
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.initialized) return;

    const batch = [...this.buffer];
    this.buffer = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      await this.store.addBatch(batch);
    } catch (err) {
      // Put entries back in buffer if write failed
      this.buffer = [...batch, ...this.buffer];
      this.originalConsole.error('[LoggingService] Failed to flush logs:', err);
    }
  }

  // ========== Cleanup ==========

  private scheduleCleanup(): void {
    // Run cleanup on init and then every hour
    this.runCleanup();
    setInterval(() => this.runCleanup(), 60 * 60 * 1000);
  }

  private async runCleanup(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
      const cutoffStr = cutoffDate.toISOString();

      const deleted = await this.store.deleteOlderThan(cutoffStr);
      if (deleted > 0) {
        this.originalConsole.log(`[LoggingService] Cleaned up ${deleted} old log entries`);
      }

      // Also enforce max entries
      const trimmed = await this.store.enforceMaxEntries(this.config.maxEntries);
      if (trimmed > 0) {
        this.originalConsole.log(`[LoggingService] Trimmed ${trimmed} excess log entries`);
      }
    } catch (err) {
      this.originalConsole.error('[LoggingService] Cleanup failed:', err);
    }
  }

  // ========== Utilities ==========

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatArg(arg: any): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  private safeSerialize(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return data;
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    }
    try {
      // Deep clone with depth limit to avoid circular references
      const seen = new WeakSet();
      return JSON.parse(JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        // Truncate very long strings
        if (typeof value === 'string' && value.length > 1000) {
          return value.substring(0, 1000) + '... [truncated]';
        }
        return value;
      }));
    } catch {
      return String(data);
    }
  }

  /**
   * Get the original console (for internal use / bypassing interception)
   */
  getOriginalConsole() {
    return this.originalConsole;
  }
}

// Export singleton getter
export function getLoggingService(config?: Partial<LoggingConfig>): LoggingService {
  return LoggingService.getInstance(config);
}

export { LoggingService };

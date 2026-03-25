/**
 * Logging System Types
 * نظام تسجيل شامل لكل عمليات التطبيق
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export enum LogCategory {
  SYNC = 'SYNC',
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  UI = 'UI',
  POS = 'POS',
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  WHATSAPP = 'WHATSAPP',
  SYSTEM = 'SYSTEM',
  GENERAL = 'GENERAL',
  PRINT = 'PRINT',
  NAVIGATION = 'NAVIGATION',
  PERFORMANCE = 'PERFORMANCE',
  ELECTRON = 'ELECTRON',
}

export interface LogEntry {
  id?: number;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  source?: string;
  stack?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface LogFilter {
  level?: LogLevel | LogLevel[];
  category?: LogCategory | LogCategory[];
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byCategory: Record<LogCategory, number>;
  oldestEntry?: string;
  newestEntry?: string;
}

export interface LoggingConfig {
  /** Maximum number of log entries to keep */
  maxEntries: number;
  /** Days to retain logs before auto-cleanup */
  retentionDays: number;
  /** Minimum level to store (everything below is ignored) */
  minLevel: LogLevel;
  /** Whether to intercept console.* calls */
  interceptConsole: boolean;
  /** Whether to capture global errors */
  captureGlobalErrors: boolean;
  /** Whether to log to browser console as well */
  mirrorToConsole: boolean;
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  maxEntries: 50000,
  retentionDays: 7,
  minLevel: LogLevel.DEBUG,
  interceptConsole: true,
  captureGlobalErrors: true,
  mirrorToConsole: true,
};

export type LogListener = (entry: LogEntry) => void;

/** Numeric priority for log levels (higher = more severe) */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

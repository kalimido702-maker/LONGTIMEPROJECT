import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency - rounds to whole numbers (no decimals)
 * @param amount - The amount to format
 * @param currency - The currency symbol (default: EGP)
 */
export function formatCurrency(amount: number, currency: string = "EGP"): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ${currency}`;
}

/**
 * Format a number as amount - rounds to whole numbers (no decimals)
 * @param amount - The amount to format
 */
export function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString("ar-EG");
}

/**
 * Get today's date as YYYY-MM-DD string using local timezone (Africa/Cairo).
 * Unlike `new Date().toISOString().split('T')[0]` which uses UTC,
 * this correctly returns the current day in Egypt timezone even between
 * midnight and 2 AM Cairo time.
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

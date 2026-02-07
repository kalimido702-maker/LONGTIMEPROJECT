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

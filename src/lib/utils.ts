import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a date string from the database treating it as UTC pure.
 * This prevents timezone offset issues where dates appear one day behind.
 * @param dateStr - Date string in YYYY-MM-DD format from database
 * @returns Date object representing the date at midnight UTC, adjusted for local display
 */
export function parseDateUTC(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // Add T00:00:00 to treat the date as midnight UTC and avoid timezone shifts
  return parseISO(dateStr + 'T00:00:00');
}

/**
 * Formats a date string from the database for display in PT-BR format.
 * Handles timezone offset issues by treating the date as UTC pure.
 * @param dateStr - Date string in YYYY-MM-DD format from database
 * @param formatStr - date-fns format string (default: "dd/MM/yyyy")
 * @returns Formatted date string or null if input is invalid
 */
export function formatDateBR(
  dateStr: string | null | undefined, 
  formatStr: string = "dd/MM/yyyy"
): string | null {
  const date = parseDateUTC(dateStr);
  if (!date) return null;
  return format(date, formatStr, { locale: ptBR });
}

/**
 * Formats a date string with a fallback value for null/undefined dates.
 * @param dateStr - Date string in YYYY-MM-DD format from database
 * @param formatStr - date-fns format string (default: "dd/MM/yyyy")
 * @param fallback - Value to return if date is null/undefined (default: "-")
 * @returns Formatted date string or fallback value
 */
export function formatDateBRWithFallback(
  dateStr: string | null | undefined,
  formatStr: string = "dd/MM/yyyy",
  fallback: string = "-"
): string {
  return formatDateBR(dateStr, formatStr) ?? fallback;
}

/**
 * Applies a DD/MM/YYYY mask while the user types.
 * Accepts any input, strips non-digits, slices to 8 digits, and inserts slashes.
 */
export function maskDateBR(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length >= 3) parts[1] = digits.slice(2, 4);
  if (digits.length >= 5) parts[2] = digits.slice(4, 8);
  return parts.filter(Boolean).join('/');
}

/**
 * Converts an ISO date (YYYY-MM-DD) coming from the database into the BR mask (DD/MM/YYYY).
 * Returns empty string when input is missing or malformed.
 */
export function isoToBrDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const match = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

/**
 * Converts a BR-masked date (DD/MM/YYYY or 8-digit DDMMYYYY) into the ISO format expected by the database.
 * Returns empty string when the value is incomplete or invalid (basic range validation).
 */
export function brDateToIso(br: string | null | undefined): string {
  if (!br) return '';
  const digits = String(br).replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const dd = Number(d), mm = Number(m), yy = Number(y);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 1900) return '';
  return `${y}-${m}-${d}`;
}

/**
 * Applies CPF mask (000.000.000-00) progressively while typing.
 * Accepts any input, keeps only digits (max 11), then formats.
 */
export function maskCPF(value: string): string {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Applies PIS mask (000.00000.00-0) progressively while typing.
 */
export function maskPIS(value: string): string {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 8) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`;
}

/** Strips all non-digit characters. */
export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

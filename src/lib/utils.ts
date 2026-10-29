import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹1,23,456.00 (Indian digit grouping). */
export const formatINR = (n: number, opts?: { whole?: boolean }) => (opts?.whole ? inr0 : inr).format(n);

export const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));

/** Amount in words, Indian system, for A4 tax invoices. */
export function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`);
  const three = (x: number) =>
    [x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred` : "", two(x % 100)].filter(Boolean).join(" ");

  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  let out = `${parts.join(" ")} Rupees`;
  if (paise) out += ` and ${two(paise)} Paise`;
  return `${out} Only`;
}

/** Indian financial year label for a date, e.g. 2026-27. */
export function financialYear(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

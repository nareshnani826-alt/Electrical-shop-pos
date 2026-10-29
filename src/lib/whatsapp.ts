import { formatINR } from "@/lib/utils";
import type { Customer, LedgerEntry } from "@/types/database.types";

/** Indian mobile → wa.me international form (91XXXXXXXXXX). */
export function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

export function buildReminderText(opts: {
  shopName: string;
  customer: Pick<Customer, "name" | "balance">;
  last?: Pick<LedgerEntry, "amount" | "entry_type" | "note" | "created_at"> | null;
  upiUri?: string | null;
}): string {
  const { shopName, customer, last, upiUri } = opts;
  const lines = [
    `Namaste ${customer.name} ji,`,
    ``,
    `Your current Khata balance at *${shopName}* is *${formatINR(Number(customer.balance))}*.`,
  ];
  if (last) {
    const when = new Date(last.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const what = last.entry_type === "payment" ? "Payment received" : "Last purchase";
    lines.push(`${what}: ${formatINR(Math.abs(Number(last.amount)))} on ${when}${last.note ? ` (${last.note})` : ""}.`);
  }
  if (upiUri) lines.push(``, `Pay by UPI: ${upiUri}`);
  lines.push(``, `Kindly clear the dues at your earliest convenience. Thank you!`);
  return lines.join("\n");
}

export function waLink(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

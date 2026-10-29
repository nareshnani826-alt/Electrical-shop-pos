// NPCI UPI deep-link (upi://pay) builder. Spec: NPCI UPI Linking Specification v1.6.

export interface UpiParams {
  vpa: string; // pa – payee VPA
  payeeName: string; // pn
  amount?: number; // am – rupees, 2 dp; omitted lets the payer type it
  note?: string; // tn
  txnRef?: string; // tr – our invoice no., shown in the shop's bank statement
}

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/;

export function isValidVpa(vpa: string) {
  return VPA_RE.test(vpa);
}

export function buildUpiUri({ vpa, payeeName, amount, note, txnRef }: UpiParams): string {
  if (!isValidVpa(vpa)) throw new Error(`Invalid UPI ID: ${vpa}`);
  if (amount != null && (!Number.isFinite(amount) || amount <= 0 || amount > 100000)) {
    throw new Error("UPI amount must be between ₹0.01 and ₹1,00,000");
  }
  // UPI apps are picky: encode values but keep '@' in pa readable.
  const enc = (s: string) => encodeURIComponent(s.slice(0, 80));
  const parts = [`pa=${vpa}`, `pn=${enc(payeeName)}`, "cu=INR"];
  if (amount != null) parts.push(`am=${amount.toFixed(2)}`);
  if (txnRef) parts.push(`tr=${enc(txnRef.replace(/[^A-Za-z0-9\-/]/g, ""))}`);
  if (note) parts.push(`tn=${enc(note)}`);
  return `upi://pay?${parts.join("&")}`;
}

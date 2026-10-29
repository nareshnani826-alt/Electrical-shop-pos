// GST math for the counter preview. The server (complete_sale in 0001_init.sql) recomputes
// with the identical algorithm and is the source of truth for the saved invoice.
// All arithmetic is done in integer paise to avoid float drift.

export type TaxMode = "intra" | "inter"; // intra-state → CGST+SGST, inter-state → IGST

export interface TaxLineInput {
  rate: number; // ₹ per sold unit
  qty: number; // sold units (may be fractional for metres)
  gstRate: number; // 0 | 5 | 12 | 18 | 28
  priceIncludesTax: boolean;
}

export interface TaxLine {
  amount: number; // ₹ rate × qty as entered
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface TaxSummary {
  lines: TaxLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  rawTotal: number;
  roundOff: number;
  grandTotal: number;
  /** Per-rate breakup for the HSN/tax table on the invoice. */
  byRate: { gstRate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

/** Round half away from zero, tolerant of binary float noise (e.g. 1234.4999999). */
export function roundPaise(x: number): number {
  const sign = x < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(x) + 1e-7);
}

export const toPaise = (rupees: number) => roundPaise(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

export function calcLine(input: TaxLineInput, mode: TaxMode, applyTax = true): TaxLine {
  const amount = roundPaise(toPaise(input.rate) * input.qty);
  let taxable: number;
  let tax: number;
  if (!applyTax || input.gstRate === 0) {
    taxable = amount;
    tax = 0;
  } else if (input.priceIncludesTax) {
    taxable = roundPaise((amount * 100) / (100 + input.gstRate));
    tax = amount - taxable;
  } else {
    taxable = amount;
    tax = roundPaise((amount * input.gstRate) / 100);
  }
  const cgst = mode === "intra" ? roundPaise(tax / 2) : 0;
  const sgst = mode === "intra" ? tax - cgst : 0;
  const igst = mode === "inter" ? tax : 0;
  return {
    amount: toRupees(amount),
    taxable: toRupees(taxable),
    cgst: toRupees(cgst),
    sgst: toRupees(sgst),
    igst: toRupees(igst),
    total: toRupees(taxable + tax),
  };
}

/** applyTax=false for Non-GST estimate memos: amounts are billed as entered with no tax split. */
export function calcInvoice(inputs: TaxLineInput[], mode: TaxMode, applyTax = true): TaxSummary {
  const lines = inputs.map((i) => calcLine(i, mode, applyTax));
  const sum = (k: keyof TaxLine) => lines.reduce((s, l) => s + toPaise(l[k]), 0);
  const taxable = sum("taxable");
  const cgst = sum("cgst");
  const sgst = sum("sgst");
  const igst = sum("igst");
  const raw = taxable + cgst + sgst + igst;
  const grand = roundPaise(raw / 100) * 100;

  const rates = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  lines.forEach((l, i) => {
    const r = applyTax ? inputs[i].gstRate : 0;
    const acc = rates.get(r) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    acc.taxable += toPaise(l.taxable);
    acc.cgst += toPaise(l.cgst);
    acc.sgst += toPaise(l.sgst);
    acc.igst += toPaise(l.igst);
    rates.set(r, acc);
  });

  return {
    lines,
    taxable: toRupees(taxable),
    cgst: toRupees(cgst),
    sgst: toRupees(sgst),
    igst: toRupees(igst),
    rawTotal: toRupees(raw),
    roundOff: toRupees(grand - raw),
    grandTotal: toRupees(grand),
    byRate: [...rates.entries()]
      .sort(([a], [b]) => a - b)
      .map(([gstRate, v]) => ({
        gstRate,
        taxable: toRupees(v.taxable),
        cgst: toRupees(v.cgst),
        sgst: toRupees(v.sgst),
        igst: toRupees(v.igst),
      })),
  };
}

/** Standard HSN chapters for electrical retail, used for defaults and validation hints. */
export const HSN_PRESETS = [
  { code: "8544", label: "Insulated wire & cable", gstRate: 18 },
  { code: "8536", label: "Switches, sockets, MCB, fuses (≤1000V)", gstRate: 18 },
  { code: "8538", label: "Boards, panels, enclosures", gstRate: 18 },
  { code: "9405", label: "LED luminaires & fittings", gstRate: 18 },
  { code: "8539", label: "LED lamps / bulbs", gstRate: 18 },
  { code: "3917", label: "PVC conduit pipes & fittings", gstRate: 18 },
  { code: "8414", label: "Fans", gstRate: 18 },
] as const;

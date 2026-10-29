"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { calcInvoice, type TaxSummary } from "@/lib/gst-calculator";
import { sellUnits, unitRate, type MetalIndex } from "@/lib/pricing";
import type { Customer, InvoiceKind, PriceTier, Product } from "@/types/database.types";

export interface CartLine {
  key: string;
  product: Product;
  unitIndex: number; // into sellUnits(product)
  qty: number;
  rate: number; // ₹ per sold unit
  rateOverridden: boolean; // cashier-negotiated rate: survives tier/unit/metal repricing
}

export type CartCustomer = Pick<Customer, "id" | "name" | "phone" | "type" | "balance" | "credit_limit" | "gstin">;

interface CartState {
  lines: CartLine[];
  selected: number;
  tier: PriceTier;
  customer: CartCustomer | null;
  kind: InvoiceKind;
  interState: boolean;
  metalIndex: MetalIndex; // live, not persisted

  addProduct: (p: Product, qty?: number, unitIndex?: number) => void;
  setQty: (i: number, qty: number) => void;
  setRate: (i: number, rate: number) => void;
  cycleUnit: (i?: number) => void;
  removeLine: (i?: number) => void;
  select: (i: number) => void;
  moveSelection: (delta: number) => void;
  setTier: (tier: PriceTier) => void;
  setCustomer: (c: CartCustomer | null) => void;
  setKind: (k: InvoiceKind) => void;
  setInterState: (v: boolean) => void;
  setMetalIndex: (idx: MetalIndex) => void;
  clear: () => void;
}

const priceLine = (l: CartLine, tier: PriceTier, idx: MetalIndex): CartLine =>
  l.rateOverridden ? l : { ...l, rate: unitRate(l.product, tier, sellUnits(l.product)[l.unitIndex], idx) };

const clampSel = (sel: number, len: number) => Math.max(0, Math.min(sel, len - 1));

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      selected: 0,
      tier: "retail",
      customer: null,
      kind: "tax_invoice",
      interState: false,
      metalIndex: {},

      addProduct: (p, qty = 1, unitIndex = 0) =>
        set((s) => {
          const existing = s.lines.findIndex((l) => l.product.id === p.id && l.unitIndex === unitIndex);
          if (existing >= 0) {
            const lines = s.lines.slice();
            lines[existing] = { ...lines[existing], qty: lines[existing].qty + qty };
            return { lines, selected: existing };
          }
          const units = sellUnits(p);
          const ui = Math.min(unitIndex, units.length - 1);
          const line: CartLine = {
            key: crypto.randomUUID(),
            product: p,
            unitIndex: ui,
            qty,
            rate: unitRate(p, s.tier, units[ui], s.metalIndex),
            rateOverridden: false,
          };
          return { lines: [...s.lines, line], selected: s.lines.length };
        }),

      setQty: (i, qty) =>
        set((s) => {
          if (!s.lines[i] || !Number.isFinite(qty)) return s;
          if (qty <= 0) {
            const lines = s.lines.filter((_, j) => j !== i);
            return { lines, selected: clampSel(s.selected, lines.length) };
          }
          const lines = s.lines.slice();
          lines[i] = { ...lines[i], qty: Math.round(qty * 1000) / 1000 };
          return { lines };
        }),

      setRate: (i, rate) =>
        set((s) => {
          if (!s.lines[i] || !Number.isFinite(rate) || rate < 0) return s;
          const lines = s.lines.slice();
          lines[i] = { ...lines[i], rate: Math.round(rate * 100) / 100, rateOverridden: true };
          return { lines };
        }),

      cycleUnit: (i = get().selected) =>
        set((s) => {
          const l = s.lines[i];
          if (!l) return s;
          const units = sellUnits(l.product);
          if (units.length < 2) return s;
          const lines = s.lines.slice();
          // Switching unit invalidates a negotiated per-unit rate.
          lines[i] = priceLine({ ...l, unitIndex: (l.unitIndex + 1) % units.length, rateOverridden: false }, s.tier, s.metalIndex);
          return { lines };
        }),

      removeLine: (i = get().selected) =>
        set((s) => {
          const lines = s.lines.filter((_, j) => j !== i);
          return { lines, selected: clampSel(s.selected, lines.length) };
        }),

      select: (i) => set((s) => ({ selected: clampSel(i, s.lines.length) })),
      moveSelection: (d) => set((s) => ({ selected: clampSel(s.selected + d, s.lines.length) })),

      setTier: (tier) => set((s) => ({ tier, lines: s.lines.map((l) => priceLine(l, tier, s.metalIndex)) })),

      setCustomer: (customer) =>
        set((s) => {
          // Electricians/contractors get trade price; clearing the customer drops back to walk-in retail.
          const tier: PriceTier = customer && customer.type !== "retail" ? "trade" : "retail";
          return { customer, tier, lines: s.lines.map((l) => priceLine(l, tier, s.metalIndex)) };
        }),

      setKind: (kind) => set({ kind }),
      setInterState: (interState) => set({ interState }),
      setMetalIndex: (metalIndex) =>
        set((s) => ({ metalIndex, lines: s.lines.map((l) => priceLine(l, s.tier, metalIndex)) })),

      clear: () => set({ lines: [], selected: 0, customer: null, tier: "retail", kind: "tax_invoice", interState: false }),
    }),
    {
      name: "pos-cart-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ lines, selected, tier, customer, kind, interState }) => ({ lines, selected, tier, customer, kind, interState }),
    },
  ),
);

/** Derived GST totals for the current cart. */
export function cartSummary(s: Pick<CartState, "lines" | "kind" | "interState">): TaxSummary {
  return calcInvoice(
    s.lines.map((l) => ({
      rate: l.rate,
      qty: l.qty,
      gstRate: Number(l.product.gst_rate),
      priceIncludesTax: l.product.price_includes_tax,
    })),
    s.interState ? "inter" : "intra",
    s.kind === "tax_invoice",
  );
}

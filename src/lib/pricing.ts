// Unit-of-measure conversion and price-tier / metal-index pricing.
import type { MetalKind, MetalRate, PriceTier, Product } from "@/types/database.types";

export interface SellUnit {
  unit: string; // label printed on the bill: 'm', 'coil', 'pc', 'box'
  factor: number; // base units per one of this unit
  isPack: boolean;
}

/** Units a product can be sold in. Index 0 is always the base unit. */
export function sellUnits(p: Pick<Product, "base_unit" | "pack_unit" | "pack_size">): SellUnit[] {
  const units: SellUnit[] = [{ unit: p.base_unit, factor: 1, isPack: false }];
  if (p.pack_unit && p.pack_size) units.push({ unit: p.pack_unit, factor: Number(p.pack_size), isPack: true });
  return units;
}

export type MetalIndex = Partial<Record<MetalKind, { rate: number; enabled: boolean }>>;

export function toMetalIndex(rates: MetalRate[] | undefined): MetalIndex {
  const idx: MetalIndex = {};
  for (const r of rates ?? []) idx[r.metal] = { rate: Number(r.rate_per_kg), enabled: r.enabled };
  return idx;
}

/**
 * Per-base-unit adjustment when the live copper/aluminium index differs from the rate the
 * list price was set at: (live − ref) ₹/kg × conductor kg per base unit.
 */
export function metalAdjustment(p: Product, index: MetalIndex): number {
  if (!p.metal || p.metal_kg_per_base_unit == null || p.metal_ref_rate == null) return 0;
  const live = index[p.metal];
  if (!live?.enabled) return 0;
  return (live.rate - Number(p.metal_ref_rate)) * Number(p.metal_kg_per_base_unit);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Default rate for one sold unit under a price tier, including any metal-index adjustment. */
export function unitRate(p: Product, tier: PriceTier, unit: SellUnit, index: MetalIndex = {}): number {
  const adj = metalAdjustment(p, index);
  const base = Number(tier === "trade" ? p.trade_price : p.retail_price) + adj;
  if (unit.isPack) {
    const packOverride = tier === "trade" ? p.trade_pack_price : p.retail_pack_price;
    if (packOverride != null) return round2(Number(packOverride) + adj * unit.factor);
    return round2(base * unit.factor);
  }
  return round2(base);
}

/** Human stock label: "2 coil + 35 m" for wire, "3 box + 4 pc" for switches. */
export function formatStock(p: Pick<Product, "stock_base_qty" | "base_unit" | "pack_unit" | "pack_size">): string {
  const qty = Number(p.stock_base_qty);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
  if (!p.pack_unit || !p.pack_size || qty < 0) return `${fmt(qty)} ${p.base_unit}`;
  const size = Number(p.pack_size);
  const packs = Math.floor(qty / size + 1e-9);
  const rest = round2(qty - packs * size);
  if (packs === 0) return `${fmt(rest)} ${p.base_unit}`;
  return rest > 0 ? `${packs} ${p.pack_unit} + ${fmt(rest)} ${p.base_unit}` : `${packs} ${p.pack_unit}`;
}

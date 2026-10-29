"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { qk, useShop } from "@/hooks/use-shop-data";
import { HSN_PRESETS } from "@/lib/gst-calculator";
import { createClient } from "@/lib/supabase/client";
import type { MetalKind, Product } from "@/types/database.types";

type Draft = {
  name: string;
  brand: string;
  category: string;
  sku: string;
  barcode: string;
  hsn_code: string;
  gst_rate: string;
  price_includes_tax: boolean;
  base_unit: string;
  pack_unit: string;
  pack_size: string;
  retail_price: string;
  trade_price: string;
  retail_pack_price: string;
  trade_pack_price: string;
  cost_price: string;
  metal: "" | MetalKind;
  metal_kg_per_base_unit: string;
  metal_ref_rate: string;
  reorder_level: string;
  opening_stock: string;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function toDraft(p?: Product): Draft {
  return {
    name: s(p?.name),
    brand: s(p?.brand),
    category: s(p?.category),
    sku: s(p?.sku),
    barcode: s(p?.barcode),
    hsn_code: p?.hsn_code ?? "8544",
    gst_rate: s(p?.gst_rate ?? 18),
    price_includes_tax: p?.price_includes_tax ?? true,
    base_unit: p?.base_unit ?? "m",
    pack_unit: s(p?.pack_unit),
    pack_size: s(p?.pack_size),
    retail_price: s(p?.retail_price),
    trade_price: s(p?.trade_price),
    retail_pack_price: s(p?.retail_pack_price),
    trade_pack_price: s(p?.trade_pack_price),
    cost_price: s(p?.cost_price),
    metal: p?.metal ?? "",
    metal_kg_per_base_unit: s(p?.metal_kg_per_base_unit),
    metal_ref_rate: s(p?.metal_ref_rate),
    reorder_level: s(p?.reorder_level ?? 0),
    opening_stock: "0",
  };
}

const PRESETS = [
  { label: "Wire (90m coil)", base_unit: "m", pack_unit: "coil", pack_size: "90", hsn_code: "8544" },
  { label: "Conduit (3m length)", base_unit: "m", pack_unit: "length", pack_size: "3", hsn_code: "3917" },
  { label: "Switch (box of 10)", base_unit: "pc", pack_unit: "box", pack_size: "10", hsn_code: "8536" },
  { label: "Loose piece", base_unit: "pc", pack_unit: "", pack_size: "", hsn_code: "8536" },
];

export function ProductForm({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product;
}) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(product));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: d.name.trim(),
        brand: d.brand.trim() || null,
        category: d.category.trim() || null,
        sku: d.sku.trim() || null,
        barcode: d.barcode.trim() || null,
        hsn_code: d.hsn_code.trim(),
        gst_rate: Number(d.gst_rate),
        price_includes_tax: d.price_includes_tax,
        base_unit: d.base_unit.trim(),
        pack_unit: d.pack_unit.trim() || null,
        pack_size: d.pack_unit.trim() ? num(d.pack_size) : null,
        retail_price: Number(d.retail_price),
        trade_price: Number(d.trade_price || d.retail_price),
        retail_pack_price: num(d.retail_pack_price),
        trade_pack_price: num(d.trade_pack_price),
        cost_price: num(d.cost_price),
        metal: d.metal || null,
        metal_kg_per_base_unit: d.metal ? num(d.metal_kg_per_base_unit) : null,
        metal_ref_rate: d.metal ? num(d.metal_ref_rate) : null,
        reorder_level: Number(d.reorder_level || 0),
        is_active: true,
      };
      const supabase = createClient();
      if (product) {
        const { error } = await supabase
          .from("products")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({ ...row, shop_id: shop.id, stock_base_qty: Number(d.opening_stock || 0) });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(product ? "Item updated" : "Item added");
      qc.invalidateQueries({ queryKey: qk.products(shop.id) });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const field = (k: keyof Draft, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1">
      <Label htmlFor={`pf-${k}`} className="text-xs">
        {label}
      </Label>
      <Input id={`pf-${k}`} value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );
  const hasPack = d.pack_unit.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : "New item"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!product && (
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setD((x) => ({ ...x, ...p, gst_rate: "18" }))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">{field("name", "Name *", { required: true, autoFocus: true, placeholder: "Polycab FR 1.5 sq mm Red" })}</div>
            {field("brand", "Brand")}
            {field("category", "Category", { placeholder: "Wire / Switch / MCB" })}
            {field("sku", "SKU")}
            {field("barcode", "Barcode")}
            <div className="grid gap-1">
              <Label htmlFor="pf-hsn" className="text-xs">HSN *</Label>
              <Input id="pf-hsn" list="hsn-presets" required pattern="[0-9]{4,8}" value={d.hsn_code} onChange={(e) => set("hsn_code", e.target.value)} />
              <datalist id="hsn-presets">
                {HSN_PRESETS.map((h) => (
                  <option key={h.code} value={h.code}>
                    {h.label}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="pf-gst" className="text-xs">GST %</Label>
              <select id="pf-gst" value={d.gst_rate} onChange={(e) => set("gst_rate", e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                {[0, 5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>
                    {r}% {r === 28 ? "(luxury fixtures)" : r ? `(${r / 2}+${r / 2})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="grid gap-3 rounded-md border p-3">
            <h4 className="text-sm font-semibold">Units of measure</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {field("base_unit", "Base unit (stock unit) *", { required: true, placeholder: "m / pc / ft" })}
              {field("pack_unit", "Pack unit", { placeholder: "coil / box / bundle" })}
              {field("pack_size", `Base units per ${d.pack_unit || "pack"}`, { type: "number", step: "any", min: 0, required: hasPack, disabled: !hasPack })}
              {field("reorder_level", `Reorder at (${d.base_unit})`, { type: "number", step: "any", min: 0 })}
            </div>
          </section>

          <section className="grid gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Pricing</h4>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.price_includes_tax} onChange={(e) => set("price_includes_tax", e.target.checked)} />
                Prices include GST
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {field("retail_price", `Retail ₹/${d.base_unit} *`, { type: "number", step: "0.01", min: 0, required: true })}
              {field("trade_price", `Electrician ₹/${d.base_unit}`, { type: "number", step: "0.01", min: 0, placeholder: "= retail" })}
              {field("retail_pack_price", `Retail ₹/${d.pack_unit || "pack"}`, { type: "number", step: "0.01", min: 0, disabled: !hasPack, placeholder: "auto" })}
              {field("trade_pack_price", `Trade ₹/${d.pack_unit || "pack"}`, { type: "number", step: "0.01", min: 0, disabled: !hasPack, placeholder: "auto" })}
              {field("cost_price", `Cost ₹/${d.base_unit}`, { type: "number", step: "0.01", min: 0 })}
            </div>
          </section>

          <section className="grid gap-3 rounded-md border p-3">
            <h4 className="text-sm font-semibold">Metal index (cables)</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="pf-metal" className="text-xs">Conductor</Label>
                <select id="pf-metal" value={d.metal} onChange={(e) => set("metal", e.target.value as Draft["metal"])} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">None</option>
                  <option value="copper">Copper</option>
                  <option value="aluminium">Aluminium</option>
                </select>
              </div>
              {field("metal_kg_per_base_unit", `Metal kg per ${d.base_unit}`, { type: "number", step: "any", min: 0, disabled: !d.metal, required: !!d.metal, placeholder: "1.5 sq mm Cu ≈ 0.0134" })}
              {field("metal_ref_rate", "Price set at ₹/kg", { type: "number", step: "0.01", min: 0, disabled: !d.metal, required: !!d.metal })}
            </div>
          </section>

          {!product && <div className="w-48">{field("opening_stock", `Opening stock (${d.base_unit})`, { type: "number", step: "any" })}</div>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { formatStock, sellUnits, unitRate, type MetalIndex } from "@/lib/pricing";
import { formatINR } from "@/lib/utils";
import type { PriceTier, Product } from "@/types/database.types";

export interface ProductSearchHandle {
  focus: () => void;
  clear: () => void;
}

interface Props {
  ref?: Ref<ProductSearchHandle>;
  products: Product[];
  tier: PriceTier;
  metalIndex: MetalIndex;
  onAdd: (p: Product, qty: number) => void;
  /** Keys pressed while the box is empty are forwarded to the cart (↑ ↓ Delete + −). */
  onCartKey: (key: "up" | "down" | "delete" | "plus" | "minus") => void;
}

/** "2.5*fr wire" or "10x 6a switch" → qty prefix + search text. */
function parseQuery(raw: string): { qty: number; text: string } {
  const m = raw.match(/^\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(.*)$/i);
  if (m && Number(m[1]) > 0) return { qty: Number(m[1]), text: m[2] };
  return { qty: 1, text: raw };
}

function search(products: Product[], text: string, limit = 30): Product[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored: { p: Product; s: number }[] = [];
  for (const p of products) {
    if (p.barcode === text.trim() || p.sku?.toLowerCase() === q) {
      scored.push({ p, s: 0 });
      continue;
    }
    const hay = `${p.name} ${p.brand ?? ""} ${p.category ?? ""} ${p.sku ?? ""} ${p.hsn_code}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) continue;
    scored.push({ p, s: p.name.toLowerCase().startsWith(tokens[0]) ? 1 : 2 });
  }
  scored.sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((x) => x.p);
}

export function ProductSearch({ ref, products, tier, metalIndex, onAdd, onCartKey }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { qty, text } = parseQuery(query);
  const results = useMemo(() => search(products, text), [products, text]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    clear: () => setQuery(""),
  }));

  const add = (p: Product) => {
    onAdd(p, qty);
    setQuery("");
  };

  return (
    <Command shouldFilter={false} loop className="relative overflow-visible border bg-background shadow-sm">
      <CommandInput
        ref={inputRef}
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search item, SKU or scan barcode…   (2.5*wire sets qty)"
        className="text-lg"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            return;
          }
          if (query !== "") return;
          const map: Record<string, Parameters<typeof onCartKey>[0]> = {
            ArrowUp: "up",
            ArrowDown: "down",
            Delete: "delete",
            "+": "plus",
            "-": "minus",
          };
          const k = map[e.key];
          if (k) {
            e.preventDefault();
            e.stopPropagation();
            onCartKey(k);
          }
        }}
      />
      {text.trim() !== "" && (
        <CommandList className="absolute inset-x-0 top-full z-40 mt-1 max-h-[60vh] rounded-md border bg-popover shadow-xl">
          <CommandEmpty>No matching item</CommandEmpty>
          <CommandGroup heading={qty !== 1 ? `Adding qty ${qty}` : undefined}>
            {results.map((p) => {
              const low = Number(p.stock_base_qty) <= Number(p.reorder_level);
              return (
                <CommandItem key={p.id} value={p.id} onSelect={() => add(p)} className="py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.brand && `${p.brand} · `}HSN {p.hsn_code} · GST {Number(p.gst_rate)}%
                      {p.pack_unit && ` · ${p.pack_size} ${p.base_unit}/${p.pack_unit}`}
                    </div>
                  </div>
                  <Badge variant={low ? "warning" : "secondary"}>{formatStock(p)}</Badge>
                  <div className="w-24 text-right font-mono tabular-nums">
                    {formatINR(unitRate(p, tier, sellUnits(p)[0], metalIndex))}
                    <span className="text-xs text-muted-foreground">/{p.base_unit}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}

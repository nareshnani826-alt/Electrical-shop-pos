"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { MetalRatesPanel } from "@/components/inventory/metal-rates-panel";
import { ProductForm } from "@/components/inventory/product-form";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMetalRates, useProducts } from "@/hooks/use-shop-data";
import { formatStock, sellUnits, toMetalIndex, unitRate } from "@/lib/pricing";
import { formatINR } from "@/lib/utils";
import type { Product } from "@/types/database.types";

type Filter = "all" | "low" | "negative";

export default function InventoryPage() {
  const { data: products = [], isLoading } = useProducts();
  const { data: rates } = useMetalRates();
  const idx = toMetalIndex(rates);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const rows = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const stock = Number(p.stock_base_qty);
      if (filter === "low" && stock > Number(p.reorder_level)) return false;
      if (filter === "negative" && stock >= 0) return false;
      const hay = `${p.name} ${p.brand ?? ""} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.hsn_code}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [products, q, filter]);

  const lowCount = products.filter((p) => Number(p.stock_base_qty) <= Number(p.reorder_level)).length;
  const stockValue = products.reduce((s, p) => s + Math.max(0, Number(p.stock_base_qty)) * Number(p.cost_price ?? 0), 0);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <Badge variant="secondary">{products.length} items</Badge>
        <Badge variant="outline">Stock value {formatINR(stockValue, { whole: true })} at cost</Badge>
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          <Plus /> New item
        </Button>
      </div>

      <MetalRatesPanel />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, SKU, barcode, HSN" className="pl-8" />
        </div>
        {(["all", "low", "negative"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "low" ? `Low stock (${lowCount})` : "Negative"}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead className="text-right">Retail</TableHead>
              <TableHead className="text-right">Trade</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const stock = Number(p.stock_base_qty);
              const units = sellUnits(p);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.brand, p.sku, p.barcode].filter(Boolean).join(" · ")}
                      {p.metal && <Badge variant="outline" className="ml-1">{p.metal === "copper" ? "Cu" : "Al"}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.hsn_code}</TableCell>
                  <TableCell className="text-right">{Number(p.gst_rate)}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.pack_unit ? `${Number(p.pack_size)} ${p.base_unit}/${p.pack_unit}` : p.base_unit}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatINR(unitRate(p, "retail", units[0], idx))}
                    {units[1] && <div className="text-xs text-muted-foreground">{formatINR(unitRate(p, "retail", units[1], idx))}/{units[1].unit}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatINR(unitRate(p, "trade", units[0], idx))}
                    {units[1] && <div className="text-xs text-muted-foreground">{formatINR(unitRate(p, "trade", units[1], idx))}/{units[1].unit}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={stock < 0 ? "destructive" : stock <= Number(p.reorder_level) ? "warning" : "secondary"}>
                      {formatStock(p)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" title="Adjust stock" onClick={() => setAdjusting(p)}>
                      <PackagePlus />
                    </Button>
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ProductForm
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          product={editing === "new" ? undefined : editing}
        />
      )}
      {adjusting && <StockAdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

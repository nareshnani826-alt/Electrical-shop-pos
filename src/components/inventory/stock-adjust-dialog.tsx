"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { qk, useShop } from "@/hooks/use-shop-data";
import { formatStock } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { formatQty } from "@/lib/utils";
import type { Product } from "@/types/database.types";

/** Stock inward / correction with a coil ↔ metre (box ↔ piece) converter. */
export function StockAdjustDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const [packs, setPacks] = useState("");
  const [loose, setLoose] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [reason, setReason] = useState("purchase");
  const [note, setNote] = useState("");

  const size = Number(product.pack_size ?? 0);
  const base = (Number(packs) || 0) * size + (Number(loose) || 0);
  const delta = direction === "in" ? base : -base;
  const after = { ...product, stock_base_qty: Number(product.stock_base_qty) + delta };

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await createClient().rpc("adjust_stock", {
        p_product_id: product.id,
        p_delta_base_qty: delta,
        p_reason: reason,
        p_note: note || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.setQueryData<Product[]>(qk.products(shop.id), (prev) => prev?.map((x) => (x.id === p.id ? p : x)));
      toast.success(`Stock now ${formatStock(p)}`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product.name} · current {formatStock(product)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (base > 0) save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["in", "out"] as const).map((dir) => (
              <Button
                key={dir}
                type="button"
                variant={direction === dir ? "default" : "outline"}
                onClick={() => {
                  setDirection(dir);
                  setReason(dir === "in" ? "purchase" : "adjustment");
                }}
              >
                {dir === "in" ? "Stock in (+)" : "Stock out (−)"}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {product.pack_unit && (
              <div className="grid gap-1">
                <Label htmlFor="sa-packs">
                  {product.pack_unit} ({formatQty(size)} {product.base_unit} each)
                </Label>
                <Input id="sa-packs" autoFocus type="number" step="any" min={0} value={packs} onChange={(e) => setPacks(e.target.value)} />
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor="sa-loose">{product.pack_unit ? `Loose ${product.base_unit}` : product.base_unit}</Label>
              <Input id="sa-loose" autoFocus={!product.pack_unit} type="number" step="any" min={0} value={loose} onChange={(e) => setLoose(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-muted p-3 text-sm">
            <span className="font-mono">
              {delta >= 0 ? "+" : ""}
              {formatQty(delta)} {product.base_unit}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="font-medium">{formatStock(after)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="sa-reason">Reason</Label>
              <select id="sa-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="purchase">Purchase inward</option>
                <option value="return">Customer return</option>
                <option value="adjustment">Count correction</option>
                <option value="damage">Damage / cut waste</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sa-note">Note</Label>
              <Input id="sa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier bill no." />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={base <= 0 || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

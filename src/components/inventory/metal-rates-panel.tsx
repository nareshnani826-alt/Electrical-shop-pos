"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qk, useMetalRates, useShop } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import type { MetalKind, MetalRate } from "@/types/database.types";

function MetalRow({ rate, canEdit }: { rate: MetalRate; canEdit: boolean }) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(rate.rate_per_kg));

  const save = useMutation({
    mutationFn: async (patch: Partial<Pick<MetalRate, "rate_per_kg" | "enabled">>) => {
      const { error } = await createClient()
        .from("metal_rates")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("shop_id", shop.id)
        .eq("metal", rate.metal);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.metalRates(shop.id) }),
    onError: (e) => toast.error(e.message),
  });

  const label: Record<MetalKind, string> = { copper: "Copper", aluminium: "Aluminium" };
  return (
    <div className="flex items-center gap-2">
      <label className="flex w-28 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={rate.enabled}
          disabled={!canEdit}
          onChange={(e) => save.mutate({ enabled: e.target.checked })}
        />
        {label[rate.metal]}
      </label>
      <Input
        type="number"
        step="0.01"
        min={1}
        className="h-8 w-28 font-mono"
        value={value}
        disabled={!canEdit}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">₹/kg</span>
      {Number(value) !== Number(rate.rate_per_kg) && (
        <Button size="sm" onClick={() => save.mutate({ rate_per_kg: Number(value) })} disabled={!(Number(value) > 0)}>
          Update
        </Button>
      )}
    </div>
  );
}

/** Live copper/aluminium index. When enabled, cable prices shift by (live − ref) × kg/m on every counter. */
export function MetalRatesPanel() {
  const { role } = useShop();
  const { data = [] } = useMetalRates();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border p-3">
      <span className="text-sm font-semibold">Metal index</span>
      {data.map((r) => (
        <MetalRow key={`${r.metal}-${r.updated_at}`} rate={r} canEdit={role === "owner"} />
      ))}
    </div>
  );
}

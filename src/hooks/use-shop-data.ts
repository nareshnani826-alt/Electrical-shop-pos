"use client";

import { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Customer, MemberRole, MetalRate, Product, Shop } from "@/types/database.types";

export interface ShopContextValue {
  shop: Shop;
  role: MemberRole;
}

export const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside the dashboard layout");
  return ctx;
}

export const qk = {
  products: (shopId: string) => ["products", shopId] as const,
  customers: (shopId: string) => ["customers", shopId] as const,
  metalRates: (shopId: string) => ["metal_rates", shopId] as const,
  ledger: (customerId: string) => ["ledger", customerId] as const,
};

/** Whole active catalogue in memory: search happens client-side for instant results. */
export function useProducts() {
  const { shop } = useShop();
  return useQuery({
    queryKey: qk.products(shop.id),
    queryFn: async (): Promise<Product[]> => {
      const supabase = createClient();
      const all: Product[] = [];
      // Page through in 1000-row chunks (PostgREST default max).
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", shop.id)
          .eq("is_active", true)
          .order("name")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },
  });
}

export function useCustomers() {
  const { shop } = useShop();
  return useQuery({
    queryKey: qk.customers(shop.id),
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await createClient()
        .from("customers")
        .select("*")
        .eq("shop_id", shop.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useMetalRates() {
  const { shop } = useShop();
  return useQuery({
    queryKey: qk.metalRates(shop.id),
    queryFn: async (): Promise<MetalRate[]> => {
      const { data, error } = await createClient().from("metal_rates").select("*").eq("shop_id", shop.id);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * One realtime channel per tab: other counters' sales (stock), new Khata payments (balance)
 * and metal-rate changes refresh this counter's cache.
 */
export function useShopRealtime() {
  const { shop } = useShop();
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    const filter = `shop_id=eq.${shop.id}`;
    const channel = supabase
      .channel(`shop:${shop.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter }, (payload) => {
        qc.setQueryData<Product[]>(qk.products(shop.id), (prev) => {
          if (!prev) return prev;
          if (payload.eventType === "DELETE") return prev.filter((p) => p.id !== (payload.old as Product).id);
          const row = payload.new as Product;
          if (!row.is_active) return prev.filter((p) => p.id !== row.id);
          const i = prev.findIndex((p) => p.id === row.id);
          if (i === -1) return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
          const next = prev.slice();
          next[i] = row;
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter }, () => {
        qc.invalidateQueries({ queryKey: qk.customers(shop.id) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "metal_rates", filter }, () => {
        qc.invalidateQueries({ queryKey: qk.metalRates(shop.id) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shop.id, qc]);
}

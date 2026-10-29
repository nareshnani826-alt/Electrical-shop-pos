"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qk, useCustomers, useShop } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import { cn, formatINR } from "@/lib/utils";
import type { Customer } from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (c: Customer) => void;
}

export function CustomerPicker({ open, onOpenChange, onPick }: Props) {
  const { shop } = useShop();
  const { data: customers = [] } = useCustomers();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await createClient()
        .from("customers")
        .insert({ shop_id: shop.id, name: query.trim(), phone: phone || null, type: "electrician" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      qc.setQueryData<Customer[]>(qk.customers(shop.id), (prev) => [...(prev ?? []), c]);
      pick(c);
    },
    onError: (e) => toast.error(e.message),
  });

  const pick = (c: Customer) => {
    onPick(c);
    setQuery("");
    setCreating(false);
    setPhone("");
    onOpenChange(false);
  };

  const q = query.trim().toLowerCase();
  const matches = customers
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q))
    .slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showClose={false}>
        <DialogTitle className="sr-only">Select trade customer</DialogTitle>
        {creating ? (
          <form
            className="grid gap-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) create.mutate();
            }}
          >
            <h3 className="font-semibold">New electrician</h3>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name" required />
            <Input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile (for WhatsApp)"
              inputMode="numeric"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Back
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Save &amp; select
              </Button>
            </div>
          </form>
        ) : (
          <Command shouldFilter={false} loop>
            <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Electrician name or mobile…" />
            <CommandList>
              <CommandEmpty>No customer found</CommandEmpty>
              <CommandGroup heading="Trade accounts">
                {matches.map((c) => {
                  const overLimit = Number(c.credit_limit) > 0 && Number(c.balance) > Number(c.credit_limit);
                  return (
                    <CommandItem key={c.id} value={c.id} onSelect={() => pick(c)}>
                      <div className="flex-1">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.phone ?? "no phone"} · {c.type}
                        </div>
                      </div>
                      <span className={cn("font-mono text-sm tabular-nums", overLimit && "text-destructive")}>
                        {formatINR(Number(c.balance))}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {q && (
                <CommandGroup>
                  <CommandItem value="__new" onSelect={() => setCreating(true)}>
                    <UserPlus /> Add “{query.trim()}” as new electrician
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}

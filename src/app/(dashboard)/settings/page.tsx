"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GST_STATES } from "@/components/shop-setup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShop } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import { isValidVpa } from "@/lib/upi";

export default function SettingsPage() {
  const { shop, role } = useShop();
  const router = useRouter();
  const [f, setF] = useState({
    name: shop.name,
    gstin: shop.gstin ?? "",
    state_code: shop.state_code,
    address: shop.address ?? "",
    phone: shop.phone ?? "",
    upi_vpa: shop.upi_vpa ?? "",
    upi_payee_name: shop.upi_payee_name ?? "",
    invoice_prefix: shop.invoice_prefix,
    estimate_prefix: shop.estimate_prefix,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const disabled = role !== "owner";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.upi_vpa && !isValidVpa(f.upi_vpa)) return toast.error("UPI ID looks wrong (expected name@bank)");
    setBusy(true);
    const { error } = await createClient()
      .from("shops")
      .update({
        ...f,
        gstin: f.gstin || null,
        state_code: f.gstin ? f.gstin.slice(0, 2) : f.state_code,
        address: f.address || null,
        phone: f.phone || null,
        upi_vpa: f.upi_vpa || null,
        upi_payee_name: f.upi_payee_name || null,
      })
      .eq("id", shop.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Shop settings saved");
    router.refresh();
  };

  const row = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`s-${k}`}>{label}</Label>
      <Input id={`s-${k}`} value={f[k]} onChange={set(k)} disabled={disabled} {...props} />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Shop settings</CardTitle>
          <CardDescription>{disabled ? "Only the owner can change these." : "Printed on every bill."}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            {row("name", "Shop name", { required: true })}
            {row("phone", "Phone")}
            <div className="sm:col-span-2">{row("address", "Address")}</div>
            {row("gstin", "GSTIN", { pattern: "[0-9]{2}[A-Z0-9]{13}", placeholder: "27ABCDE1234F1Z5" })}
            <div className="grid gap-1.5">
              <Label htmlFor="s-state">State (place of supply)</Label>
              <select id="s-state" value={f.gstin ? f.gstin.slice(0, 2) : f.state_code} onChange={set("state_code")} disabled={disabled || !!f.gstin} className="h-9 rounded-md border bg-background px-2 text-sm">
                {GST_STATES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} · {n}
                  </option>
                ))}
              </select>
            </div>
            {row("upi_vpa", "UPI ID (VPA)", { placeholder: "shopname@okhdfcbank" })}
            {row("upi_payee_name", "UPI payee name", { placeholder: "as registered with bank" })}
            {row("invoice_prefix", "Tax invoice prefix", { required: true, maxLength: 8 })}
            {row("estimate_prefix", "Estimate prefix", { required: true, maxLength: 8 })}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={disabled || busy}>
                {busy && <Loader2 className="animate-spin" />} Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export const GST_STATES: [string, string][] = [
  ["01", "Jammu & Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"],
  ["05", "Uttarakhand"], ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"],
  ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"],
  ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"],
  ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"],
  ["26", "Dadra & Nagar Haveli and Daman & Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"],
  ["35", "Andaman & Nicobar"], ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"],
];

export function ShopSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState("27");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc("create_shop", {
      p_name: name.trim(),
      p_state_code: gstin ? gstin.slice(0, 2) : state,
      p_gstin: gstin.toUpperCase() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Set up your shop</CardTitle>
          <CardDescription>You can add address, UPI ID and invoice prefixes later in Settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shop-name">Shop name</Label>
              <Input id="shop-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Shree Ganesh Electricals" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gstin">GSTIN (optional)</Label>
              <Input
                id="gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15))}
                placeholder="27ABCDE1234F1Z5"
                pattern="[0-9]{2}[A-Z0-9]{13}"
              />
            </div>
            {!gstin && (
              <div className="grid gap-1.5">
                <Label htmlFor="state">State</Label>
                <select id="state" value={state} onChange={(e) => setState(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {GST_STATES.map(([c, n]) => (
                    <option key={c} value={c}>
                      {c} · {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Create shop
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

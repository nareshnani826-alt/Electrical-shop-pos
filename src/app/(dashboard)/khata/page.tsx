"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk, useCustomers, useShop } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import { buildUpiUri } from "@/lib/upi";
import { cn, formatINR } from "@/lib/utils";
import { buildReminderText, waLink } from "@/lib/whatsapp";
import type { Customer, CustomerType, LedgerEntry } from "@/types/database.types";

function useLedger(customerId: string | null) {
  return useQuery({
    queryKey: qk.ledger(customerId ?? ""),
    enabled: !!customerId,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await createClient()
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export default function KhataPage() {
  const { shop } = useShop();
  const { data: customers = [] } = useCustomers();
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers
      .filter((c) => (!onlyDue || Number(c.balance) > 0) && (!t || c.name.toLowerCase().includes(t) || c.phone?.includes(t)))
      .sort((a, b) => Number(b.balance) - Number(a.balance));
  }, [customers, q, onlyDue]);

  const totalDue = customers.reduce((s, c) => s + Math.max(0, Number(c.balance)), 0);
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid h-full grid-cols-[minmax(320px,420px)_1fr] overflow-hidden">
      <aside className="flex flex-col overflow-hidden border-r">
        <div className="grid gap-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Khata</h1>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> Customer
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Total outstanding <b className="font-mono text-foreground">{formatINR(totalDue)}</b>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or mobile" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only with dues
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.map((c) => {
            const over = Number(c.credit_limit) > 0 && Number(c.balance) > Number(c.credit_limit);
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={cn("flex w-full items-center gap-3 border-b px-3 py-2.5 text-left hover:bg-muted/60", c.id === selectedId && "bg-accent")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.phone ?? "no phone"}
                      {c.last_txn_at && ` · ${new Date(c.last_txn_at).toLocaleDateString("en-IN")}`}
                    </div>
                  </div>
                  <span className={cn("font-mono text-sm tabular-nums", over ? "text-destructive" : Number(c.balance) > 0 && "text-amber-600")}>
                    {formatINR(Number(c.balance))}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No customers</li>}
        </ul>
      </aside>

      <section className="overflow-hidden">
        {selected ? (
          <CustomerLedger key={selected.id} customer={selected} shopName={shop.name} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">Select a customer to view the ledger</div>
        )}
      </section>

      {adding && <NewCustomerDialog onClose={() => setAdding(false)} onCreated={(c) => setSelectedId(c.id)} />}
    </div>
  );
}

function CustomerLedger({ customer, shopName }: { customer: Customer; shopName: string }) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useLedger(customer.id);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi">("cash");
  const [note, setNote] = useState("");
  const balance = Number(customer.balance);

  const pay = useMutation({
    mutationFn: async () => {
      const amt = Math.round(Number(amount) * 100) / 100;
      const { error } = await createClient().from("ledger_entries").insert({
        shop_id: shop.id,
        customer_id: customer.id,
        entry_type: "payment",
        amount: -amt,
        mode,
        note: note || null,
      });
      if (error) throw error;
      return amt;
    },
    onSuccess: (amt) => {
      toast.success(`${formatINR(amt)} received from ${customer.name}`);
      setAmount("");
      setNote("");
      qc.invalidateQueries({ queryKey: qk.ledger(customer.id) });
      qc.invalidateQueries({ queryKey: qk.customers(shop.id) });
    },
    onError: (e) => toast.error(e.message),
  });

  // Running balance, newest first: walk back from the current balance.
  const withRunning = useMemo(() => {
    let run = balance;
    return entries.map((e) => {
      const row = { ...e, running: run };
      run -= Number(e.amount);
      return row;
    });
  }, [entries, balance]);

  const reminder = () => {
    if (!customer.phone) return toast.error("Add a mobile number to send WhatsApp reminders");
    let upiUri: string | null = null;
    if (shop.upi_vpa && balance > 0) {
      try {
        upiUri = buildUpiUri({ vpa: shop.upi_vpa, payeeName: shop.upi_payee_name ?? shop.name, amount: Math.min(balance, 100000), note: "Khata payment" });
      } catch {}
    }
    const text = buildReminderText({ shopName, customer, last: entries[0], upiUri });
    const link = waLink(customer.phone, text);
    if (!link) return toast.error("Mobile number is not a valid Indian number");
    window.open(link, "_blank", "noopener");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-4 border-b p-4">
        <div>
          <h2 className="text-lg font-semibold">{customer.name}</h2>
          <div className="text-sm text-muted-foreground">
            {customer.phone ?? "no phone"} · {customer.type}
            {Number(customer.credit_limit) > 0 && ` · limit ${formatINR(Number(customer.credit_limit))}`}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs uppercase text-muted-foreground">{balance >= 0 ? "Due" : "Advance"}</div>
          <div className={cn("font-mono text-2xl font-bold", balance > 0 && "text-amber-600")}>{formatINR(Math.abs(balance))}</div>
        </div>
        <Button variant="outline" onClick={reminder} disabled={balance <= 0} className="border-emerald-600 text-emerald-700">
          <MessageCircle /> WhatsApp reminder
        </Button>
      </header>

      <form
        className="flex flex-wrap items-end gap-2 border-b bg-muted/40 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(amount) > 0) pay.mutate();
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="pay-amt" className="text-xs">Receive payment</Label>
          <Input id="pay-amt" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={balance > 0 ? String(balance) : "0"} className="w-36 font-mono" />
        </div>
        <div className="flex gap-1">
          {(["cash", "upi"] as const).map((m) => (
            <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </Button>
          ))}
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-56" />
        <Button type="submit" disabled={!(Number(amount) > 0) || pay.isPending}>
          {pay.isPending && <Loader2 className="animate-spin" />} Save payment
        </Button>
        {balance > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(String(balance))}>
            Full {formatINR(balance)}
          </Button>
        )}
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead className="text-right">Debit (took)</TableHead>
              <TableHead className="text-right">Credit (paid)</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            )}
            {withRunning.map((e) => {
              const amt = Number(e.amount);
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    {new Date(e.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.entry_type === "payment" ? "success" : "secondary"}>{e.entry_type}</Badge>{" "}
                    {e.mode && <span className="text-xs uppercase text-muted-foreground">{e.mode}</span>}{" "}
                    <span className="text-sm">{e.note}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{amt > 0 ? formatINR(amt) : ""}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{amt < 0 ? formatINR(-amt) : ""}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{formatINR(e.running)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Customer) => void }) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<CustomerType>("electrician");
  const [limit, setLimit] = useState("");
  const [opening, setOpening] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("customers")
        .insert({ shop_id: shop.id, name: name.trim(), phone: phone || null, type, credit_limit: Number(limit || 0) })
        .select()
        .single();
      if (error) throw error;
      const ob = Number(opening);
      if (ob) {
        const { error: e2 } = await supabase
          .from("ledger_entries")
          .insert({ shop_id: shop.id, customer_id: data.id, entry_type: "opening", amount: ob, note: "Opening balance" });
        if (e2) throw e2;
      }
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: qk.customers(shop.id) });
      onCreated(c);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Khata customer</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit mobile" />
          <div className="grid grid-cols-3 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as CustomerType)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="electrician">Electrician</option>
              <option value="contractor">Contractor</option>
              <option value="retail">Retail (credit)</option>
            </select>
            <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Credit limit ₹" />
            <Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening due ₹" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

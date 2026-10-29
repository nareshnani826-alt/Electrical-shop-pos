"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, BookUser, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cartSummary, useCartStore } from "@/hooks/use-cart-store";
import { qk, useShop } from "@/hooks/use-shop-data";
import { sellUnits } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { cn, formatINR } from "@/lib/utils";
import type { CompleteSalePayload, Invoice, InvoiceItem } from "@/types/database.types";

export interface CompletedSale {
  invoice: Invoice;
  items: InvoiceItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (sale: CompletedSale, print: boolean) => void;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function SettlementDialog({ open, onOpenChange, onCompleted }: Props) {
  const { shop } = useShop();
  const qc = useQueryClient();
  const state = useCartStore();
  const summary = cartSummary(state);
  const total = summary.grandTotal;
  const customer = state.customer;

  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const cashRef = useRef<HTMLInputElement>(null);

  // Default: walk-in → full cash tendered; trade customer → full amount to Khata.
  useEffect(() => {
    if (!open) return;
    setCash(customer ? "0" : String(total));
    setUpi("0");
    requestAnimationFrame(() => cashRef.current?.select());
  }, [open, customer, total]);

  const cashN = Math.max(0, Number(cash) || 0);
  const upiN = Math.max(0, Number(upi) || 0);
  const change = r2(Math.max(0, cashN + upiN - total));
  const credit = r2(Math.max(0, total - cashN - upiN));
  const needsCustomer = credit > 0 && !customer;
  const upiTooHigh = upiN > total;
  const projected = customer ? Number(customer.balance) + credit : 0;
  const overLimit = !!customer && Number(customer.credit_limit) > 0 && projected > Number(customer.credit_limit);

  const sale = useMutation({
    // The variable is the print flag, forwarded to onSuccess.
    mutationFn: async (_print: boolean): Promise<CompletedSale> => {
      const supabase = createClient();
      const payload: CompleteSalePayload = {
        kind: state.kind,
        customer_id: customer?.id ?? null,
        price_tier: state.tier,
        inter_state: state.interState,
        paid_cash: r2(cashN - change), // record cash actually kept
        paid_upi: upiN,
        items: state.lines.map((l) => {
          const u = sellUnits(l.product)[l.unitIndex];
          return { product_id: l.product.id, unit: u.unit, unit_factor: u.factor, qty: l.qty, rate: l.rate };
        }),
      };
      const { data: invoice, error } = await supabase.rpc("complete_sale", { p_shop_id: shop.id, p_payload: payload });
      if (error) throw error;
      const { data: items, error: e2 } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("id");
      if (e2) throw e2;
      return { invoice, items };
    },
    onSuccess: (res, print) => {
      if (Number(res.invoice.grand_total) !== total) {
        toast.warning(`Server total ${formatINR(Number(res.invoice.grand_total))} differs from preview`);
      }
      toast.success(`${res.invoice.invoice_no} saved`, {
        description: res.invoice.on_credit > 0 ? `${formatINR(Number(res.invoice.on_credit))} added to Khata` : undefined,
      });
      qc.invalidateQueries({ queryKey: qk.customers(shop.id) });
      if (customer) qc.invalidateQueries({ queryKey: qk.ledger(customer.id) });
      state.clear();
      onOpenChange(false);
      onCompleted(res, print);
    },
    onError: (e) => toast.error("Sale not saved", { description: e.message }),
  });

  const canSubmit = state.lines.length > 0 && !needsCustomer && !upiTooHigh && !sale.isPending;
  const submit = (print: boolean) => canSubmit && sale.mutate(print);

  const quick = (mode: "cash" | "upi" | "khata") => {
    setCash(mode === "cash" ? String(total) : "0");
    setUpi(mode === "upi" ? String(total) : "0");
  };

  const upiSrc =
    shop.upi_vpa && upiN > 0 && !upiTooHigh
      ? `/api/upi?shop=${shop.id}&am=${upiN.toFixed(2)}&tn=${encodeURIComponent(customer?.name ?? "Counter sale")}`
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !sale.isPending && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(e) => {
          const keys: Record<string, () => void> = {
            F5: () => quick("cash"),
            F6: () => quick("upi"),
            F7: () => quick("khata"),
          };
          if (keys[e.key]) {
            e.preventDefault();
            keys[e.key]();
          } else if (e.key === "Enter") {
            e.preventDefault();
            submit(!e.shiftKey);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between pr-6">
            <span>Settle {state.kind === "tax_invoice" ? "Tax Invoice" : "Estimate"}</span>
            <span className="font-mono text-3xl tabular-nums">{formatINR(total)}</span>
          </DialogTitle>
          <DialogDescription>
            {customer ? `${customer.name} · Khata balance ${formatINR(Number(customer.balance))}` : "Walk-in customer"}
            {" · "}
            {state.lines.length} items
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => quick("cash")}>
                <Banknote /> Cash <kbd>F5</kbd>
              </Button>
              <Button variant="outline" onClick={() => quick("upi")} disabled={!shop.upi_vpa}>
                <QrCode /> UPI <kbd>F6</kbd>
              </Button>
              <Button variant="outline" onClick={() => quick("khata")} disabled={!customer}>
                <BookUser /> Khata <kbd>F7</kbd>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pay-cash">Cash received</Label>
                <Input
                  id="pay-cash"
                  ref={cashRef}
                  type="number"
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-12 font-mono text-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-upi">UPI</Label>
                <Input
                  id="pay-upi"
                  type="number"
                  inputMode="decimal"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-invalid={upiTooHigh}
                  className="h-12 font-mono text-xl"
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-y-1 rounded-md bg-muted p-3 text-sm">
              {state.kind === "tax_invoice" && (
                <>
                  <dt className="text-muted-foreground">Taxable</dt>
                  <dd className="text-right font-mono">{formatINR(summary.taxable)}</dd>
                  <dt className="text-muted-foreground">{state.interState ? "IGST" : "CGST + SGST"}</dt>
                  <dd className="text-right font-mono">{formatINR(summary.cgst + summary.sgst + summary.igst)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Round off</dt>
              <dd className="text-right font-mono">{formatINR(summary.roundOff)}</dd>
              <dt className={cn("font-medium", credit > 0 && "text-amber-600")}>To Khata (credit)</dt>
              <dd className={cn("text-right font-mono font-medium", credit > 0 && "text-amber-600")}>{formatINR(credit)}</dd>
              <dt className="font-medium">Return change</dt>
              <dd className="text-right font-mono text-lg font-bold text-emerald-600">{formatINR(change)}</dd>
            </dl>

            {needsCustomer && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4" /> Unpaid balance needs a Khata customer. Close and press F4.
              </p>
            )}
            {overLimit && (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="size-4" /> Balance after this bill {formatINR(projected)} exceeds credit limit{" "}
                {formatINR(Number(customer!.credit_limit))}.
              </p>
            )}
          </div>

          <div className="flex flex-col items-center justify-center gap-2 rounded-md border p-3">
            {upiSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={upiSrc} alt="UPI QR" width={176} height={176} className="size-44" />
                <span className="text-center text-xs text-muted-foreground">
                  Scan to pay {formatINR(upiN)}
                  <br />
                  {shop.upi_vpa}
                </span>
              </>
            ) : (
              <span className="text-center text-xs text-muted-foreground">
                {shop.upi_vpa ? "Enter a UPI amount (F6) to show QR" : "Set shop UPI ID in settings to enable QR"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            <kbd>Enter</kbd> save &amp; print · <kbd>Shift</kbd>+<kbd>Enter</kbd> save only · <kbd>Esc</kbd> back
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!canSubmit} onClick={() => submit(false)}>
              Save only
            </Button>
            <Button size="lg" disabled={!canSubmit} onClick={() => submit(true)}>
              {sale.isPending && <Loader2 className="animate-spin" />} Save &amp; Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProducts, useShop } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import { formatINR, formatQty } from "@/lib/utils";
import type { Invoice, InvoiceItem } from "@/types/database.types";

type Range = "today" | "7d" | "month" | "fy";

function rangeStart(r: Range): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "7d") d.setDate(d.getDate() - 6);
  if (r === "month") d.setDate(1);
  if (r === "fy") {
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return new Date(y, 3, 1);
  }
  return d;
}

type InvoiceWithItems = Invoice & { invoice_items: InvoiceItem[] };

export default function AnalyticsPage() {
  const { shop } = useShop();
  const { data: products = [] } = useProducts();
  const [range, setRange] = useState<Range>("today");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["analytics", shop.id, range],
    staleTime: 30_000,
    queryFn: async (): Promise<InvoiceWithItems[]> => {
      const { data, error } = await createClient()
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("shop_id", shop.id)
        .gte("created_at", rangeStart(range).toISOString())
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<InvoiceWithItems[]>();
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const cost = new Map(products.map((p) => [p.id, Number(p.cost_price ?? NaN)]));
    let sales = 0, cash = 0, upi = 0, credit = 0, taxable = 0, gst = 0, margin = 0, costed = 0;
    const hsn = new Map<string, { hsn: string; rate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number }>();
    const top = new Map<string, { name: string; amount: number; qty: number; unit: string }>();

    for (const inv of invoices) {
      sales += Number(inv.grand_total);
      cash += Number(inv.paid_cash);
      upi += Number(inv.paid_upi);
      credit += Number(inv.on_credit);
      for (const it of inv.invoice_items) {
        taxable += Number(it.taxable_value);
        gst += Number(it.cgst) + Number(it.sgst) + Number(it.igst);
        // Margin uses the item's current cost price (per base unit) × base qty sold.
        const c = it.product_id ? cost.get(it.product_id) : NaN;
        if (c != null && Number.isFinite(c)) {
          margin += Number(it.taxable_value) - c * Number(it.qty) * Number(it.unit_factor);
          costed += Number(it.taxable_value);
        }
        if (inv.kind === "tax_invoice") {
          const k = `${it.hsn_code}|${it.gst_rate}`;
          const h = hsn.get(k) ?? { hsn: it.hsn_code, rate: Number(it.gst_rate), qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
          h.qty += Number(it.qty) * Number(it.unit_factor);
          h.taxable += Number(it.taxable_value);
          h.cgst += Number(it.cgst);
          h.sgst += Number(it.sgst);
          h.igst += Number(it.igst);
          hsn.set(k, h);
        }
        const t = top.get(it.name) ?? { name: it.name, amount: 0, qty: 0, unit: it.unit };
        t.amount += Number(it.line_total);
        t.qty += Number(it.qty);
        top.set(it.name, t);
      }
    }
    return {
      sales, cash, upi, credit, taxable, gst, margin, costed,
      bills: invoices.length,
      hsn: [...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
      top: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 10),
    };
  }, [invoices, products]);

  const kpis = [
    { label: "Net sales", value: formatINR(stats.sales), sub: `${stats.bills} bills` },
    { label: "Cash", value: formatINR(stats.cash) },
    { label: "UPI", value: formatINR(stats.upi) },
    { label: "Given on Khata", value: formatINR(stats.credit) },
    { label: "GST collected", value: formatINR(stats.gst), sub: `on taxable ${formatINR(stats.taxable)}` },
    {
      label: "Gross margin",
      value: formatINR(stats.margin),
      sub: stats.costed > 0 ? `${((stats.margin / stats.costed) * 100).toFixed(1)}% on items with cost price` : "set cost prices to see margin",
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-xl font-semibold">Reports</h1>
        {(["today", "7d", "month", "fy"] as const).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
            {{ today: "Today", "7d": "Last 7 days", month: "This month", fy: "This FY" }[r]}
          </Button>
        ))}
        {isLoading && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="font-mono text-xl tabular-nums">{k.value}</CardTitle>
            </CardHeader>
            {k.sub && <CardContent className="px-4 text-xs text-muted-foreground">{k.sub}</CardContent>}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>HSN-wise summary (GSTR-1 Table 12)</CardTitle>
            <CardDescription>Tax invoices only. Quantity in base units.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HSN</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.hsn.map((h) => (
                  <TableRow key={`${h.hsn}-${h.rate}`}>
                    <TableCell className="font-mono">{h.hsn}</TableCell>
                    <TableCell className="text-right">{h.rate}%</TableCell>
                    <TableCell className="text-right font-mono">{formatQty(Math.round(h.qty * 1000) / 1000)}</TableCell>
                    <TableCell className="text-right font-mono">{h.taxable.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{h.cgst.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{h.sgst.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{h.igst.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {stats.hsn.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">No tax invoices in range</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.top.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="max-w-64 truncate">{t.name}</TableCell>
                    <TableCell className="text-right font-mono">{formatQty(Math.round(t.qty * 1000) / 1000)}</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">UPI</TableHead>
                <TableHead className="text-right">Khata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.slice(0, 200).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_no}</TableCell>
                  <TableCell className="text-xs">{new Date(i.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{i.customer_name ?? "Walk-in"}</TableCell>
                  <TableCell className="text-right font-mono">{formatINR(Number(i.grand_total))}</TableCell>
                  <TableCell className="text-right font-mono">{Number(i.paid_cash) ? formatINR(Number(i.paid_cash)) : ""}</TableCell>
                  <TableCell className="text-right font-mono">{Number(i.paid_upi) ? formatINR(Number(i.paid_upi)) : ""}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600">{Number(i.on_credit) ? formatINR(Number(i.on_credit)) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

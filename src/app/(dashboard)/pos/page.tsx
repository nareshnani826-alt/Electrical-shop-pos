"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Printer, Receipt, User, Users, WifiOff, X } from "lucide-react";
import { BarcodeListener } from "@/components/pos/barcode-listener";
import { CartTable, focusQtyInput } from "@/components/pos/cart-table";
import { CustomerPicker } from "@/components/pos/customer-picker";
import { ProductSearch, type ProductSearchHandle } from "@/components/pos/product-search";
import { PRINT_FORMATS, PrintableInvoice, type PrintFormat } from "@/components/pos/printable-invoice";
import { SettlementDialog, type CompletedSale } from "@/components/pos/settlement-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cartSummary, useCartStore } from "@/hooks/use-cart-store";
import { usePosShortcuts } from "@/hooks/use-pos-shortcuts";
import { useMetalRates, useProducts, useShop } from "@/hooks/use-shop-data";
import { toMetalIndex } from "@/lib/pricing";
import { cn, formatINR } from "@/lib/utils";

const FORMAT_KEY = "pos-print-format";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function PosPage() {
  const { shop } = useShop();
  const { data: products = [], isLoading } = useProducts();
  const { data: metalRates } = useMetalRates();
  const online = useOnline();

  const lines = useCartStore((s) => s.lines);
  const tier = useCartStore((s) => s.tier);
  const customer = useCartStore((s) => s.customer);
  const kind = useCartStore((s) => s.kind);
  const interState = useCartStore((s) => s.interState);
  const metalIndex = useCartStore((s) => s.metalIndex);
  const cart = useCartStore.getState;
  const summary = cartSummary({ lines, kind, interState });

  const searchRef = useRef<ProductSearchHandle>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [printJob, setPrintJob] = useState<CompletedSale | null>(null);
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [format, setFormat] = useState<PrintFormat>("thermal80");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FORMAT_KEY) as PrintFormat | null;
      if (saved && PRINT_FORMATS.some((f) => f.value === saved)) setFormat(saved);
    } catch {}
  }, []);
  const changeFormat = (f: PrintFormat) => {
    setFormat(f);
    try {
      localStorage.setItem(FORMAT_KEY, f);
    } catch {}
  };

  // Live copper/aluminium index reprices cable lines (except cashier-overridden rates).
  useEffect(() => {
    if (metalRates) cart().setMetalIndex(toMetalIndex(metalRates));
  }, [metalRates, cart]);

  const focusSearch = () => searchRef.current?.focus();
  const dialogOpen = pickerOpen || settleOpen;

  const toggleCustomer = () => {
    if (customer) {
      cart().setCustomer(null);
      toast("Walk-in cash · retail price");
    } else {
      setPickerOpen(true);
    }
  };

  const openSettle = () => {
    if (lines.length === 0) return toast.info("Cart is empty");
    setSettleOpen(true);
  };

  usePosShortcuts(
    {
      focusSearch,
      cycleUnit: () => cart().cycleUnit(),
      editQty: () => focusQtyInput(cart().selected),
      toggleCustomer,
      toggleInvoiceKind: () => cart().setKind(cart().kind === "tax_invoice" ? "estimate" : "tax_invoice"),
      settle: openSettle,
      moveSelection: (d) => cart().moveSelection(d),
      removeLine: () => cart().removeLine(),
      bumpQty: (d) => {
        const s = cart();
        const l = s.lines[s.selected];
        if (l) s.setQty(s.selected, l.qty + d);
      },
    },
    !dialogOpen,
  );

  const onScan = (code: string) => {
    searchRef.current?.clear();
    const p = products.find((x) => x.barcode === code || x.sku === code);
    if (!p) return toast.error(`No item with barcode ${code}`);
    cart().addProduct(p);
  };

  const onCompleted = (sale: CompletedSale, print: boolean) => {
    setLastSale(sale);
    if (print) setPrintJob(sale);
    focusSearch();
  };

  return (
    <div className="flex h-full flex-col">
      <BarcodeListener onScan={onScan} enabled={!dialogOpen} />

      {/* Top bar: customer / tier / invoice type */}
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <button
          onClick={toggleCustomer}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium",
            customer ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "bg-background",
          )}
        >
          {customer ? <Users className="size-4" /> : <User className="size-4" />}
          {customer ? (
            <>
              {customer.name}
              <span className="font-mono text-xs opacity-80">Bal {formatINR(Number(customer.balance))}</span>
              <X className="size-3.5 opacity-60" />
            </>
          ) : (
            "Walk-in Cash"
          )}
          <kbd>F4</kbd>
        </button>
        <Badge variant={tier === "trade" ? "warning" : "secondary"}>{tier === "trade" ? "Trade price" : "Retail price"}</Badge>

        <button
          onClick={() => cart().setKind(kind === "tax_invoice" ? "estimate" : "tax_invoice")}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
        >
          {kind === "tax_invoice" ? <Receipt className="size-4" /> : <FileText className="size-4" />}
          {kind === "tax_invoice" ? "GST Tax Invoice" : "Estimate (Non-GST)"}
          <kbd>F6</kbd>
        </button>
        {kind === "tax_invoice" && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={interState} onChange={(e) => cart().setInterState(e.target.checked)} />
            Inter-state (IGST)
          </label>
        )}

        {Object.entries(metalIndex).some(([, v]) => v?.enabled) && (
          <Badge variant="outline">
            {Object.entries(metalIndex)
              .filter(([, v]) => v?.enabled)
              .map(([m, v]) => `${m === "copper" ? "Cu" : "Al"} ₹${v!.rate}/kg`)
              .join(" · ")}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!online && (
            <Badge variant="destructive">
              <WifiOff /> Offline: cart is saved, settle when back online
            </Badge>
          )}
          <select
            value={format}
            onChange={(e) => changeFormat(e.target.value as PrintFormat)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Print format"
          >
            {PRINT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {lastSale && (
            <Button size="sm" variant="outline" onClick={() => setPrintJob({ ...lastSale })} title="Reprint last bill">
              <Printer /> {lastSale.invoice.invoice_no}
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 pt-3">
        <ProductSearch
          ref={searchRef}
          products={products}
          tier={tier}
          metalIndex={metalIndex}
          onAdd={(p, qty) => cart().addProduct(p, qty)}
          onCartKey={(k) => {
            const s = cart();
            if (k === "up") s.moveSelection(-1);
            else if (k === "down") s.moveSelection(1);
            else if (k === "delete") s.removeLine();
            else {
              const l = s.lines[s.selected];
              if (l) s.setQty(s.selected, l.qty + (k === "plus" ? 1 : -1));
            }
          }}
        />
        {isLoading && <p className="mt-1 text-xs text-muted-foreground">Loading catalogue…</p>}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t">
        <CartTable onDoneEditing={focusSearch} />
      </div>

      {/* Totals bar */}
      <footer className="flex items-center gap-6 border-t bg-muted/50 px-4 py-3">
        <div className="text-xs text-muted-foreground">
          <kbd>/</kbd> search · <kbd>↑</kbd>
          <kbd>↓</kbd> select · <kbd>F2</kbd> unit · <kbd>F3</kbd> qty · <kbd>+</kbd>
          <kbd>−</kbd> · <kbd>Del</kbd> remove
        </div>
        <div className="ml-auto flex items-baseline gap-6 text-sm">
          <span>
            Items <b>{lines.length}</b>
          </span>
          {kind === "tax_invoice" && (
            <>
              <span>
                Taxable <b className="font-mono">{formatINR(summary.taxable)}</b>
              </span>
              <span>
                GST <b className="font-mono">{formatINR(summary.cgst + summary.sgst + summary.igst)}</b>
              </span>
            </>
          )}
          <span className="font-mono text-3xl font-bold tabular-nums">{formatINR(summary.grandTotal)}</span>
        </div>
        <Button size="lg" onClick={openSettle} disabled={lines.length === 0 || !online}>
          Settle <kbd className="bg-primary-foreground/20 text-primary-foreground">F8</kbd>
        </Button>
      </footer>

      <CustomerPicker
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) focusSearch();
        }}
        onPick={(c) => {
          cart().setCustomer(c);
          toast(`${c.name} · ${c.type === "retail" ? "retail" : "trade"} price`);
        }}
      />
      <SettlementDialog
        open={settleOpen}
        onOpenChange={(o) => {
          setSettleOpen(o);
          if (!o) focusSearch();
        }}
        onCompleted={onCompleted}
      />
      {printJob && (
        <PrintableInvoice
          key={printJob.invoice.id}
          shop={shop}
          invoice={printJob.invoice}
          items={printJob.items}
          format={format}
          onPrinted={() => setPrintJob(null)}
        />
      )}
    </div>
  );
}

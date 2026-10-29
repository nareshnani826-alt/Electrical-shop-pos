"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { cartSummary, useCartStore } from "@/hooks/use-cart-store";
import { sellUnits } from "@/lib/pricing";
import { cn, formatINR } from "@/lib/utils";

interface Props {
  /** Return focus to the search box after a qty/rate edit is committed. */
  onDoneEditing: () => void;
}

export function focusQtyInput(index: number) {
  const el = document.querySelector<HTMLInputElement>(`[data-qty-input="${index}"]`);
  el?.focus();
  el?.select();
}

function NumberCell({
  value,
  onCommit,
  onDone,
  className,
  ...rest
}: {
  value: number;
  onCommit: (n: number) => void;
  onDone: () => void;
  className?: string;
} & Record<`data-${string}`, string | number>) {
  const ref = useRef<HTMLInputElement>(null);
  // Keep uncontrolled while focused so typing "2." isn't normalised mid-keystroke.
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = String(value);
  }, [value]);
  const commit = () => {
    const n = Number(ref.current?.value);
    if (Number.isFinite(n)) onCommit(n);
    else if (ref.current) ref.current.value = String(value);
  };
  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      step="any"
      defaultValue={value}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.ctrlKey) {
          e.preventDefault();
          commit();
          onDone();
        } else if (e.key === "Escape") {
          if (ref.current) ref.current.value = String(value);
          onDone();
        }
      }}
      className={cn(
        "w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right font-mono tabular-nums outline-none hover:border-input focus:border-ring focus:bg-background",
        className,
      )}
      {...rest}
    />
  );
}

export function CartTable({ onDoneEditing }: Props) {
  const lines = useCartStore((s) => s.lines);
  const selected = useCartStore((s) => s.selected);
  const kind = useCartStore((s) => s.kind);
  const interState = useCartStore((s) => s.interState);
  const { select, setQty, setRate, cycleUnit, removeLine } = useCartStore.getState();
  const summary = cartSummary({ lines, kind, interState });
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    bodyRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected, lines.length]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg">Cart is empty</p>
        <p className="text-sm">
          <kbd>/</kbd> search · scan barcode · <kbd>Enter</kbd> add · <kbd>F2</kbd> unit · <kbd>F4</kbd> customer ·{" "}
          <kbd>F8</kbd> settle
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="w-8 px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Item</th>
            <th className="w-16 px-2 py-2 text-left">HSN</th>
            <th className="w-24 px-2 py-2 text-right">Qty</th>
            <th className="w-20 px-2 py-2 text-center">Unit</th>
            <th className="w-28 px-2 py-2 text-right">Rate</th>
            <th className="w-14 px-2 py-2 text-right">GST</th>
            <th className="w-28 px-2 py-2 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {lines.map((l, i) => {
            const units = sellUnits(l.product);
            const unit = units[l.unitIndex];
            const isSel = i === selected;
            return (
              <tr
                key={l.key}
                data-row={i}
                onClick={() => select(i)}
                className={cn("border-b", isSel ? "bg-accent" : "hover:bg-muted/50")}
              >
                <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{l.product.name}</div>
                  {unit.isPack && (
                    <div className="text-xs text-muted-foreground">
                      = {l.qty * unit.factor} {l.product.base_unit}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{l.product.hsn_code}</td>
                <td className="px-1 py-1">
                  <NumberCell
                    data-qty-input={i}
                    value={l.qty}
                    onCommit={(n) => setQty(i, n)}
                    onDone={onDoneEditing}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    disabled={units.length < 2}
                    onClick={() => cycleUnit(i)}
                    title={units.length > 1 ? "F2 to switch unit" : undefined}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      units.length > 1 ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground",
                    )}
                  >
                    {unit.unit}
                  </button>
                </td>
                <td className="px-1 py-1">
                  <NumberCell
                    value={l.rate}
                    onCommit={(n) => n !== l.rate && setRate(i, n)}
                    onDone={onDoneEditing}
                    className={l.rateOverridden ? "text-amber-600" : undefined}
                  />
                </td>
                <td className="px-2 py-1.5 text-right text-xs text-muted-foreground">
                  {kind === "tax_invoice" ? `${Number(l.product.gst_rate)}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-medium tabular-nums">
                  {formatINR(summary.lines[i]?.total ?? 0)}
                </td>
                <td className="px-1">
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

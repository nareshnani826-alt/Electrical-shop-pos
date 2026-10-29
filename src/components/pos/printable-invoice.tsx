"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { amountInWords, formatINR, formatQty } from "@/lib/utils";
import type { Invoice, InvoiceItem, Shop } from "@/types/database.types";

export type PrintFormat = "thermal80" | "thermal58" | "a4";

export const PRINT_FORMATS: { value: PrintFormat; label: string }[] = [
  { value: "thermal80", label: "80mm roll" },
  { value: "thermal58", label: "58mm roll" },
  { value: "a4", label: "A4 GST invoice" },
];

const PAGE_CSS: Record<PrintFormat, string> = {
  thermal80: "@page { size: 80mm auto; margin: 2mm 0; }",
  thermal58: "@page { size: 58mm auto; margin: 2mm 0; }",
  a4: "@page { size: A4; margin: 10mm; }",
};

interface Props {
  shop: Shop;
  invoice: Invoice;
  items: InvoiceItem[];
  format: PrintFormat;
  /** Called after the browser print dialog closes. */
  onPrinted?: () => void;
}

const n = (x: number | string) => Number(x);
const dt = (s: string) =>
  new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Renders the invoice into a body-level #print-root (the only thing visible under @media print),
 * injects the matching @page size, then opens the print dialog once.
 */
export function PrintableInvoice({ shop, invoice, items, format, onPrinted }: Props) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById("print-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-root";
      document.body.appendChild(el);
    }
    setRoot(el);
  }, []);

  useEffect(() => {
    if (!root) return;
    const style = document.createElement("style");
    style.textContent = PAGE_CSS[format];
    document.head.appendChild(style);
    const done = () => onPrinted?.();
    window.addEventListener("afterprint", done, { once: true });
    // Wait one frame so the portal content (and the QR <img>) is in the DOM.
    const raf = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("afterprint", done);
      style.remove();
    };
    // Re-print only when a different invoice or format arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, invoice.id, format]);

  if (!root) return null;
  return createPortal(
    format === "a4" ? (
      <A4Invoice shop={shop} invoice={invoice} items={items} />
    ) : (
      <ThermalReceipt shop={shop} invoice={invoice} items={items} width={format === "thermal58" ? 58 : 80} />
    ),
    root,
  );
}

function ThermalReceipt({ shop, invoice, items, width }: Omit<Props, "format"> & { width: 58 | 80 }) {
  const isTax = invoice.kind === "tax_invoice";
  const taxTotal = n(invoice.cgst_total) + n(invoice.sgst_total) + n(invoice.igst_total);
  return (
    <div className="receipt" data-width={width}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "1.35em", fontWeight: 700 }}>{shop.name}</div>
        {shop.address && <div>{shop.address}</div>}
        {shop.phone && <div>Ph: {shop.phone}</div>}
        {isTax && shop.gstin && <div>GSTIN: {shop.gstin}</div>}
        <div style={{ fontWeight: 700, marginTop: 3 }}>{isTax ? "TAX INVOICE" : "ESTIMATE / MEMO"}</div>
      </div>
      <hr />
      <div>No: {invoice.invoice_no}</div>
      <div>{dt(invoice.created_at)}</div>
      {invoice.customer_name && <div>To: {invoice.customer_name}</div>}
      {isTax && invoice.customer_gstin && <div>GSTIN: {invoice.customer_gstin}</div>}
      <hr />
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Item</th>
            <th style={{ textAlign: "right" }}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                {it.name}
                <br />
                {formatQty(n(it.qty))} {it.unit} × {n(it.rate).toFixed(2)}
                {isTax && ` · ${it.hsn_code} · ${n(it.gst_rate)}%`}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{n(it.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {isTax && (
            <>
              <Row l="Taxable" r={n(invoice.taxable_total)} />
              {invoice.inter_state ? (
                <Row l="IGST" r={n(invoice.igst_total)} />
              ) : (
                <>
                  <Row l="CGST" r={n(invoice.cgst_total)} />
                  <Row l="SGST" r={n(invoice.sgst_total)} />
                </>
              )}
            </>
          )}
          {n(invoice.round_off) !== 0 && <Row l="Round off" r={n(invoice.round_off)} />}
          <tr style={{ fontWeight: 700, fontSize: "1.25em" }}>
            <td>TOTAL</td>
            <td style={{ textAlign: "right" }}>{formatINR(n(invoice.grand_total))}</td>
          </tr>
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {n(invoice.paid_cash) > 0 && <Row l="Cash" r={n(invoice.paid_cash)} />}
          {n(invoice.paid_upi) > 0 && <Row l="UPI" r={n(invoice.paid_upi)} />}
          {n(invoice.on_credit) > 0 && <Row l="On Khata" r={n(invoice.on_credit)} bold />}
        </tbody>
      </table>
      {isTax && taxTotal > 0 && <div style={{ marginTop: 3 }}>Incl. GST {formatINR(taxTotal)}</div>}
      {shop.upi_vpa && n(invoice.on_credit) > 0 && (
        <div style={{ textAlign: "center", marginTop: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/upi?shop=${shop.id}&am=${n(invoice.on_credit).toFixed(2)}&tr=${encodeURIComponent(invoice.invoice_no)}`}
            alt=""
            style={{ width: width === 58 ? "32mm" : "40mm", height: "auto", margin: "0 auto" }}
          />
          <div>Scan to pay dues · {shop.upi_vpa}</div>
        </div>
      )}
      <hr />
      <div style={{ textAlign: "center" }}>Thank you! Visit again.</div>
      <div style={{ textAlign: "center", fontSize: "0.85em" }}>Goods once sold are subject to shop policy.</div>
    </div>
  );
}

function Row({ l, r, bold }: { l: string; r: number; bold?: boolean }) {
  return (
    <tr style={bold ? { fontWeight: 700 } : undefined}>
      <td>{l}</td>
      <td style={{ textAlign: "right" }}>{r.toFixed(2)}</td>
    </tr>
  );
}

function A4Invoice({ shop, invoice, items }: Omit<Props, "format">) {
  const isTax = invoice.kind === "tax_invoice";
  // HSN-wise summary, required on B2B tax invoices.
  const hsn = new Map<string, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const it of items) {
    const k = `${it.hsn_code}|${it.gst_rate}`;
    const a = hsn.get(k) ?? { rate: n(it.gst_rate), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    a.taxable += n(it.taxable_value);
    a.cgst += n(it.cgst);
    a.sgst += n(it.sgst);
    a.igst += n(it.igst);
    hsn.set(k, a);
  }
  const td = { textAlign: "right" as const };

  return (
    <div className="a4-invoice">
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 6 }}>
        <div>
          <div style={{ fontSize: "18pt", fontWeight: 700 }}>{shop.name}</div>
          {shop.address && <div>{shop.address}</div>}
          {shop.phone && <div>Phone: {shop.phone}</div>}
          {isTax && shop.gstin && <div>GSTIN: {shop.gstin} · State code: {shop.state_code}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "14pt", fontWeight: 700 }}>{isTax ? "TAX INVOICE" : "ESTIMATE"}</div>
          <div>No: {invoice.invoice_no}</div>
          <div>Date: {dt(invoice.created_at)}</div>
          {isTax && <div>Place of supply: {invoice.place_of_supply}</div>}
        </div>
      </div>

      <div style={{ margin: "8px 0" }}>
        <strong>Bill to:</strong> {invoice.customer_name ?? "Cash / Walk-in"}
        {isTax && invoice.customer_gstin && <> · GSTIN {invoice.customer_gstin}</>}
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: "left" }}>Description</th>
            {isTax && <th>HSN</th>}
            <th>Qty</th>
            <th>Rate</th>
            {isTax && <th>Taxable</th>}
            {isTax && <th>GST %</th>}
            {isTax && <th>{invoice.inter_state ? "IGST" : "CGST+SGST"}</th>}
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td style={td}>{i + 1}</td>
              <td>{it.name}</td>
              {isTax && <td>{it.hsn_code}</td>}
              <td style={td}>
                {formatQty(n(it.qty))} {it.unit}
              </td>
              <td style={td}>{n(it.rate).toFixed(2)}</td>
              {isTax && <td style={td}>{n(it.taxable_value).toFixed(2)}</td>}
              {isTax && <td style={td}>{n(it.gst_rate)}</td>}
              {isTax && <td style={td}>{(n(it.cgst) + n(it.sgst) + n(it.igst)).toFixed(2)}</td>}
              <td style={td}>{n(it.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 16, marginTop: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {isTax && (
            <table>
              <thead>
                <tr>
                  <th>HSN</th>
                  <th>Taxable</th>
                  <th>Rate</th>
                  {invoice.inter_state ? (
                    <th>IGST</th>
                  ) : (
                    <>
                      <th>CGST</th>
                      <th>SGST</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...hsn.entries()].map(([k, v]) => (
                  <tr key={k}>
                    <td>{k.split("|")[0]}</td>
                    <td style={td}>{v.taxable.toFixed(2)}</td>
                    <td style={td}>{v.rate}%</td>
                    {invoice.inter_state ? (
                      <td style={td}>{v.igst.toFixed(2)}</td>
                    ) : (
                      <>
                        <td style={td}>{v.cgst.toFixed(2)}</td>
                        <td style={td}>{v.sgst.toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ marginTop: 8 }}>
            <strong>Amount in words:</strong> {amountInWords(n(invoice.grand_total))}
          </p>
        </div>
        <table style={{ width: "70mm" }}>
          <tbody>
            {isTax && <A4Row l="Taxable value" r={n(invoice.taxable_total)} />}
            {isTax && !invoice.inter_state && <A4Row l="CGST" r={n(invoice.cgst_total)} />}
            {isTax && !invoice.inter_state && <A4Row l="SGST" r={n(invoice.sgst_total)} />}
            {isTax && invoice.inter_state && <A4Row l="IGST" r={n(invoice.igst_total)} />}
            <A4Row l="Round off" r={n(invoice.round_off)} />
            <A4Row l="Grand total" r={n(invoice.grand_total)} bold />
            {n(invoice.on_credit) > 0 && <A4Row l="Balance on account" r={n(invoice.on_credit)} />}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
        <div style={{ fontSize: "9pt" }}>
          {isTax ? "Certified that the particulars given above are true and correct." : "This is not a tax invoice."}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ height: 40 }} />
          For {shop.name}
          <br />
          Authorised Signatory
        </div>
      </div>
    </div>
  );
}

function A4Row({ l, r, bold }: { l: string; r: number; bold?: boolean }) {
  return (
    <tr style={bold ? { fontWeight: 700, fontSize: "12pt" } : undefined}>
      <td>{l}</td>
      <td style={{ textAlign: "right" }}>{r.toFixed(2)}</td>
    </tr>
  );
}

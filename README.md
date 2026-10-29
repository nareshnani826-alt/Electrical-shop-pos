# Electrical Shop POS

Billing counter, coil/metre inventory, and electrician Khata for Indian electrical hardware retail.
Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Supabase · Zustand · TanStack Query.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` in the SQL editor, or use `supabase db push`.
2. `cp .env.local.example .env.local` and fill in the project URL and publishable (anon) key.
3. `npm install && npm run dev`, then open http://localhost:3000, sign up, and create your shop.
4. Under **Settings**, add your UPI ID to enable QR codes. Under **Inventory**, add items.

`npm test` runs the GST math tests. `npm run typecheck` runs the type checker.

## Counter keys

| Key | Action |
| --- | --- |
| `/` or `F1` | Focus search (type `2.5*wire` to add 2.5 units) |
| `Enter` | Add highlighted item, qty 1 (or the prefixed qty) |
| `↑` `↓` / `+` `−` / `Del` | Select cart line / change qty / remove |
| `F2` | Cycle unit of selected line (m ↔ coil, pc ↔ box) |
| `F3` | Edit qty of selected line |
| `F4` | Walk-in cash ↔ pick electrician (trade price) |
| `F6` | GST tax invoice ↔ Non-GST estimate |
| `F8` / `Ctrl+Enter` | Settle |
| In settle: `F5` `F6` `F7` | All cash / all UPI (shows QR) / all to Khata |
| In settle: `Enter` / `Shift+Enter` | Save & print / save only |
| `Alt+1…5` | Billing / Inventory / Khata / Reports / Settings |

USB/HID barcode scanners work anywhere on the billing screen.

## Design notes

- **Stock lives in base units** (metre / piece). Pack units (coil, box, bundle) convert with
  `products.pack_size` at sale time. Optional pack price overrides handle "full coil" discounts.
- **`complete_sale` RPC is the source of truth.** It numbers the invoice per financial year and
  series, recomputes GST from the line rates, deducts stock and posts the Khata debit in one
  transaction. `src/lib/gst-calculator.ts` mirrors its math exactly to show the counter preview.
- **Balances and stock can't be edited directly.** Column grants block it. They change only through
  the ledger trigger, `complete_sale`, and `adjust_stock`. Ledger rows are append-only.
- **Metal index:** when enabled, a cable's rate shifts by `(live ₹/kg − ref ₹/kg) × kg per metre`.
  A rate the cashier typed by hand is kept.
- **Negative stock is allowed** so the counter never blocks. Inventory flags it.
- **Offline:** the cart survives reloads and lost connections (localStorage). Settling a sale needs a
  connection.
- **Printing:** the print format is chosen per counter (80mm, 58mm, A4). Only `#print-root` prints,
  and `@page` is set to match the format.

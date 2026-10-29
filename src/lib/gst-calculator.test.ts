import { test } from "node:test";
import assert from "node:assert/strict";
import { calcInvoice, calcLine } from "./gst-calculator.ts";

test("inclusive 18% intra-state splits CGST/SGST", () => {
  const l = calcLine({ rate: 118, qty: 1, gstRate: 18, priceIncludesTax: true }, "intra");
  assert.deepEqual(l, { amount: 118, taxable: 100, cgst: 9, sgst: 9, igst: 0, total: 118 });
});

test("exclusive 28% inter-state is IGST", () => {
  const l = calcLine({ rate: 100, qty: 2, gstRate: 28, priceIncludesTax: false }, "inter");
  assert.equal(l.igst, 56);
  assert.equal(l.total, 256);
});

test("odd paise go to SGST so CGST+SGST equals tax exactly", () => {
  const l = calcLine({ rate: 10.01, qty: 1, gstRate: 18, priceIncludesTax: false }, "intra");
  // tax = 1.80 (1.8018 → 1.80)
  assert.equal(Math.round((l.cgst + l.sgst) * 100), 180);
});

test("fractional metres don't drift", () => {
  const l = calcLine({ rate: 12.35, qty: 2.5, gstRate: 18, priceIncludesTax: true }, "intra");
  assert.equal(l.amount, 30.88);
  assert.equal(l.total, 30.88);
});

test("invoice rounds to rupee with round-off", () => {
  const s = calcInvoice(
    [
      { rate: 45.5, qty: 3, gstRate: 18, priceIncludesTax: true },
      { rate: 1250, qty: 1, gstRate: 28, priceIncludesTax: true },
    ],
    "intra",
  );
  assert.equal(s.rawTotal, 1386.5);
  assert.equal(s.grandTotal, 1387);
  assert.equal(s.roundOff, 0.5);
  assert.equal(s.byRate.length, 2);
});

test("estimate memo charges no tax", () => {
  const s = calcInvoice([{ rate: 100, qty: 1, gstRate: 18, priceIncludesTax: false }], "intra", false);
  assert.equal(s.grandTotal, 100);
  assert.equal(s.cgst, 0);
});

test("matches server complete_sale for a mixed bill (see supabase test)", () => {
  const s = calcInvoice(
    [
      { rate: 1530, qty: 1, gstRate: 18, priceIncludesTax: true },
      { rate: 20, qty: 2.5, gstRate: 18, priceIncludesTax: true },
      { rate: 1000, qty: 1, gstRate: 28, priceIncludesTax: false },
    ],
    "intra",
  );
  assert.equal(s.taxable, 2338.98);
  assert.equal(s.cgst, 260.52);
  assert.equal(s.sgst, 260.5);
  assert.equal(s.grandTotal, 2860);
});

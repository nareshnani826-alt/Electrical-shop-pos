import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { buildUpiUri } from "@/lib/upi";

/**
 * GET /api/upi?shop=<uuid>&am=123.00[&tn=note][&tr=INV/2026-27/00012][&format=svg|png|json]
 *
 * The payee VPA is read from the shop record (RLS-scoped to the signed-in member), never from
 * the query string, so a QR from this endpoint always pays the shop's own account.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const shopId = sp.get("shop");
  const amount = sp.get("am") ? Number(sp.get("am")) : undefined;
  const format = sp.get("format") ?? "svg";
  if (!shopId) return NextResponse.json({ error: "shop is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: shop, error } = await supabase
    .from("shops")
    .select("name, upi_vpa, upi_payee_name")
    .eq("id", shopId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shop) return NextResponse.json({ error: "shop not found" }, { status: 404 });
  if (!shop.upi_vpa) return NextResponse.json({ error: "shop has no UPI ID configured" }, { status: 422 });

  let uri: string;
  try {
    uri = buildUpiUri({
      vpa: shop.upi_vpa,
      payeeName: shop.upi_payee_name ?? shop.name,
      amount,
      note: sp.get("tn") ?? undefined,
      txnRef: sp.get("tr") ?? undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const headers = { "Cache-Control": "private, max-age=300" };
  if (format === "json") return NextResponse.json({ uri }, { headers });
  if (format === "png") {
    const png = await QRCode.toBuffer(uri, { errorCorrectionLevel: "M", margin: 1, width: 400 });
    return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
  }
  const svg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}

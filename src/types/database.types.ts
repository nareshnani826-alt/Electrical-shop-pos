// Hand-maintained to match supabase/migrations/0001_init.sql.
// Regenerate with: npx supabase gen types typescript --project-id <id> > src/types/database.types.ts

export type MemberRole = "owner" | "cashier";
export type CustomerType = "electrician" | "contractor" | "retail";
export type PriceTier = "retail" | "trade";
export type InvoiceKind = "tax_invoice" | "estimate";
export type MetalKind = "copper" | "aluminium";
export type LedgerType = "sale" | "payment" | "adjustment" | "opening";

export type Shop = {
  id: string;
  name: string;
  gstin: string | null;
  state_code: string;
  address: string | null;
  phone: string | null;
  upi_vpa: string | null;
  upi_payee_name: string | null;
  invoice_prefix: string;
  estimate_prefix: string;
  created_at: string;
};

export type ShopMember = {
  shop_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type Product = {
  id: string;
  shop_id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  hsn_code: string;
  gst_rate: number;
  price_includes_tax: boolean;
  base_unit: string;
  pack_unit: string | null;
  pack_size: number | null;
  retail_price: number;
  trade_price: number;
  retail_pack_price: number | null;
  trade_pack_price: number | null;
  cost_price: number | null;
  metal: MetalKind | null;
  metal_kg_per_base_unit: number | null;
  metal_ref_rate: number | null;
  stock_base_qty: number;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MetalRate = {
  shop_id: string;
  metal: MetalKind;
  rate_per_kg: number;
  enabled: boolean;
  updated_at: string;
};

export type Customer = {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  type: CustomerType;
  gstin: string | null;
  credit_limit: number;
  balance: number;
  last_txn_at: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: number;
  shop_id: string;
  customer_id: string;
  invoice_id: string | null;
  entry_type: LedgerType;
  amount: number;
  mode: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  shop_id: string;
  invoice_no: string;
  kind: InvoiceKind;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  price_tier: PriceTier;
  place_of_supply: string;
  inter_state: boolean;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  round_off: number;
  grand_total: number;
  paid_cash: number;
  paid_upi: number;
  on_credit: number;
  created_by: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: number;
  invoice_id: string;
  product_id: string | null;
  name: string;
  hsn_code: string;
  unit: string;
  unit_factor: number;
  qty: number;
  rate: number;
  price_includes_tax: boolean;
  gst_rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
};

export type CompleteSalePayload = {
  kind: InvoiceKind;
  customer_id: string | null;
  price_tier: PriceTier;
  inter_state: boolean;
  paid_cash: number;
  paid_upi: number;
  items: { product_id: string; unit: string; unit_factor: number; qty: number; rate: number }[];
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      shops: Table<Shop>;
      shop_members: Table<ShopMember>;
      products: Table<Product, Omit<Product, "id" | "created_at" | "updated_at"> & Partial<Pick<Product, "id">>>;
      metal_rates: Table<MetalRate>;
      customers: Table<Customer, Pick<Customer, "shop_id" | "name"> & Partial<Omit<Customer, "balance">>, Partial<Omit<Customer, "balance" | "shop_id">>>;
      ledger_entries: Table<LedgerEntry, Pick<LedgerEntry, "shop_id" | "customer_id" | "entry_type" | "amount"> & Partial<Pick<LedgerEntry, "mode" | "note" | "invoice_id">>, never>;
      invoices: Table<Invoice, never, never>;
      invoice_items: Table<InvoiceItem, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      complete_sale: { Args: { p_shop_id: string; p_payload: CompleteSalePayload }; Returns: Invoice };
      adjust_stock: { Args: { p_product_id: string; p_delta_base_qty: number; p_reason: string; p_note?: string }; Returns: Product };
      create_shop: { Args: { p_name: string; p_state_code: string; p_gstin?: string }; Returns: string };
      is_shop_member: { Args: { p_shop_id: string }; Returns: boolean };
    };
    Enums: {
      member_role: MemberRole;
      customer_type: CustomerType;
      price_tier: PriceTier;
      invoice_kind: InvoiceKind;
      metal_kind: MetalKind;
      ledger_type: LedgerType;
    };
    CompositeTypes: Record<string, never>;
  };
};

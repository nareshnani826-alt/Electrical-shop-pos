-- Electrical Shop POS: core schema
-- Money is numeric(12,2) rupees. Quantities are numeric(14,3) in the product's BASE unit
-- (metre for wire/conduit, piece for switches/fasteners). Pack units (coil/box/bundle)
-- are converted to base units with products.pack_size at sale time.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role   as enum ('owner', 'cashier');
create type public.customer_type as enum ('electrician', 'contractor', 'retail');
create type public.price_tier    as enum ('retail', 'trade');
create type public.invoice_kind  as enum ('tax_invoice', 'estimate');
create type public.metal_kind    as enum ('copper', 'aluminium');
create type public.ledger_type   as enum ('sale', 'payment', 'adjustment', 'opening');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.shops (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state_code      char(2) not null default '27',      -- GST state code, e.g. 27 = Maharashtra
  address         text,
  phone           text,
  upi_vpa         text,                               -- e.g. shopname@okhdfcbank
  upi_payee_name  text,
  invoice_prefix  text not null default 'INV',
  estimate_prefix text not null default 'EST',
  created_at      timestamptz not null default now()
);

create table public.shop_members (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.member_role not null default 'cashier',
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index on public.shop_members (user_id);

create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalogue & stock
-- ---------------------------------------------------------------------------
create table public.products (
  id                     uuid primary key default gen_random_uuid(),
  shop_id                uuid not null references public.shops(id) on delete cascade,
  sku                    text,
  barcode                text,
  name                   text not null,
  brand                  text,
  category               text,
  hsn_code               text not null check (hsn_code ~ '^[0-9]{4,8}$'),
  gst_rate               numeric(5,2) not null default 18 check (gst_rate in (0, 5, 12, 18, 28)),
  price_includes_tax     boolean not null default true,
  base_unit              text not null default 'pc',    -- 'm' | 'pc' | 'kg' | 'ft'
  pack_unit              text,                          -- 'coil' | 'box' | 'bundle' | null
  pack_size              numeric(14,3) check (pack_size is null or pack_size > 0),
  retail_price           numeric(12,2) not null check (retail_price >= 0),  -- per base unit
  trade_price            numeric(12,2) not null check (trade_price >= 0),   -- per base unit
  retail_pack_price      numeric(12,2),                 -- optional override for a full pack
  trade_pack_price       numeric(12,2),
  cost_price             numeric(12,2),
  metal                  public.metal_kind,             -- cable conductor, drives metal-index pricing
  metal_kg_per_base_unit numeric(10,5),                 -- conductor kg per metre
  metal_ref_rate         numeric(10,2),                 -- Rs/kg the list prices were set at
  stock_base_qty         numeric(14,3) not null default 0,
  reorder_level          numeric(14,3) not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check ((pack_unit is null) = (pack_size is null)),
  check (metal is null or (metal_kg_per_base_unit is not null and metal_ref_rate is not null))
);
create unique index products_shop_barcode_key on public.products (shop_id, barcode) where barcode is not null;
create unique index products_shop_sku_key     on public.products (shop_id, sku)     where sku is not null;
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create index on public.products (shop_id, is_active);

create table public.metal_rates (
  shop_id     uuid not null references public.shops(id) on delete cascade,
  metal       public.metal_kind not null,
  rate_per_kg numeric(10,2) not null check (rate_per_kg > 0),
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (shop_id, metal)
);

create table public.stock_movements (
  id             bigint generated always as identity primary key,
  shop_id        uuid not null references public.shops(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  delta_base_qty numeric(14,3) not null,
  reason         text not null,                 -- 'sale' | 'purchase' | 'adjustment'
  invoice_id     uuid,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on public.stock_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Customers & Khata
-- ---------------------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  name         text not null,
  phone        text check (phone is null or phone ~ '^[0-9]{10}$'),
  type         public.customer_type not null default 'electrician',
  gstin        text,
  credit_limit numeric(12,2) not null default 0,
  balance      numeric(12,2) not null default 0,   -- positive = customer owes the shop
  last_txn_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.customers (shop_id, name);
create unique index customers_shop_phone_key on public.customers (shop_id, phone) where phone is not null;

create table public.ledger_entries (
  id          bigint generated always as identity primary key,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id  uuid,
  entry_type  public.ledger_type not null,
  amount      numeric(12,2) not null check (amount <> 0),  -- + debit (owes more), - credit (paid)
  mode        text,                                        -- 'cash' | 'upi' | null
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  check (entry_type <> 'payment' or amount < 0),
  check (entry_type <> 'sale' or amount > 0)
);
create index on public.ledger_entries (customer_id, created_at desc);

-- Keep customers.balance in sync. Ledger rows are append-only (no update/delete policy).
create or replace function public.apply_ledger_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.customers
     set balance = balance + new.amount, last_txn_at = new.created_at
   where id = new.customer_id and shop_id = new.shop_id;
  if not found then
    raise exception 'customer % not in shop %', new.customer_id, new.shop_id;
  end if;
  return new;
end $$;

create trigger ledger_entries_apply after insert on public.ledger_entries
for each row execute function public.apply_ledger_entry();

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
-- GST rules require a consecutive serial per financial year, separately per series.
create table public.invoice_series (
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind    public.invoice_kind not null,
  fy      text not null,                      -- '2026-27'
  last_no integer not null default 1,     -- last serial issued
  primary key (shop_id, kind, fy)
);

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  invoice_no       text not null,
  kind             public.invoice_kind not null,
  customer_id      uuid references public.customers(id),
  customer_name    text,
  customer_gstin   text,
  price_tier       public.price_tier not null,
  place_of_supply  char(2) not null,
  inter_state      boolean not null default false,
  taxable_total    numeric(12,2) not null,
  cgst_total       numeric(12,2) not null,
  sgst_total       numeric(12,2) not null,
  igst_total       numeric(12,2) not null,
  round_off        numeric(6,2)  not null,
  grand_total      numeric(12,2) not null,
  paid_cash        numeric(12,2) not null default 0,
  paid_upi         numeric(12,2) not null default 0,
  on_credit        numeric(12,2) not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (shop_id, invoice_no),
  check (paid_cash + paid_upi + on_credit = grand_total),
  check (on_credit = 0 or customer_id is not null)
);
create index on public.invoices (shop_id, created_at desc);

create table public.invoice_items (
  id            bigint generated always as identity primary key,
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  product_id    uuid references public.products(id),
  name          text not null,
  hsn_code      text not null,
  unit          text not null,          -- unit sold in: 'm', 'coil', 'pc', 'box'...
  unit_factor   numeric(14,3) not null, -- base units per sold unit
  qty           numeric(14,3) not null check (qty > 0),
  rate          numeric(12,2) not null, -- per sold unit, as entered (incl. or excl. tax per flag)
  price_includes_tax boolean not null,
  gst_rate      numeric(5,2) not null,
  taxable_value numeric(12,2) not null,
  cgst          numeric(12,2) not null,
  sgst          numeric(12,2) not null,
  igst          numeric(12,2) not null,
  line_total    numeric(12,2) not null
);
create index on public.invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- RPC: create_shop  (first-run onboarding)
-- ---------------------------------------------------------------------------
create or replace function public.create_shop(p_name text, p_state_code char(2), p_gstin text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.shops (name, state_code, gstin) values (p_name, p_state_code, nullif(p_gstin, ''))
  returning id into v_shop;
  insert into public.shop_members (shop_id, user_id, role) values (v_shop, auth.uid(), 'owner');
  insert into public.metal_rates (shop_id, metal, rate_per_kg) values
    (v_shop, 'copper', 850), (v_shop, 'aluminium', 240);
  return v_shop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: complete_sale
-- Atomically numbers the invoice, recomputes GST server-side from the line rates,
-- deducts stock in base units and posts the Khata debit.
--
-- p_payload = {
--   kind, customer_id?, price_tier, inter_state?,
--   paid_cash, paid_upi,                       -- on_credit is derived: total - cash - upi
--   items: [{ product_id, unit, unit_factor, qty, rate }]
-- }
-- Math must stay in lockstep with src/lib/gst-calculator.ts.
-- ---------------------------------------------------------------------------
create or replace function public.complete_sale(p_shop_id uuid, p_payload jsonb)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_shop      public.shops;
  v_kind      public.invoice_kind := (p_payload->>'kind')::public.invoice_kind;
  v_customer  public.customers;
  v_inter     boolean := coalesce((p_payload->>'inter_state')::boolean, false);
  v_fy        text;
  v_no        integer;
  v_invoice   public.invoices;
  v_item      jsonb;
  v_prod      public.products;
  v_qty       numeric; v_factor numeric; v_rate numeric;
  v_amount    numeric; v_taxable numeric; v_tax numeric;
  v_cgst      numeric; v_sgst numeric; v_igst numeric;
  t_taxable   numeric := 0; t_cgst numeric := 0; t_sgst numeric := 0; t_igst numeric := 0;
  v_raw_total numeric; v_grand numeric;
  v_cash      numeric := round(coalesce((p_payload->>'paid_cash')::numeric, 0), 2);
  v_upi       numeric := round(coalesce((p_payload->>'paid_upi')::numeric, 0), 2);
  v_credit    numeric;
  v_lines     jsonb := '[]'::jsonb;
begin
  if not public.is_shop_member(p_shop_id) then raise exception 'forbidden'; end if;
  if jsonb_array_length(coalesce(p_payload->'items', '[]')) = 0 then raise exception 'empty cart'; end if;
  if v_cash < 0 or v_upi < 0 then raise exception 'negative payment'; end if;

  select * into v_shop from public.shops where id = p_shop_id;

  if p_payload->>'customer_id' is not null then
    select * into v_customer from public.customers
     where id = (p_payload->>'customer_id')::uuid and shop_id = p_shop_id;
    if not found then raise exception 'unknown customer'; end if;
  end if;

  -- Pass 1: price every line.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    select * into v_prod from public.products
     where id = (v_item->>'product_id')::uuid and shop_id = p_shop_id;
    if not found then raise exception 'unknown product %', v_item->>'product_id'; end if;

    v_qty    := (v_item->>'qty')::numeric;
    v_factor := (v_item->>'unit_factor')::numeric;
    v_rate   := round((v_item->>'rate')::numeric, 2);
    if v_qty <= 0 or v_factor <= 0 or v_rate < 0 then raise exception 'bad line for %', v_prod.name; end if;

    v_amount := round(v_rate * v_qty, 2);
    if v_kind = 'estimate' or v_prod.gst_rate = 0 then
      v_taxable := v_amount; v_tax := 0;
    elsif v_prod.price_includes_tax then
      v_taxable := round(v_amount * 100 / (100 + v_prod.gst_rate), 2);
      v_tax     := v_amount - v_taxable;
    else
      v_taxable := v_amount;
      v_tax     := round(v_amount * v_prod.gst_rate / 100, 2);
    end if;

    if v_inter then
      v_igst := v_tax; v_cgst := 0; v_sgst := 0;
    else
      v_igst := 0; v_cgst := round(v_tax / 2, 2); v_sgst := v_tax - v_cgst;
    end if;

    t_taxable := t_taxable + v_taxable; t_cgst := t_cgst + v_cgst;
    t_sgst := t_sgst + v_sgst;          t_igst := t_igst + v_igst;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'hsn', v_prod.hsn_code,
      'unit', v_item->>'unit', 'factor', v_factor, 'qty', v_qty, 'rate', v_rate,
      'incl', v_prod.price_includes_tax,
      'gst', case when v_kind = 'estimate' then 0 else v_prod.gst_rate end,
      'taxable', v_taxable, 'cgst', v_cgst, 'sgst', v_sgst, 'igst', v_igst,
      'total', v_taxable + v_cgst + v_sgst + v_igst);
  end loop;

  v_raw_total := t_taxable + t_cgst + t_sgst + t_igst;
  v_grand     := round(v_raw_total, 0);
  v_credit    := v_grand - v_cash - v_upi;

  if v_credit < 0 then
    -- Over-tender (cash change given back) is recorded as exact cash.
    v_cash := v_grand - v_upi; v_credit := 0;
    if v_cash < 0 then raise exception 'UPI amount exceeds bill total'; end if;
  end if;
  if v_credit > 0 and v_customer.id is null then
    raise exception 'credit sale needs a Khata customer';
  end if;

  -- Number the invoice (row lock serialises concurrent counters).
  v_fy := case when extract(month from now() at time zone 'Asia/Kolkata') >= 4
            then to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' ||
                 to_char((now() at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
            else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' ||
                 to_char(now() at time zone 'Asia/Kolkata', 'YY') end;

  insert into public.invoice_series (shop_id, kind, fy) values (p_shop_id, v_kind, v_fy)
  on conflict (shop_id, kind, fy) do update set last_no = public.invoice_series.last_no + 1
  returning last_no into v_no;

  insert into public.invoices (
    shop_id, invoice_no, kind, customer_id, customer_name, customer_gstin, price_tier,
    place_of_supply, inter_state, taxable_total, cgst_total, sgst_total, igst_total,
    round_off, grand_total, paid_cash, paid_upi, on_credit)
  values (
    p_shop_id,
    (case when v_kind = 'tax_invoice' then v_shop.invoice_prefix else v_shop.estimate_prefix end)
      || '/' || v_fy || '/' || lpad(v_no::text, 5, '0'),
    v_kind, v_customer.id, v_customer.name, v_customer.gstin,
    coalesce((p_payload->>'price_tier')::public.price_tier, 'retail'),
    v_shop.state_code, v_inter, t_taxable, t_cgst, t_sgst, t_igst,
    v_grand - v_raw_total, v_grand, v_cash, v_upi, v_credit)
  returning * into v_invoice;

  insert into public.invoice_items (
    invoice_id, product_id, name, hsn_code, unit, unit_factor, qty, rate, price_includes_tax,
    gst_rate, taxable_value, cgst, sgst, igst, line_total)
  select v_invoice.id, (l->>'product_id')::uuid, l->>'name', l->>'hsn', l->>'unit',
         (l->>'factor')::numeric, (l->>'qty')::numeric, (l->>'rate')::numeric, (l->>'incl')::boolean,
         (l->>'gst')::numeric, (l->>'taxable')::numeric, (l->>'cgst')::numeric,
         (l->>'sgst')::numeric, (l->>'igst')::numeric, (l->>'total')::numeric
    from jsonb_array_elements(v_lines) l;

  -- Stock: negative stock is allowed (counter must never block); inventory flags it.
  update public.products p
     set stock_base_qty = p.stock_base_qty - s.base_qty, updated_at = now()
    from (select (l->>'product_id')::uuid pid, sum((l->>'qty')::numeric * (l->>'factor')::numeric) base_qty
            from jsonb_array_elements(v_lines) l group by 1) s
   where p.id = s.pid;

  insert into public.stock_movements (shop_id, product_id, delta_base_qty, reason, invoice_id)
  select p_shop_id, (l->>'product_id')::uuid, -((l->>'qty')::numeric * (l->>'factor')::numeric), 'sale', v_invoice.id
    from jsonb_array_elements(v_lines) l;

  if v_credit > 0 then
    insert into public.ledger_entries (shop_id, customer_id, invoice_id, entry_type, amount, note)
    values (p_shop_id, v_customer.id, v_invoice.id, 'sale', v_credit, 'Bill ' || v_invoice.invoice_no);
  end if;

  return v_invoice;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: adjust_stock (purchase inward / correction), in base or pack units
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(p_product_id uuid, p_delta_base_qty numeric, p_reason text, p_note text default null)
returns public.products language plpgsql security definer set search_path = '' as $$
declare v_prod public.products;
begin
  select * into v_prod from public.products where id = p_product_id;
  if not found or not public.is_shop_member(v_prod.shop_id) then raise exception 'forbidden'; end if;
  update public.products set stock_base_qty = stock_base_qty + p_delta_base_qty, updated_at = now()
   where id = p_product_id returning * into v_prod;
  insert into public.stock_movements (shop_id, product_id, delta_base_qty, reason, note)
  values (v_prod.shop_id, p_product_id, p_delta_base_qty, p_reason, p_note);
  return v_prod;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.shops           enable row level security;
alter table public.shop_members    enable row level security;
alter table public.products        enable row level security;
alter table public.metal_rates     enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers       enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.invoice_series  enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_items   enable row level security;

create policy shops_select on public.shops for select to authenticated using (public.is_shop_member(id));
create policy shops_update on public.shops for update to authenticated using (public.is_shop_owner(id));

create policy members_select on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_shop_owner(shop_id));
create policy members_owner_write on public.shop_members for all to authenticated
  using (public.is_shop_owner(shop_id)) with check (public.is_shop_owner(shop_id));

create policy products_rw on public.products for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy customers_rw on public.customers for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy metal_select on public.metal_rates for select to authenticated using (public.is_shop_member(shop_id));
create policy metal_update on public.metal_rates for update to authenticated using (public.is_shop_owner(shop_id));

-- Append-only financial records: read + insert only; writes of invoices go through complete_sale.
create policy ledger_select on public.ledger_entries for select to authenticated using (public.is_shop_member(shop_id));
create policy ledger_insert on public.ledger_entries for insert to authenticated
  with check (public.is_shop_member(shop_id) and entry_type in ('payment', 'adjustment', 'opening'));

create policy movements_select on public.stock_movements for select to authenticated using (public.is_shop_member(shop_id));
create policy invoices_select on public.invoices for select to authenticated using (public.is_shop_member(shop_id));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_shop_member(i.shop_id)));
create policy series_select on public.invoice_series for select to authenticated using (public.is_shop_member(shop_id));

revoke execute on function public.complete_sale(uuid, jsonb) from anon, public;
revoke execute on function public.adjust_stock(uuid, numeric, text, text) from anon, public;
revoke execute on function public.create_shop(text, char, text) from anon, public;
grant execute on function public.complete_sale(uuid, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text, text) to authenticated;
grant execute on function public.create_shop(text, char, text) to authenticated;

-- Balances move only through the ledger trigger; stock only through complete_sale / adjust_stock.
revoke update on public.customers from authenticated;
grant update (name, phone, type, gstin, credit_limit) on public.customers to authenticated;
revoke update on public.products from authenticated;
grant update (sku, barcode, name, brand, category, hsn_code, gst_rate, price_includes_tax, base_unit,
              pack_unit, pack_size, retail_price, trade_price, retail_pack_price, trade_pack_price,
              cost_price, metal, metal_kg_per_base_unit, metal_ref_rate, reorder_level, is_active, updated_at)
  on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: keep every counter's catalogue, stock and balances live
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.products, public.customers, public.metal_rates;

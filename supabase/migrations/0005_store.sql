-- ─────────────────────────────────────────────────────────────────────────
-- 0005_store.sql — spirit buttons store (#11).
-- ─────────────────────────────────────────────────────────────────────────

-- Per-production frame art, so each show can look like itself.
create table button_templates (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions (id) on delete cascade,
  name text not null,
  frame_image_url text,
  logo_url text,
  accent_color text not null default '#8e1f2f',
  season_name text not null default '',
  is_active boolean not null default true
);

-- Cart lives server-side so it survives a device switch mid-order.
create table cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  template_id uuid not null references button_templates (id) on delete cascade,
  photo_url text not null,
  photo_width int not null,
  photo_height int not null,
  student_name text not null,
  role text not null default '',
  size_inches text not null check (size_inches in ('2.25','3','3.5')),
  style text not null check (style in ('classic','star','ribbon')),
  quantity int not null check (quantity between 1 and 99),
  unit_price_cents int not null,
  created_at timestamptz not null default now()
);

create table button_orders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  production_id uuid references productions (id),
  reference text not null unique,
  subtotal_cents int not null,
  status text not null default 'new'
    check (status in ('new','in_production','ready','delivered')),
  payment_ref text not null default '',
  paid_at timestamptz,
  placed_by_name text not null default '',
  admin_note text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

create index button_orders_status_idx on button_orders (status, created_at);

-- Items are snapshotted onto the order: a later template edit must not
-- change what a family already bought.
create table button_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references button_orders (id) on delete cascade,
  template_id uuid references button_templates (id),
  photo_url text not null,
  photo_width int not null,
  photo_height int not null,
  student_name text not null,
  role text not null default '',
  size_inches text not null,
  style text not null,
  quantity int not null,
  unit_price_cents int not null
);

-- Human-readable order references: NPA-1042, NPA-1043, …
create sequence button_order_reference_seq start 1042;

create or replace function next_order_reference() returns text
language sql volatile as $$
  select 'NPA-' || nextval('button_order_reference_seq')::text
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table button_templates enable row level security;
alter table cart_items enable row level security;
alter table button_orders enable row level security;
alter table button_order_items enable row level security;

-- Any signed-in user may see active templates; only admins edit them.
create policy templates_read on button_templates
  for select using (auth.uid() is not null and (is_active or is_admin()));
create policy templates_write on button_templates
  for all using (is_admin());

-- A cart belongs to exactly one user.
create policy cart_own on cart_items
  for all using (user_id = auth.uid());

-- Orders: own family reads; staff read all (fulfillment); staff update
-- status. Families never change status or price.
create policy orders_read on button_orders
  for select using (family_id = auth_family_id() or is_staffish());
create policy orders_insert on button_orders
  for insert with check (family_id = auth_family_id());
create policy orders_update_staff on button_orders
  for update using (is_staffish());

create policy order_items_read on button_order_items
  for select using (
    is_staffish()
    or exists (
      select 1 from button_orders o
      where o.id = button_order_items.order_id and o.family_id = auth_family_id()
    )
  );
create policy order_items_insert on button_order_items
  for insert with check (
    exists (
      select 1 from button_orders o
      where o.id = button_order_items.order_id and o.family_id = auth_family_id()
    )
  );

-- Photos uploaded for buttons live in a private Storage bucket; the policy
-- mirrors the order rules. Create the bucket with:
--   insert into storage.buckets (id, name, public)
--   values ('button-photos', 'button-photos', false);

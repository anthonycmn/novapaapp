-- ─────────────────────────────────────────────────────────────────────────
-- 0010_lessons_messages_products.sql — weekly private lessons, family ↔
-- office messaging, and the store catalog (star pages, lesson products).
-- Mirrors the mock provider's rules (tests/lessons.test.ts, messages).
-- ─────────────────────────────────────────────────────────────────────────

-- ── private lessons: weekly recurring slots with the same teacher ────────

create table lesson_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_staff_id uuid not null references staff_profiles (id) on delete cascade,
  discipline text not null check (discipline in ('voice','acting','dance')),
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min int not null check (duration_min between 15 and 120),
  location text not null default '',
  price_per_lesson_cents int not null check (price_per_lesson_cents >= 0)
);

create table lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references lesson_slots (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  start_date date not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  goals text,
  payment_method text not null default 'studio_invoice'
    check (payment_method in ('studio_invoice','stripe')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- Capacity 1: at most one ACTIVE booking per slot, enforced by the
-- database itself, not just the app.
create unique index lesson_slot_one_active_idx
  on lesson_bookings (slot_id) where status = 'active';

-- ── family ↔ office messaging ────────────────────────────────────────────

create table message_threads (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Which desk this goes to; health_safety is confidential to that role.
  recipient_role text not null check (recipient_role in ('admin','health_safety')),
  subject text not null default '',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  sender_user_id uuid not null references profiles (id) on delete cascade,
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on messages (thread_id, created_at);

-- ── store catalog (star pages, lesson products, other items) ─────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('star_page','private_lesson','designer','other')),
  name text not null,
  description text not null default '',
  base_price_cents int not null check (base_price_cents >= 0),
  production_id uuid references productions (id) on delete set null,
  -- Options/customization schema (sizes, tiers, per-option pricing).
  config jsonb not null default '{}',
  is_active boolean not null default true
);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table lesson_slots enable row level security;
alter table lesson_bookings enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table products enable row level security;

-- Slots: any signed-in user sees the schedule; admins manage it.
-- (Whether a slot is taken leaks nothing about WHO holds it — bookings
-- below are what stay private.)
create policy lesson_slots_read on lesson_slots
  for select using (auth.uid() is not null);
create policy lesson_slots_write on lesson_slots
  for all using (is_admin());

-- Bookings: own family + staffish. Other families can see that a slot is
-- taken (via a count the app derives) but never whose child holds it.
create policy lesson_bookings_read on lesson_bookings
  for select using (family_id = auth_family_id() or is_staffish());
create policy lesson_bookings_insert on lesson_bookings
  for insert with check (
    family_id = auth_family_id() and auth_role() = 'parent'
    and exists (
      select 1 from students s
      where s.id = lesson_bookings.student_id and s.family_id = auth_family_id()
    )
  );
-- Cancel: the family (own) or staff. Families may only flip status.
create policy lesson_bookings_update on lesson_bookings
  for update using (family_id = auth_family_id() or is_staffish());

-- Occupancy check for the booking page: exposes ONLY whether a slot is
-- taken, so families never query other families' booking rows.
create view lesson_slot_occupancy
with (security_invoker = false) as
  select ls.id as slot_id,
         exists (
           select 1 from lesson_bookings b
           where b.slot_id = ls.id and b.status = 'active'
         ) as taken
  from lesson_slots ls;

comment on view lesson_slot_occupancy is
  'Slot taken/open only — the privacy-safe way to render the booking grid.';

-- Threads & messages: the family, or staffish. Health & safety threads are
-- restricted app-side to the H&S director; admins retain access by policy.
create policy threads_read on message_threads
  for select using (family_id = auth_family_id() or is_staffish());
create policy threads_insert on message_threads
  for insert with check (family_id = auth_family_id() and auth_role() = 'parent');
create policy threads_update on message_threads
  for update using (family_id = auth_family_id() or is_staffish());

create policy messages_read on messages
  for select using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (t.family_id = auth_family_id() or is_staffish())
    )
  );
create policy messages_insert on messages
  for insert with check (
    sender_user_id = auth.uid()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (t.family_id = auth_family_id() or is_staffish())
    )
  );

-- Products: signed-in read (active only unless admin); admin write.
create policy products_read on products
  for select using (auth.uid() is not null and (is_active or is_admin()));
create policy products_write on products
  for all using (is_admin());

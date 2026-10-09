-- ---------------------------------------------------------------------------
-- 0098 - Families earn Encore Points and spend them in the Parent Portal.
-- ---------------------------------------------------------------------------
-- CJ, 9 Oct 2026: "build it but require me to turn it on from the staff
-- portal to launch it - and I want you to track everything for me." The plan
-- CJ signed off (proposal draft 5, claude.ai/artifact/VcgfswLYBy7fdkfA3fsZ96):
--
--   * 10 points per $1 paid (Patron); 11 at Director ($1,500+ a season);
--     12.5 at Producer ($3,000+). A season runs Sep 1 to Aug 31 (New York)
--     and a tier holds through the following season.
--   * Nothing on the menu costs under 8,000 points: a family spends $800
--     before its first reward. A $795 Broadway Bound registration lands 50
--     points short ON PURPOSE (CJ: "I want people to keep coming back").
--     Do not lower the floor to make it fit.
--   * Show tickets are 10,000 points, any seat. Money off registration is
--     capped at one per student per season.
--   * At launch, every payment since 1 Sep 2026 earns (back-dating).
--   * A referral earns the referrer 15,000 and replaces "give 2, get 2".
--
-- Nothing here reaches a family until CJ presses Launch in the staff portal
-- (ep_staff_launch, Chief only). Before that the only families who can see
-- or earn anything are the ones CJ lists as preview families. Launching
-- writes no notification and sends no email; announcing is CJ's call.
--
-- One set of rows, two doors (the casting-bridge pattern, as 0097):
--   * The Parent Portal server acts with the service role and passes the
--     family it resolved from the session (pe_caller_family).
--   * The staff portal reads with the staff member's own token and writes
--     only through ep_staff_* functions, which check the caller's role.
--
-- Money comes from rows other systems already write; nothing here takes a
-- payment. Earning is idempotent: every ledger row carries the source_ref of
-- the payment it came from, so ep_sync() can run every hour forever.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, public;

/* ---------- who may do what ------------------------------------------------ */

create or replace function family_hub.ep_is_staff()
returns boolean language sql stable security definer
set search_path to 'family_hub', 'staff_portal', 'public'
as $fn$
  select coalesce(staff_portal.portal_role_of_caller()::text in ('chief', 'admin'), false)
      or coalesce(family_hub.auth_role()::text in ('admin', 'super_admin'), false);
$fn$;

create or replace function family_hub.ep_is_chief()
returns boolean language sql stable security definer
set search_path to 'family_hub', 'staff_portal', 'public'
as $fn$
  select coalesce(staff_portal.portal_role_of_caller()::text = 'chief', false);
$fn$;

-- Any signed-in staff member: the person at the concession table.
create or replace function family_hub.ep_is_any_staff()
returns boolean language sql stable security definer
set search_path to 'family_hub', 'staff_portal', 'public'
as $fn$
  select coalesce(staff_portal.portal_role_of_caller() is not null, false) or family_hub.ep_is_staff();
$fn$;

create or replace function family_hub.ep_is_service()
returns boolean language sql stable
as $fn$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      or current_user in ('postgres', 'service_role');
$fn$;

/* ---------- the program switch -------------------------------------------- */

create table if not exists family_hub.ep_program (
  id                 int primary key default 1 check (id = 1),
  launched_at        timestamptz,
  launched_by        text,
  paused_at          timestamptz,
  paused_by          text,
  earn_from          date not null default '2026-09-01',
  director_cents     int  not null default 150000,
  producer_cents     int  not null default 300000,
  referral_points    int  not null default 15000,
  ticket_cap_pct     int  not null default 85,
  preview_family_ids uuid[] not null default '{}',
  updated_at         timestamptz not null default now()
);
insert into family_hub.ep_program (id) values (1) on conflict (id) do nothing;

/* Is the program open to this family right now? Launched and not paused, or
   the family is on CJ's preview list. */
create or replace function family_hub.ep_open_for(p_family uuid)
returns boolean language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select coalesce((select (launched_at is not null and paused_at is null)
                       or p_family = any(preview_family_ids)
                     from family_hub.ep_program where id = 1), false);
$fn$;

/* ---------- the menu ------------------------------------------------------- */

create table if not exists family_hub.ep_rewards (
  key         text primary key,
  kind        text not null check (kind in ('show_night_pack', 'spirit_button', 'show_ticket', 'tshirt',
                                            'star_page', 'day_camp_day', 'registration_credit')),
  title       text not null,
  blurb       text,
  points      int  not null check (points >= 8000),
  value_cents int  not null,   -- what the family sees
  cost_cents  int  not null,   -- what it costs NOVAPA (estimate, for the liability number)
  config      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  sort        int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Seeded once; CJ's later edits in the staff portal survive a re-run.
insert into family_hub.ep_rewards (key, kind, title, blurb, points, value_cents, cost_cents, config, sort) values
  ('show_night_pack', 'show_night_pack', 'Show-night pack',
   'Two concession tickets and a break-a-leg-a-gram for your student.', 8000, 1200, 350, '{}', 10),
  ('spirit_button', 'spirit_button', 'Spirit button',
   'One custom spirit button, built in the store and paid with points.', 8000, 1200, 600, '{}', 20),
  ('show_ticket', 'show_ticket', 'Show ticket',
   'One ticket to a NOVA PA show, any seat. You get a code to use at checkout.', 10000, 3000, 0,
   '{"amount_cents": 3000}', 30),
  ('tshirt', 'tshirt', 'NOVA PA t-shirt',
   'Pick a size; staff hand it to your student at rehearsal.', 12000, 2500, 1200, '{}', 40),
  ('star_page_quarter', 'star_page', 'Quarter star page',
   'A quarter page in the playbill, built in the store and paid with points.', 12500, 5000, 500,
   '{"size": "quarter"}', 50),
  ('star_page_half', 'star_page', 'Half star page',
   'A half page in the playbill, built in the store and paid with points.', 22500, 9000, 900,
   '{"size": "half"}', 60),
  ('star_page_full', 'star_page', 'Full star page',
   'A full page in the playbill, built in the store and paid with points.', 35000, 14000, 1400,
   '{"size": "full"}', 70),
  ('day_camp_day', 'day_camp_day', 'One day camp day',
   'A day camp credit on your student''s punch card.', 25000, 7900, 750, '{}', 80),
  ('registration_25', 'registration_credit', '$25 off a show registration',
   'A code for $25 off a show registration. One per student per season.', 40000, 2500, 2500,
   '{"amount_cents": 2500}', 90),
  ('registration_50', 'registration_credit', '$50 off a show registration',
   'A code for $50 off a show registration. One per student per season.', 80000, 5000, 5000,
   '{"amount_cents": 5000}', 100)
on conflict (key) do nothing;

/* ---------- the ledger ----------------------------------------------------- */

create table if not exists family_hub.ep_ledger (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_hub.families(id) on delete cascade,
  points      int  not null check (points <> 0),
  kind        text not null check (kind in ('earn', 'referral', 'redeem', 'refund', 'adjust', 'expire')),
  -- 'order:<id>', 'installment:<invoice>', 'store:<id>', 'tix:<id>', 'referral:<id>',
  -- 'redeem:<id>', 'unredeem:<id>', 'expire:<family>:<date>'. Null for a staff adjustment.
  source_ref  text unique,
  spend_cents int  not null default 0,   -- the money that earned it; drives tiers
  tier        text,
  rate        numeric,
  occurred_at timestamptz not null,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists ep_ledger_family_idx on family_hub.ep_ledger (family_id, occurred_at);

/* Payments that could not be pinned on exactly one family. The staff portal
   lists them; linking the email to a family lets the next sync earn them. */
create table if not exists family_hub.ep_unmatched (
  source_ref  text primary key,
  email       text,
  spend_cents int not null,
  occurred_at timestamptz not null,
  candidates  int not null default 0,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create table if not exists family_hub.ep_email_links (
  email      text primary key,
  family_id  uuid not null references family_hub.families(id) on delete cascade,
  linked_by  text,
  linked_at  timestamptz not null default now()
);

/* ---------- redemptions and what has to happen next ------------------------ */

create table if not exists family_hub.ep_redemptions (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references family_hub.families(id) on delete cascade,
  reward_key   text not null references family_hub.ep_rewards(key),
  kind         text not null,
  title        text not null,
  points       int  not null,
  value_cents  int  not null,
  cost_cents   int  not null,
  student_id   uuid references family_hub.students(id) on delete set null,
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);
create index if not exists ep_redemptions_family_idx on family_hub.ep_redemptions (family_id, created_at desc);

/* One row per thing that has to happen: a concession code to scan, a gram to
   deliver, a shirt to hand out, a ticket or registration code to be used, a
   store voucher to be spent, a day camp credit (done the moment it posts). */
create table if not exists family_hub.ep_items (
  id            uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references family_hub.ep_redemptions(id) on delete cascade,
  family_id     uuid not null references family_hub.families(id) on delete cascade,
  item          text not null check (item in ('concession', 'gram', 'tshirt', 'ticket_code',
                                              'registration_code', 'store_voucher', 'day_camp_credit')),
  code          text unique,
  student_id    uuid references family_hub.students(id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  done_at       timestamptz,
  done_by       text
);
create index if not exists ep_items_open_idx on family_hub.ep_items (item, status);
create index if not exists ep_items_family_idx on family_hub.ep_items (family_id);

/* ---------- helpers -------------------------------------------------------- */

-- Sep 1 (New York) of the season a moment falls in.
create or replace function family_hub.ep_season_start(p_at timestamptz)
returns timestamptz language sql stable
as $fn$
  select (make_date(case when extract(month from (p_at at time zone 'America/New_York')) >= 9
                         then extract(year from (p_at at time zone 'America/New_York'))::int
                         else extract(year from (p_at at time zone 'America/New_York'))::int - 1 end,
                    9, 1)::timestamp) at time zone 'America/New_York';
$fn$;

create or replace function family_hub.ep_balance(p_family uuid)
returns int language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select coalesce(sum(points), 0)::int from family_hub.ep_ledger where family_id = p_family;
$fn$;

-- Money a family paid in [p_from, p_to).
create or replace function family_hub.ep_spend_between(p_family uuid, p_from timestamptz, p_to timestamptz)
returns int language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select coalesce(sum(spend_cents), 0)::int from family_hub.ep_ledger
   where family_id = p_family and occurred_at >= p_from and occurred_at < p_to;
$fn$;

/* The tier a family stands at, at a moment: the better of this season's
   spend so far and the whole of last season's (a tier holds a season). */
create or replace function family_hub.ep_tier_at(p_family uuid, p_at timestamptz)
returns text language plpgsql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  prog family_hub.ep_program;
  s0 timestamptz := family_hub.ep_season_start(p_at);
  this_season int;
  last_season int;
  best int;
begin
  select * into prog from family_hub.ep_program where id = 1;
  this_season := family_hub.ep_spend_between(p_family, s0, p_at);
  last_season := family_hub.ep_spend_between(p_family, s0 - interval '1 year', s0);
  best := greatest(this_season, last_season);
  return case when best >= prog.producer_cents then 'producer'
              when best >= prog.director_cents then 'director'
              else 'patron' end;
end $fn$;

create or replace function family_hub.ep_rate(p_tier text)
returns numeric language sql immutable
as $fn$
  select case p_tier when 'producer' then 12.5 when 'director' then 11 else 10 end::numeric;
$fn$;

/* The one family an email belongs to, or null when there is none or more
   than one. A staff link wins; then the registration account link, guardian
   and login emails, and the website family whose camper is our student. */
create or replace function family_hub.ep_family_for_email(p_email text, out family_id uuid, out candidates int)
language plpgsql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  candidates := 0;
  if e = '' then return; end if;
  select l.family_id into family_id from family_hub.ep_email_links l where l.email = e;
  if family_id is not null then candidates := 1; return; end if;
  with m as (
    select r.family_id from family_hub.registration_account_links r where lower(r.external_email) = e
    union select g.family_id from family_hub.guardians g where lower(g.email) = e
    union select p.family_id from family_hub.profiles p where lower(p.email) = e and p.family_id is not null
    union select s.family_id from public.families wf
            join public.campers c on c.family_id = wf.id
            join family_hub.students s on s.camper_id = c.id
           where lower(wf.email) = e)
  select count(distinct m.family_id)::int, (array_agg(distinct m.family_id))[1]
    into candidates, family_id from m where m.family_id is not null;
  if candidates <> 1 then family_id := null; end if;
end $fn$;

-- All the addresses a family is known by (for locking a coupon code to it).
create or replace function family_hub.ep_family_emails(p_family uuid)
returns text[] language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select coalesce(array_agg(distinct e) filter (where e is not null and e <> ''), '{}') from (
    select lower(g.email) e from family_hub.guardians g where g.family_id = p_family
    union select lower(p.email) from family_hub.profiles p where p.family_id = p_family
    union select lower(r.external_email) from family_hub.registration_account_links r where r.family_id = p_family
    union select l.email from family_hub.ep_email_links l where l.family_id = p_family
  ) x;
$fn$;

create or replace function family_hub.ep_new_code(p_prefix text, p_len int default 6)
returns text language sql volatile
as $fn$
  -- No 0/O/1/I so a volunteer can read it off a phone.
  select p_prefix || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
    from generate_series(1, p_len);
$fn$;

/* ---------- earning -------------------------------------------------------- */

/* Earn points for every payment not yet in the ledger, oldest first so tiers
   build up in order. Runs hourly from the Parent Portal (/api/jobs/encore-sync)
   and once at launch. Before launch it only earns for preview families.
   Also expires points after 12 months with no activity. */
create or replace function family_hub.ep_sync()
returns jsonb
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  prog family_hub.ep_program;
  r record;
  fam uuid;
  cands int;
  v_tier text;
  v_rate numeric;
  v_pts int;
  earned int := 0;
  unmatched int := 0;
  expired int := 0;
begin
  if not (family_hub.ep_is_service() or family_hub.ep_is_staff()) then
    raise exception 'Only the Parent Portal server or a Chief/Admin can run the points sync.' using errcode = '42501';
  end if;
  select * into prog from family_hub.ep_program where id = 1 for update;
  if prog.launched_at is null and cardinality(prog.preview_family_ids) = 0 then
    return jsonb_build_object('skipped', 'not launched');
  end if;

  for r in
    with src as (
      -- Registration checkouts (shows, classes, camps, packs): what was charged today.
      select 'order:' || o.id::text as ref, lower(o.email) as email, null::uuid as fam,
             o.amount_today_cents as cents, o.created_at as at
        from public.orders o
       where o.status = 'paid' and o.amount_today_cents > 0
      union all
      -- Payment-plan installments and monthly class tuition.
      select 'installment:' || coalesce(i.stripe_invoice, i.order_id::text || ':' || i.paid_at::text),
             lower(o.email), null::uuid, i.amount_cents, i.paid_at
        from public.order_installments i join public.orders o on o.id = i.order_id
       where i.paid_at is not null and i.amount_cents > 0
      union all
      -- The Parent Portal store (buttons, star pages, performance fees). Lines
      -- paid with points are $0, so subtotal is the cash.
      select 'store:' || b.id::text, null, b.family_id, b.subtotal_cents, b.paid_at
        from family_hub.button_orders b
       where b.paid_at is not null and b.subtotal_cents > 0 and b.family_id is not null
      union all
      -- BookTix show tickets.
      select 'tix:' || t.id::text, lower(t.email), null::uuid, t.total_cents, t.created_at
        from public.tix_orders t
       where t.total_cents > 0 and coalesce(t.status, 'paid') not in ('refunded', 'cancelled', 'void')
    )
    select src.* from src
     where src.at >= (prog.earn_from::timestamp at time zone 'America/New_York')
       and not exists (select 1 from family_hub.ep_ledger l where l.source_ref = src.ref)
     order by src.at
  loop
    if r.fam is not null then
      fam := r.fam; cands := 1;
    else
      select f.family_id, f.candidates into fam, cands from family_hub.ep_family_for_email(r.email) f;
    end if;
    if fam is null then
      insert into family_hub.ep_unmatched (source_ref, email, spend_cents, occurred_at, candidates)
      values (r.ref, r.email, r.cents, r.at, coalesce(cands, 0))
      on conflict (source_ref) do update set last_seen = now(), candidates = excluded.candidates;
      unmatched := unmatched + 1;
      continue;
    end if;
    if not (prog.launched_at is not null or fam = any(prog.preview_family_ids)) then
      continue;
    end if;
    v_tier := family_hub.ep_tier_at(fam, r.at);
    v_rate := family_hub.ep_rate(v_tier);
    v_pts := floor(r.cents * v_rate / 100)::int;
    if v_pts > 0 then
      insert into family_hub.ep_ledger (family_id, points, kind, source_ref, spend_cents, tier, rate, occurred_at)
      values (fam, v_pts, 'earn', r.ref, r.cents, v_tier, v_rate, r.at)
      on conflict (source_ref) do nothing;
      earned := earned + 1;
    end if;
    delete from family_hub.ep_unmatched where source_ref = r.ref;
  end loop;

  -- Referrals made after launch: the referrer earns once the website marks
  -- the reward earned (a family new to NOVAPA registered and paid).
  if prog.launched_at is not null then
    for r in
      select rr.id, lower(rr.referrer_email) as email, rr.created_at as at
        from public.referral_rewards rr
       where rr.status in ('earned', 'coupon_issued') and rr.created_at >= prog.launched_at
         and not exists (select 1 from family_hub.ep_ledger l where l.source_ref = 'referral:' || rr.id::text)
    loop
      select f.family_id into fam from family_hub.ep_family_for_email(r.email) f;
      if fam is null then continue; end if;
      insert into family_hub.ep_ledger (family_id, points, kind, source_ref, occurred_at, note)
      values (fam, prog.referral_points, 'referral', 'referral:' || r.id::text, r.at, 'Referred a new family')
      on conflict (source_ref) do nothing;
      earned := earned + 1;
    end loop;

    -- Twelve months with no earning or redeeming: the balance expires.
    for r in
      select l.family_id, sum(l.points)::int as bal, max(l.occurred_at) as last_at
        from family_hub.ep_ledger l group by l.family_id
      having sum(l.points) > 0 and max(l.occurred_at) < now() - interval '12 months'
    loop
      insert into family_hub.ep_ledger (family_id, points, kind, source_ref, occurred_at, note)
      values (r.family_id, -r.bal, 'expire', 'expire:' || r.family_id::text || ':' || current_date::text, now(),
              'No activity for 12 months')
      on conflict (source_ref) do nothing;
      expired := expired + 1;
    end loop;
  end if;

  return jsonb_build_object('earned', earned, 'unmatched', unmatched, 'expired', expired);
end $fn$;

/* ---------- redeeming ------------------------------------------------------ */

/* Spend points on one reward. p_detail carries what the reward needs:
   {"size": "M"} for a shirt, {"message": "...", "from": "..."} for the gram.
   Row-locked on the family, so two taps cannot spend the same points. */
create or replace function family_hub.ep_redeem(p_family_id uuid, p_reward_key text, p_student_id uuid,
                                                p_detail jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  fam uuid := family_hub.pe_caller_family(p_family_id);
  prog family_hub.ep_program;
  rw family_hub.ep_rewards;
  bal int;
  rid uuid := gen_random_uuid();
  stu family_hub.students;
  v_code text;
  v_size text;
  v_amount int;
  v_camper record;
  v_email text;
  v_cap int;
  v_open boolean;
  codes jsonb := '[]'::jsonb;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if fam is null then raise exception 'Sign in as a parent to use Encore Points.' using errcode = '42501'; end if;
  if not family_hub.ep_open_for(fam) then
    raise exception 'Encore Points is not open yet.' using errcode = '42501';
  end if;
  perform 1 from family_hub.families where id = fam for update;
  select * into prog from family_hub.ep_program where id = 1;
  select * into rw from family_hub.ep_rewards where key = p_reward_key and active;
  if not found then raise exception 'That reward is not on the menu right now.'; end if;
  bal := family_hub.ep_balance(fam);
  if bal < rw.points then
    raise exception 'You need % more points for this reward.', to_char(rw.points - bal, 'FM999,999,999');
  end if;

  if p_student_id is not null then
    select * into stu from family_hub.students where id = p_student_id and family_id = fam;
    if not found then raise exception 'Choose one of your own students.'; end if;
  end if;
  if rw.kind in ('show_night_pack', 'tshirt', 'day_camp_day', 'registration_credit') and stu.id is null then
    raise exception 'Choose which student this reward is for.';
  end if;

  insert into family_hub.ep_redemptions (id, family_id, reward_key, kind, title, points, value_cents, cost_cents,
                                         student_id, detail)
  values (rid, fam, rw.key, rw.kind, rw.title, rw.points, rw.value_cents, rw.cost_cents, stu.id, d);

  if rw.kind = 'show_night_pack' then
    for i in 1..2 loop
      v_code := family_hub.ep_new_code('C', 5);
      insert into family_hub.ep_items (redemption_id, family_id, item, code, student_id)
      values (rid, fam, 'concession', v_code, stu.id);
      codes := codes || jsonb_build_object('item', 'concession', 'code', v_code);
    end loop;
    insert into family_hub.ep_items (redemption_id, family_id, item, student_id, detail)
    values (rid, fam, 'gram', stu.id, jsonb_build_object(
      'to', btrim(coalesce(stu.preferred_name, stu.first_name) || ' ' || stu.last_name),
      'message', left(btrim(coalesce(d ->> 'message', '')), 280),
      'from', left(btrim(coalesce(d ->> 'from', '')), 80)));

  elsif rw.kind = 'tshirt' then
    v_size := upper(btrim(coalesce(nullif(d ->> 'size', ''), stu.tshirt_size, '')));
    if v_size = '' then raise exception 'Choose a t-shirt size.'; end if;
    insert into family_hub.ep_items (redemption_id, family_id, item, student_id, detail)
    values (rid, fam, 'tshirt', stu.id, jsonb_build_object('size', v_size,
      'student', btrim(coalesce(stu.preferred_name, stu.first_name) || ' ' || stu.last_name)));

  elsif rw.kind in ('spirit_button', 'star_page') then
    insert into family_hub.ep_items (redemption_id, family_id, item, code, student_id, detail)
    values (rid, fam, 'store_voucher', family_hub.ep_new_code('V', 8), stu.id,
            jsonb_build_object('product', rw.kind, 'size', rw.config ->> 'size'));

  elsif rw.kind = 'show_ticket' then
    -- Reward tickets stop when every upcoming performance is past the cap.
    select exists (
      select 1 from public.tix_performances p join public.tix_shows sh on sh.id = p.show_id
       where sh.on_sale and p.starts_at > now() and p.status = 'onsale'
         and (select count(*) from public.tix_tickets t where t.performance_id = p.id)
             < (select count(*) from public.tix_seats) * prog.ticket_cap_pct / 100.0)
      into v_open;
    if not v_open then raise exception 'Reward tickets are not available right now. Check back when the next show goes on sale.'; end if;
    v_amount := coalesce((rw.config ->> 'amount_cents')::int, 3000);
    v_code := family_hub.ep_new_code('TIXE', 6);
    insert into public.coupons (code, amount_cents, active, max_uses, uses, expires_at, email_lock, note)
    values (v_code, v_amount, true, 1, 0, now() + interval '1 year', family_hub.ep_family_emails(fam),
            'Encore Points reward ticket (redemption ' || rid::text || ')');
    insert into family_hub.ep_items (redemption_id, family_id, item, code, detail)
    values (rid, fam, 'ticket_code', v_code, jsonb_build_object('amount_cents', v_amount));
    codes := codes || jsonb_build_object('item', 'ticket_code', 'code', v_code);

  elsif rw.kind = 'registration_credit' then
    select count(*) into v_cap from family_hub.ep_redemptions x
     where x.family_id = fam and x.student_id = stu.id and x.kind = 'registration_credit'
       and x.status = 'active' and x.id <> rid and x.created_at >= family_hub.ep_season_start(now());
    if v_cap > 0 then
      raise exception '% already has money off registration from points this season.', coalesce(stu.preferred_name, stu.first_name);
    end if;
    v_amount := coalesce((rw.config ->> 'amount_cents')::int, 2500);
    v_code := family_hub.ep_new_code('ENC', 7);
    insert into public.coupons (code, amount_cents, active, max_uses, uses, expires_at, email_lock, note)
    values (v_code, v_amount, true, 1, 0, family_hub.ep_season_start(now()) + interval '1 year',
            family_hub.ep_family_emails(fam),
            'Encore Points registration credit for ' || coalesce(stu.preferred_name, stu.first_name) || ' (redemption ' || rid::text || ')');
    insert into family_hub.ep_items (redemption_id, family_id, item, code, student_id, detail)
    values (rid, fam, 'registration_code', v_code, stu.id, jsonb_build_object('amount_cents', v_amount));
    codes := codes || jsonb_build_object('item', 'registration_code', 'code', v_code);

  elsif rw.kind = 'day_camp_day' then
    select c.name, wf.email into v_camper
      from public.campers c join public.families wf on wf.id = c.family_id
     where c.id = stu.camper_id;
    if v_camper.name is null or v_camper.email is null then
      raise exception 'We could not find % on the day camp punch card. Call the office and we will add the day by hand.',
        coalesce(stu.preferred_name, stu.first_name);
    end if;
    perform public.apply_credit_events('encore_' || rid::text, v_camper.email,
      jsonb_build_object('grants', jsonb_build_array(jsonb_build_object('camper', v_camper.name, 'day', 1)),
                         'source', 'encore_points'));
    insert into family_hub.ep_items (redemption_id, family_id, item, student_id, status, done_at, done_by, detail)
    values (rid, fam, 'day_camp_credit', stu.id, 'done', now(), 'Encore Points',
            jsonb_build_object('camper', v_camper.name));
  end if;

  insert into family_hub.ep_ledger (family_id, points, kind, source_ref, occurred_at, note)
  values (fam, -rw.points, 'redeem', 'redeem:' || rid::text, now(), rw.title);

  return jsonb_build_object('id', rid, 'title', rw.title, 'points', rw.points,
                            'balance', bal - rw.points, 'codes', codes);
end $fn$;

/* The Parent Portal store spends a voucher on one cart line at checkout. */
create or replace function family_hub.ep_use_voucher(p_family_id uuid, p_item_id uuid, p_order_reference text)
returns boolean
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare fam uuid := family_hub.pe_caller_family(p_family_id);
begin
  update family_hub.ep_items
     set status = 'done', done_at = now(), done_by = 'store',
         detail = detail || jsonb_build_object('order', p_order_reference)
   where id = p_item_id and family_id = fam and item = 'store_voucher' and status = 'open';
  return found;
end $fn$;

/* ---------- RLS ------------------------------------------------------------ */

alter table family_hub.ep_program     enable row level security;
alter table family_hub.ep_rewards     enable row level security;
alter table family_hub.ep_ledger      enable row level security;
alter table family_hub.ep_unmatched   enable row level security;
alter table family_hub.ep_email_links enable row level security;
alter table family_hub.ep_redemptions enable row level security;
alter table family_hub.ep_items       enable row level security;

drop policy if exists ep_program_read on family_hub.ep_program;
create policy ep_program_read on family_hub.ep_program
  for select to authenticated using ((select family_hub.ep_is_any_staff()));

drop policy if exists ep_rewards_read on family_hub.ep_rewards;
create policy ep_rewards_read on family_hub.ep_rewards
  for select to authenticated using (active or (select family_hub.ep_is_staff()));

drop policy if exists ep_ledger_staff on family_hub.ep_ledger;
create policy ep_ledger_staff on family_hub.ep_ledger
  for select to authenticated using ((select family_hub.ep_is_staff()));
drop policy if exists ep_ledger_family on family_hub.ep_ledger;
create policy ep_ledger_family on family_hub.ep_ledger
  for select to authenticated using (family_id = (select family_hub.auth_family_id()));

drop policy if exists ep_unmatched_staff on family_hub.ep_unmatched;
create policy ep_unmatched_staff on family_hub.ep_unmatched
  for select to authenticated using ((select family_hub.ep_is_staff()));
drop policy if exists ep_links_staff on family_hub.ep_email_links;
create policy ep_links_staff on family_hub.ep_email_links
  for select to authenticated using ((select family_hub.ep_is_staff()));

drop policy if exists ep_redemptions_staff on family_hub.ep_redemptions;
create policy ep_redemptions_staff on family_hub.ep_redemptions
  for select to authenticated using ((select family_hub.ep_is_staff()));
drop policy if exists ep_redemptions_family on family_hub.ep_redemptions;
create policy ep_redemptions_family on family_hub.ep_redemptions
  for select to authenticated using (family_id = (select family_hub.auth_family_id()));

drop policy if exists ep_items_staff on family_hub.ep_items;
create policy ep_items_staff on family_hub.ep_items
  for select to authenticated using ((select family_hub.ep_is_any_staff()));
drop policy if exists ep_items_family on family_hub.ep_items;
create policy ep_items_family on family_hub.ep_items
  for select to authenticated using (family_id = (select family_hub.auth_family_id()));

grant select on family_hub.ep_program, family_hub.ep_rewards, family_hub.ep_ledger, family_hub.ep_unmatched,
  family_hub.ep_email_links, family_hub.ep_redemptions, family_hub.ep_items to authenticated;
grant all on family_hub.ep_program, family_hub.ep_rewards, family_hub.ep_ledger, family_hub.ep_unmatched,
  family_hub.ep_email_links, family_hub.ep_redemptions, family_hub.ep_items to service_role;

/* ---------- staff side ----------------------------------------------------- */

create or replace function family_hub.ep_require(p_chief boolean)
returns void language plpgsql stable security definer set search_path to 'family_hub', 'public' as $fn$
begin
  if family_hub.ep_is_service() then return; end if;
  if p_chief and not family_hub.ep_is_chief() then
    raise exception 'Only a Chief can do this.' using errcode = '42501';
  elsif not p_chief and not family_hub.ep_is_staff() then
    raise exception 'Only a Chief or an Admin can manage Encore Points.' using errcode = '42501';
  end if;
end $fn$;

create or replace function family_hub.ep_actor()
returns text language sql stable security definer set search_path to 'family_hub', 'public' as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''), current_user::text);
$fn$;

/* CJ's switch. Launch earns every payment since earn_from (back-dating) in
   the same transaction. It writes no notification. */
create or replace function family_hub.ep_staff_launch()
returns jsonb language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
declare res jsonb;
begin
  perform family_hub.ep_require(true);
  update family_hub.ep_program
     set launched_at = coalesce(launched_at, now()), launched_by = coalesce(launched_by, family_hub.ep_actor()),
         paused_at = null, paused_by = null, updated_at = now()
   where id = 1;
  res := family_hub.ep_sync();
  return jsonb_build_object('launched', true, 'sync', res);
end $fn$;

-- Pause hides the program from families and stops redeeming. Earning goes on,
-- so nobody loses points they paid for while it is paused.
create or replace function family_hub.ep_staff_pause(p_paused boolean)
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(true);
  update family_hub.ep_program
     set paused_at = case when p_paused then now() end,
         paused_by = case when p_paused then family_hub.ep_actor() end,
         updated_at = now()
   where id = 1 and launched_at is not null;
end $fn$;

create or replace function family_hub.ep_staff_set_preview(p_family_ids uuid[])
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(true);
  update family_hub.ep_program set preview_family_ids = coalesce(p_family_ids, '{}'), updated_at = now() where id = 1;
end $fn$;

create or replace function family_hub.ep_staff_save_reward(p_key text, p_points int, p_active boolean)
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(true);
  if p_points < 8000 then raise exception 'Nothing on the menu costs under 8,000 points.'; end if;
  update family_hub.ep_rewards set points = p_points, active = p_active, updated_at = now(),
         updated_by = family_hub.ep_actor()
   where key = p_key;
  if not found then raise exception 'No reward %', p_key; end if;
end $fn$;

create or replace function family_hub.ep_staff_adjust(p_family_id uuid, p_points int, p_note text)
returns int language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(false);
  if coalesce(p_points, 0) = 0 then raise exception 'Enter a number of points to add or remove.'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'Say why, so the family history makes sense.'; end if;
  perform 1 from family_hub.families where id = p_family_id for update;
  if not found then raise exception 'No such family.'; end if;
  if family_hub.ep_balance(p_family_id) + p_points < 0 then
    raise exception 'That would leave the family below zero.';
  end if;
  insert into family_hub.ep_ledger (family_id, points, kind, occurred_at, note, created_by)
  values (p_family_id, p_points, 'adjust', now(), btrim(p_note), family_hub.ep_actor());
  return family_hub.ep_balance(p_family_id);
end $fn$;

create or replace function family_hub.ep_staff_link_email(p_email text, p_family_id uuid)
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(false);
  insert into family_hub.ep_email_links (email, family_id, linked_by)
  values (lower(btrim(p_email)), p_family_id, family_hub.ep_actor())
  on conflict (email) do update set family_id = excluded.family_id, linked_by = excluded.linked_by, linked_at = now();
end $fn$;

-- Mark a shirt handed out or a gram delivered.
create or replace function family_hub.ep_staff_item_done(p_item_id uuid, p_done boolean)
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(false);
  update family_hub.ep_items
     set status = case when p_done then 'done' else 'open' end,
         done_at = case when p_done then now() end,
         done_by = case when p_done then family_hub.ep_actor() end
   where id = p_item_id and item in ('gram', 'tshirt') and status <> 'cancelled';
end $fn$;

/* The concession table: any signed-in staff member types the code off the
   family's phone. Returns what the code is and whether it was good. */
create or replace function family_hub.ep_staff_use_concession(p_code text)
returns jsonb language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
declare it family_hub.ep_items; fam_name text;
begin
  if not family_hub.ep_is_any_staff() then
    raise exception 'Sign in to the staff portal to check concession codes.' using errcode = '42501';
  end if;
  select * into it from family_hub.ep_items
   where upper(code) = upper(btrim(p_code)) and item = 'concession' for update;
  if not found then return jsonb_build_object('ok', false, 'message', 'No concession ticket has that code.'); end if;
  select name into fam_name from family_hub.families where id = it.family_id;
  if it.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'That code was cancelled.', 'family', fam_name);
  elsif it.status = 'done' then
    return jsonb_build_object('ok', false, 'message',
      'Already used ' || to_char(it.done_at at time zone 'America/New_York', 'Mon FMDD at FMHH12:MI AM') || '.',
      'family', fam_name);
  end if;
  update family_hub.ep_items set status = 'done', done_at = now(), done_by = family_hub.ep_actor() where id = it.id;
  return jsonb_build_object('ok', true, 'message', 'Good for one concession item.', 'family', fam_name);
end $fn$;

/* Undo a redemption that has not been used: points go back, codes die. */
create or replace function family_hub.ep_staff_cancel(p_redemption_id uuid, p_note text)
returns void language plpgsql volatile security definer set search_path to 'family_hub', 'public' as $fn$
declare rd family_hub.ep_redemptions;
begin
  perform family_hub.ep_require(false);
  select * into rd from family_hub.ep_redemptions where id = p_redemption_id for update;
  if not found or rd.status = 'cancelled' then raise exception 'Nothing to cancel.'; end if;
  if exists (select 1 from family_hub.ep_items i where i.redemption_id = rd.id and i.status = 'done'
              and i.item <> 'day_camp_credit')
     or exists (select 1 from family_hub.ep_items i join public.coupons c on c.code = i.code
                 where i.redemption_id = rd.id and c.uses > 0) then
    raise exception 'Part of this reward has already been used.';
  end if;
  if exists (select 1 from family_hub.ep_items i where i.redemption_id = rd.id and i.item = 'day_camp_credit') then
    raise exception 'Remove the day camp credit from the punch card in the website admin first, then adjust points by hand.';
  end if;
  update public.coupons set active = false
   where code in (select i.code from family_hub.ep_items i where i.redemption_id = rd.id and i.code is not null);
  update family_hub.ep_items set status = 'cancelled' where redemption_id = rd.id;
  update family_hub.ep_redemptions set status = 'cancelled', cancelled_at = now(),
         cancelled_by = family_hub.ep_actor() where id = rd.id;
  insert into family_hub.ep_ledger (family_id, points, kind, source_ref, occurred_at, note, created_by)
  values (rd.family_id, rd.points, 'refund', 'unredeem:' || rd.id::text, now(),
          coalesce(nullif(btrim(p_note), ''), 'Reward cancelled: ' || rd.title), family_hub.ep_actor());
end $fn$;

/* Everything the tracking dashboard shows, in one call. */
create or replace function family_hub.ep_staff_overview()
returns jsonb language plpgsql stable security definer set search_path to 'family_hub', 'public' as $fn$
declare
  prog family_hub.ep_program;
  s0 timestamptz := family_hub.ep_season_start(now());
  m0 timestamptz := date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
  outstanding int;
  cpp numeric; cpp_worst numeric;
  res jsonb;
begin
  perform family_hub.ep_require(false);
  select * into prog from family_hub.ep_program where id = 1;
  select coalesce(sum(points), 0) into outstanding from family_hub.ep_ledger;
  select avg(cost_cents::numeric / points), max(cost_cents::numeric / points)
    into cpp, cpp_worst from family_hub.ep_rewards where active;

  with bal as (
    select l.family_id, sum(l.points)::int as balance,
           sum(l.spend_cents) filter (where l.occurred_at >= s0)::int as season_spend,
           sum(l.spend_cents) filter (where l.occurred_at >= s0 - interval '1 year' and l.occurred_at < s0)::int as last_spend,
           max(l.occurred_at) as last_at
      from family_hub.ep_ledger l group by l.family_id
  ), tiers as (
    select b.*, case when greatest(coalesce(season_spend, 0), coalesce(last_spend, 0)) >= prog.producer_cents then 'producer'
                     when greatest(coalesce(season_spend, 0), coalesce(last_spend, 0)) >= prog.director_cents then 'director'
                     else 'patron' end as tier
      from bal b
  )
  select jsonb_build_object(
    'program', jsonb_build_object('launched_at', prog.launched_at, 'launched_by', prog.launched_by,
                                  'paused_at', prog.paused_at, 'paused_by', prog.paused_by,
                                  'earn_from', prog.earn_from, 'preview_family_ids', prog.preview_family_ids,
                                  'director_cents', prog.director_cents, 'producer_cents', prog.producer_cents,
                                  'referral_points', prog.referral_points, 'ticket_cap_pct', prog.ticket_cap_pct),
    'families_with_points', (select count(*) from tiers where balance > 0),
    'families_ready', (select count(*) from tiers where balance >= 8000),
    'families_almost', (select count(*) from tiers where balance between 6000 and 7999),
    'points_outstanding', outstanding,
    'liability_cents', round(outstanding * coalesce(cpp, 0)),
    'liability_worst_cents', round(outstanding * coalesce(cpp_worst, 0)),
    'points_earned_month', (select coalesce(sum(points), 0) from family_hub.ep_ledger
                             where points > 0 and kind in ('earn', 'referral') and occurred_at >= m0),
    'points_redeemed_month', (select coalesce(-sum(points), 0) from family_hub.ep_ledger
                               where kind = 'redeem' and occurred_at >= m0),
    'spend_season_cents', (select coalesce(sum(spend_cents), 0) from family_hub.ep_ledger where occurred_at >= s0),
    'tiers', (select jsonb_build_object(
                'patron', count(*) filter (where tier = 'patron'),
                'director', count(*) filter (where tier = 'director'),
                'producer', count(*) filter (where tier = 'producer')) from tiers),
    'by_reward', (select coalesce(jsonb_agg(x order by x.sort), '[]'::jsonb) from (
        select r.key, r.title, r.points, r.active, r.sort, r.value_cents, r.cost_cents,
               count(d.id) filter (where d.status = 'active') as redeemed,
               coalesce(sum(d.cost_cents) filter (where d.status = 'active'), 0) as cost_total_cents,
               coalesce(sum(d.value_cents) filter (where d.status = 'active'), 0) as value_total_cents
          from family_hub.ep_rewards r left join family_hub.ep_redemptions d on d.reward_key = r.key
         group by r.key) x),
    'open_items', (select jsonb_build_object(
        'tshirt', count(*) filter (where item = 'tshirt'),
        'gram', count(*) filter (where item = 'gram'),
        'concession', count(*) filter (where item = 'concession'),
        'store_voucher', count(*) filter (where item = 'store_voucher'))
        from family_hub.ep_items where status = 'open'),
    'unmatched', (select count(*) from family_hub.ep_unmatched),
    'months', (select coalesce(jsonb_agg(m order by m.month), '[]'::jsonb) from (
        select to_char(date_trunc('month', occurred_at at time zone 'America/New_York'), 'YYYY-MM') as month,
               sum(points) filter (where points > 0 and kind in ('earn', 'referral'))::int as earned,
               coalesce(-sum(points) filter (where kind = 'redeem'), 0)::int as redeemed,
               sum(spend_cents)::int as spend_cents
          from family_hub.ep_ledger
         where occurred_at >= now() - interval '12 months'
         group by 1) m)
  ) into res;
  return res;
end $fn$;

/* Every family with a ledger, for the Families tab. */
create or replace function family_hub.ep_staff_families()
returns table (family_id uuid, family_name text, balance int, season_spend_cents int, tier text,
               last_activity_at timestamptz, earned int, redeemed int)
language plpgsql stable security definer set search_path to 'family_hub', 'public' as $fn$
begin
  perform family_hub.ep_require(false);
  return query
    select l.family_id, f.name, sum(l.points)::int,
           coalesce(sum(l.spend_cents) filter (where l.occurred_at >= family_hub.ep_season_start(now())), 0)::int,
           family_hub.ep_tier_at(l.family_id, now()),
           max(l.occurred_at),
           coalesce(sum(l.points) filter (where l.points > 0), 0)::int,
           coalesce(-sum(l.points) filter (where l.kind = 'redeem'), 0)::int
      from family_hub.ep_ledger l join family_hub.families f on f.id = l.family_id
     group by l.family_id, f.name;
end $fn$;

revoke all on function family_hub.ep_sync(), family_hub.ep_redeem(uuid, text, uuid, jsonb),
  family_hub.ep_use_voucher(uuid, uuid, text), family_hub.ep_family_for_email(text),
  family_hub.ep_family_emails(uuid), family_hub.ep_open_for(uuid), family_hub.ep_balance(uuid),
  family_hub.ep_spend_between(uuid, timestamptz, timestamptz), family_hub.ep_tier_at(uuid, timestamptz)
  from public, anon;
grant execute on function family_hub.ep_sync(), family_hub.ep_redeem(uuid, text, uuid, jsonb),
  family_hub.ep_use_voucher(uuid, uuid, text), family_hub.ep_open_for(uuid), family_hub.ep_balance(uuid),
  family_hub.ep_tier_at(uuid, timestamptz)
  to authenticated, service_role;
grant execute on function family_hub.ep_family_for_email(text), family_hub.ep_family_emails(uuid),
  family_hub.ep_spend_between(uuid, timestamptz, timestamptz)
  to service_role;

revoke all on function family_hub.ep_staff_launch(), family_hub.ep_staff_pause(boolean),
  family_hub.ep_staff_set_preview(uuid[]), family_hub.ep_staff_save_reward(text, int, boolean),
  family_hub.ep_staff_adjust(uuid, int, text), family_hub.ep_staff_link_email(text, uuid),
  family_hub.ep_staff_item_done(uuid, boolean), family_hub.ep_staff_use_concession(text),
  family_hub.ep_staff_cancel(uuid, text), family_hub.ep_staff_overview(), family_hub.ep_staff_families(),
  family_hub.ep_require(boolean)
  from public, anon;
grant execute on function family_hub.ep_staff_launch(), family_hub.ep_staff_pause(boolean),
  family_hub.ep_staff_set_preview(uuid[]), family_hub.ep_staff_save_reward(text, int, boolean),
  family_hub.ep_staff_adjust(uuid, int, text), family_hub.ep_staff_link_email(text, uuid),
  family_hub.ep_staff_item_done(uuid, boolean), family_hub.ep_staff_use_concession(text),
  family_hub.ep_staff_cancel(uuid, text), family_hub.ep_staff_overview(), family_hub.ep_staff_families(),
  family_hub.ep_require(boolean)
  to authenticated;
grant execute on function family_hub.ep_is_staff(), family_hub.ep_is_chief(), family_hub.ep_is_any_staff()
  to authenticated, service_role;

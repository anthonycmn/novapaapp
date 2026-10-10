-- ---------------------------------------------------------------------------
-- 0099 - A refund, a chargeback or a cancellation takes its points back.
-- ---------------------------------------------------------------------------
-- CJ, 10 Oct 2026: "make sure that when money is refunded, or something is
-- canceled those points are removed from their loyalty program."
--
-- Three ways money comes back off a payment that earned Encore Points (0098):
--
--   * A Stripe refund, from anywhere: the website's admin cancel, the Stripe
--     dashboard, a BookTix or store order. Refunds live only in Stripe, so the
--     Parent Portal's hourly job (/api/jobs/encore-sync) reads them from the
--     Stripe API and records each one here through ep_record_reversal().
--   * A chargeback (Stripe dispute), the same way, for the disputed amount.
--     A dispute NOVAPA later wins does not give the points back on its own;
--     the office adds them back on the staff page.
--   * A seat cancelled in the website admin (public.admin_cancel_item, which
--     logs public.admin_actions 'cancel_item'), with or without a refund. The
--     sync reads that log directly. A refund made BY that cancel carries the
--     item id in its Stripe metadata and is marked covered, so the same seat
--     is never taken back twice.
--
-- What is taken back: a registration order's checkout and its installments
-- count as one purchase. The points removed are the share the refunded or
-- cancelled amount earned (rounded up), never more than that purchase earned
-- in all. The spend comes off the family's season total too, so a refund can
-- drop a tier.
--
-- A family that already spent the points goes below zero and earns its way
-- back; nothing they redeemed is clawed back. Redeeming needs a balance of at
-- least the reward's price, so a negative balance simply waits.
--
-- Recorded refunds wait until the program is open for that family; at launch
-- the back-dated earning and the reversals land in the same run.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, public;

alter table family_hub.ep_ledger drop constraint if exists ep_ledger_kind_check;
alter table family_hub.ep_ledger add constraint ep_ledger_kind_check
  check (kind in ('earn', 'referral', 'redeem', 'refund', 'adjust', 'expire', 'reversal'));
-- The purchase a reversal row took points back from: 'order:<id>' or a source_ref.
alter table family_hub.ep_ledger add column if not exists reverses text;
create index if not exists ep_ledger_reverses_idx on family_hub.ep_ledger (reverses) where reverses is not null;

create table if not exists family_hub.ep_reversals (
  ref         text primary key,      -- 'refund:re_…', 'dispute:dp_…', 'cancel:<admin_actions.id>'
  kind        text not null check (kind in ('refund', 'dispute', 'cancel')),
  order_id    uuid,                  -- a registration order (its checkout and installments together)
  source_ref  text,                  -- otherwise one ledger source: 'tix:…', 'store:…'
  cents       int  not null check (cents >= 0),
  occurred_at timestamptz not null,
  detail      jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  applied_at  timestamptz,
  family_id   uuid references family_hub.families(id) on delete set null,
  points      int,
  outcome     text
);
create index if not exists ep_reversals_pending_idx on family_hub.ep_reversals (occurred_at) where applied_at is null;

alter table family_hub.ep_reversals enable row level security;
drop policy if exists ep_reversals_staff on family_hub.ep_reversals;
create policy ep_reversals_staff on family_hub.ep_reversals
  for select to authenticated using ((select family_hub.ep_is_staff()));
grant select on family_hub.ep_reversals to authenticated;
grant all on family_hub.ep_reversals to service_role;

/* Record money coming back off a payment. Idempotent on p_ref. A refund made
   by the website's cancel-a-seat (detail.item_id) is marked covered: the
   cancellation itself takes the points back. */
create or replace function family_hub.ep_record_reversal(p_ref text, p_kind text, p_order_id uuid, p_source_ref text,
                                                         p_cents int, p_at timestamptz, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare covered boolean := coalesce(p_detail ->> 'item_id', '') <> '';
begin
  if not (family_hub.ep_is_service() or family_hub.ep_is_staff()) then
    raise exception 'Only the Parent Portal server or a Chief/Admin can record a refund.' using errcode = '42501';
  end if;
  insert into family_hub.ep_reversals (ref, kind, order_id, source_ref, cents, occurred_at, detail,
                                       applied_at, points, outcome)
  values (p_ref, p_kind, p_order_id, p_source_ref, greatest(0, coalesce(p_cents, 0)), p_at, coalesce(p_detail, '{}'::jsonb),
          case when covered then now() end, case when covered then 0 end,
          case when covered then 'covered by the seat cancellation' end)
  on conflict (ref) do nothing;
  return found;
end $fn$;

/* What one purchase earned: the family, the points and the spend, and what
   has already been taken back. A registration order is its checkout plus
   every installment. */
create or replace function family_hub.ep_purchase_earned(p_key text,
  out family_id uuid, out points int, out spend int, out reversed_points int, out reversed_spend int)
language plpgsql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
declare oid uuid;
begin
  if p_key like 'order:%' then
    oid := substr(p_key, 7)::uuid;
    select (array_agg(l.family_id))[1], coalesce(sum(l.points), 0)::int, coalesce(sum(l.spend_cents), 0)::int
      into family_id, points, spend
      from family_hub.ep_ledger l
     where l.kind = 'earn'
       and (l.source_ref = p_key
            or l.source_ref in (select 'installment:' || coalesce(i.stripe_invoice, i.order_id::text || ':' || i.paid_at::text)
                                  from public.order_installments i where i.order_id = oid));
  else
    select (array_agg(l.family_id))[1], coalesce(sum(l.points), 0)::int, coalesce(sum(l.spend_cents), 0)::int
      into family_id, points, spend
      from family_hub.ep_ledger l where l.kind = 'earn' and l.source_ref = p_key;
  end if;
  select coalesce(-sum(l.points), 0)::int, coalesce(-sum(l.spend_cents), 0)::int
    into reversed_points, reversed_spend
    from family_hub.ep_ledger l where l.kind = 'reversal' and l.reverses = p_key;
end $fn$;

/* Read new seat cancellations, then take back points for every recorded
   refund, chargeback and cancellation whose purchase earned them. Called at
   the end of ep_sync(). Returns how many reversals were applied. */
create or replace function family_hub.ep_apply_reversals()
returns int
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  prog family_hub.ep_program;
  r family_hub.ep_reversals;
  k text;
  e record;
  pts int;
  sp int;
  n int := 0;
  label text;
begin
  select * into prog from family_hub.ep_program where id = 1;

  insert into family_hub.ep_reversals (ref, kind, order_id, cents, occurred_at, detail)
  select 'cancel:' || a.id::text, 'cancel', nullif(a.payload ->> 'order_id', '')::uuid,
         greatest(0, coalesce((a.payload ->> 'paid_cents')::int, 0)), a.at, a.payload
    from public.admin_actions a
   where a.action = 'cancel_item' and a.at >= (prog.earn_from::timestamp at time zone 'America/New_York')
  on conflict (ref) do nothing;

  for r in select * from family_hub.ep_reversals where applied_at is null order by occurred_at loop
    if r.order_id is null and r.source_ref is null then
      update family_hub.ep_reversals set applied_at = now(), points = 0, outcome = 'no NOVAPA payment matches it'
       where ref = r.ref;
      continue;
    end if;
    k := case when r.order_id is not null then 'order:' || r.order_id::text else r.source_ref end;
    select * into e from family_hub.ep_purchase_earned(k);
    if e.family_id is null then
      -- Nothing earned yet. Before launch that may only mean "not yet"; after
      -- it, the earning loop has just run, so this payment never earned.
      if prog.launched_at is not null then
        update family_hub.ep_reversals set applied_at = now(), points = 0, outcome = 'the payment earned no points'
         where ref = r.ref;
      end if;
      continue;
    end if;
    if r.cents = 0 then
      update family_hub.ep_reversals set applied_at = now(), family_id = e.family_id, points = 0,
             outcome = 'nothing was paid for it' where ref = r.ref;
      continue;
    end if;
    pts := least(e.points - e.reversed_points, ceil(r.cents::numeric * e.points / nullif(e.spend, 0))::int);
    sp := least(r.cents, e.spend - e.reversed_spend);
    if coalesce(pts, 0) <= 0 then
      update family_hub.ep_reversals set applied_at = now(), family_id = e.family_id, points = 0,
             outcome = 'already taken back' where ref = r.ref;
      continue;
    end if;
    label := case r.kind
               when 'refund' then 'Refund'
               when 'dispute' then 'Payment disputed'
               else 'Cancelled' || coalesce(': ' || nullif(r.detail ->> 'what', ''), '')
             end || ' (' || to_char(r.cents / 100.0, 'FM$999,990.00') || ')';
    insert into family_hub.ep_ledger (family_id, points, kind, source_ref, spend_cents, occurred_at, note, reverses)
    values (e.family_id, -pts, 'reversal', 'reversal:' || r.ref, -greatest(sp, 0), r.occurred_at, label, k)
    on conflict (source_ref) do nothing;
    update family_hub.ep_reversals set applied_at = now(), family_id = e.family_id, points = pts, outcome = 'reversed'
     where ref = r.ref;
    n := n + 1;
  end loop;
  return n;
end $fn$;

/* ep_sync, as 0098, now ending with the reversals. */
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
  reversed int := 0;
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

  -- Refunds, chargebacks and cancellations take back the points they earned
  -- (hub 0099). After earning, so a payment refunded before launch is earned
  -- and taken back in the same run and the family never sees it.
  reversed := family_hub.ep_apply_reversals();

  return jsonb_build_object('earned', earned, 'unmatched', unmatched, 'expired', expired, 'reversed', reversed);
end $fn$;

/* The tracker, as 0098, plus points taken back this month and reversals waiting. */
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
    'points_reversed_month', (select coalesce(-sum(points), 0) from family_hub.ep_ledger
                               where kind = 'reversal' and created_at >= m0),
    'reversals_pending', (select count(*) from family_hub.ep_reversals where applied_at is null),
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

revoke all on function family_hub.ep_record_reversal(text, text, uuid, text, int, timestamptz, jsonb),
  family_hub.ep_purchase_earned(text), family_hub.ep_apply_reversals() from public, anon;
grant execute on function family_hub.ep_record_reversal(text, text, uuid, text, int, timestamptz, jsonb)
  to authenticated, service_role;
grant execute on function family_hub.ep_purchase_earned(text), family_hub.ep_apply_reversals() to service_role;

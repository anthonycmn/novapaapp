-- Every move a family makes in the portal, written down as a sentence.
--
-- CJ, 4 Sep 2026: a play-by-play audit log of the parent portal that the
-- Chief can read from the staff portal.
--
-- WHAT THIS IS NOT. The staff portal's audit_log is a trigger writing raw
-- old/new rows — the right shape for "who edited this cell". This is the
-- other shape: one row per thing a PARENT DID, written by the server action
-- that did it, with a sentence a human can read at a glance. "Reported an
-- absence for Elsie — Frozen JR., Sat 12 Sep" is the play-by-play; the row
-- diff behind it lives in the tables it changed.
--
-- WHY APPLICATION-WRITTEN AND NOT A TRIGGER. The hub writes with the service
-- role, so a trigger here would see no auth.uid() and could only echo table
-- names and jsonb — exactly the log this is not. The server actions know who
-- was signed in, which child, which show, and whether a Chief was standing in
-- the family's shoes (hub 0063); they are the only place the sentence can be
-- composed. The cost is honesty about coverage: an action nobody instrumented
-- writes no line. The write is best-effort by design — a log insert failing
-- must never fail the thing it describes.
--
-- WHO MAY READ IT. staff_portal.is_chief() and nobody else — the same gate as
-- the portal's own audit log, which is CJ and Todd exactly. The summaries name
-- children and say things like "signed the health form", so this sits behind
-- the narrowest gate we have. Parents never see it: a family must not be able
-- to enumerate what the office watches, and the rows carry other families'
-- names in no order a parent has any business reading.
--
-- Nobody INSERTS through PostgREST: the hub's service role bypasses RLS, and
-- that is the only writer.
--
-- Safe to re-run.
set search_path = family_hub, public;

create table if not exists family_hub.activity_log (
  id                 bigint generated always as identity primary key,
  occurred_at        timestamptz not null default now(),

  -- Who did it. Denormalized on purpose: the reader is a timeline, and a
  -- timeline that joins four tables to caption each line is a timeline that
  -- breaks when a profile is renamed or a family is merged. The row says what
  -- was true at the moment it happened.
  actor_user_id      uuid,
  actor_name         text,
  actor_email        text,
  actor_role         text,
  family_id          uuid,
  family_name        text,
  student_id         uuid,

  -- The play. `action` is a stable dotted slug ('absence.reported') for
  -- filtering; `summary` is the sentence a human reads. The actor is NOT
  -- repeated in the summary — the page puts the name in front of it.
  action             text not null,
  summary            text not null,
  detail             jsonb not null default '{}'::jsonb,

  -- Set when a Chief was wearing this family's shoes (hub 0063). The line
  -- still belongs to the family's timeline, but it must never read as the
  -- parent's own doing.
  impersonator_email text
);

comment on table family_hub.activity_log is
  'One row per thing a family did in the parent portal, written by the server '
  'action that did it, as a human-readable sentence. Read only by '
  'staff_portal.is_chief() from the staff portal (/family-activity). Hub 0065.';
comment on column family_hub.activity_log.action is
  'Stable dotted slug for filtering, e.g. absence.reported, store.checkout. '
  'Hub 0065.';
comment on column family_hub.activity_log.summary is
  'The sentence, without the actor''s name — the reader prepends it. Hub 0065.';
comment on column family_hub.activity_log.impersonator_email is
  'Set when a Chief was signed in as this family (hub 0063), so the line can '
  'never read as the parent''s own doing. Hub 0065.';

create index if not exists activity_log_when_idx
  on family_hub.activity_log (occurred_at desc);
create index if not exists activity_log_family_idx
  on family_hub.activity_log (family_id, occurred_at desc);
create index if not exists activity_log_action_idx
  on family_hub.activity_log (action, occurred_at desc);

alter table family_hub.activity_log enable row level security;

-- Start from nothing, then grant exactly one read.
revoke all on family_hub.activity_log from anon, authenticated;

drop policy if exists activity_log_read_chief on family_hub.activity_log;
create policy activity_log_read_chief on family_hub.activity_log
  for select to authenticated
  using (staff_portal.is_chief());

grant select on family_hub.activity_log to authenticated;

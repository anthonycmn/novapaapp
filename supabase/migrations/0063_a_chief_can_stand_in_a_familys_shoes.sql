-- A Chief can stand in a family's shoes, and the shoes remember who wore them.
--
-- CJ, 4 Sep 2026: "I want the ability to as a super admin - log into anyone's
-- portal as a family member and make changes as needed. So I can log-in as
-- them."
--
-- The need is a support call. A parent cannot find the thing, or has typed the
-- wrong date into it, and describing which button to press over the phone is
-- slower and worse than doing it. Every product that supports families ends up
-- with this, and the ones that regret it are the ones that built the logging in
-- and not the writing down.
--
-- WHAT THIS TABLE IS FOR. Not permission -- the permission check is that the
-- caller is a Chief in staff_portal.portal_users, and it happens in the API
-- route. This is the record: who wore whose shoes, from when to when, and
-- whether they were stopped or simply timed out. Without it, an edit made
-- during an impersonation is indistinguishable from an edit the parent made
-- themselves, and the first time that matters will be the first time somebody
-- disputes it.
--
-- ONE-TIME, SHORT-LIVED HANDOFF. The staff portal is a different origin and
-- cannot set this app's cookie, so entry is a token in a URL. A token in a URL
-- is a credential in a place credentials leak from -- browser history, a
-- referrer header, a shoulder -- so it is single-use, expires in two minutes,
-- and only the SHA-256 of it is stored. A leaked link is a link that has
-- already been spent.
--
-- FOUR THINGS A CHIEF MAY NOT DO IN THESE SHOES, decided by CJ on the way in:
-- sign a document, change who may collect a child, edit the health and allergy
-- record, or spend at the store. Those are not data edits. Three of them are a
-- named person attesting to something and the fourth is somebody's money, and a
-- portal where staff can produce a parent's signature is a portal whose
-- signatures are worth nothing in the argument they exist for. The block is
-- enforced in the server actions; blocked_attempts records the reaching for it,
-- because "I could not do X for you" is a thing the next person on the call
-- needs to know.
--
-- Safe to re-run.
set search_path = family_hub, public;

create table if not exists family_hub.impersonation_sessions (
  id                uuid primary key default gen_random_uuid(),

  -- Who is wearing them. Email rather than a foreign key: the actor is a staff
  -- portal user and may have no row in this app at all.
  actor_email       text not null,
  actor_name        text,

  -- Whose they are.
  target_user_id    uuid not null,
  target_email      text,
  target_family_id  uuid,

  -- Why. Typed by the Chief on the way in, so the record answers the question
  -- somebody will actually ask, which is never "when" and always "what for".
  reason            text,

  -- The handoff. Only the hash is kept; the token itself lives in one URL for
  -- two minutes and is spent on first use.
  token_sha256      text not null unique,
  token_expires_at  timestamptz not null,
  consumed_at       timestamptz,

  started_at        timestamptz,
  ended_at          timestamptz,
  /* 'left'      -- the Chief pressed Leave
     'expired'   -- the session ran past its window
     'signed_out'-- the ordinary sign-out was used                            */
  ended_reason      text check (ended_reason in ('left', 'expired', 'signed_out')),

  -- What they reached for and were refused, so the parent can be told.
  blocked_attempts  jsonb not null default '[]'::jsonb,

  created_at        timestamptz not null default now()
);

comment on table family_hub.impersonation_sessions is
  'Every time a Chief entered a family account: who, whose, why, from when to '
  'when, and what they were refused. The permission check lives in the API '
  'route; this is the record of it having happened. Hub 0063.';
comment on column family_hub.impersonation_sessions.token_sha256 is
  'SHA-256 of the one-time entry token. The token itself is never stored -- it '
  'exists in a single URL for two minutes and is spent on first use. Hub 0063.';
comment on column family_hub.impersonation_sessions.blocked_attempts is
  'Array of {at, action} for the four things impersonation may not do: sign a '
  'document, change pickup, edit health, or buy. Recorded rather than silently '
  'refused, so the parent can be told what still needs them. Hub 0063.';

create index if not exists impersonation_sessions_actor_idx
  on family_hub.impersonation_sessions (actor_email, created_at desc);
create index if not exists impersonation_sessions_target_idx
  on family_hub.impersonation_sessions (target_user_id, created_at desc);
create index if not exists impersonation_sessions_family_idx
  on family_hub.impersonation_sessions (target_family_id, created_at desc);

-- RLS on with no policy for authenticated, deliberately. Nothing in this app
-- reads this table as a signed-in user: it is written and read by the service
-- role in the API routes, and read by a human in the staff portal through a
-- view that is Chief-gated there. A parent must never be able to enumerate the
-- times somebody was in their account -- not because it is a secret from them,
-- but because the row carries a staff email and a reason written for staff.
alter table family_hub.impersonation_sessions enable row level security;

revoke all on family_hub.impersonation_sessions from anon, authenticated;

-- Writing down a refusal.
--
-- A function rather than a read-modify-write from the app, because two guards
-- firing in the same second would otherwise each read the array, each append
-- one entry, and the second would overwrite the first. jsonb || is atomic
-- inside one statement.
--
-- Deliberately forgiving about the session id: the guard's job is to refuse,
-- and a refusal must not fail because the note about it could not be filed.
create or replace function family_hub.append_impersonation_block(
  p_session uuid,
  p_action  text
) returns void
language sql
security definer
set search_path = family_hub, public
as $$
  update family_hub.impersonation_sessions
     set blocked_attempts = blocked_attempts
                          || jsonb_build_object('at', now(), 'action', p_action)
   where id = p_session;
$$;

-- service_role alone. A parent's browser has no business calling this, and
-- Supabase re-grants EXECUTE to PUBLIC on every CREATE OR REPLACE.
revoke all on function family_hub.append_impersonation_block(uuid, text) from public, anon, authenticated;
grant execute on function family_hub.append_impersonation_block(uuid, text) to service_role;

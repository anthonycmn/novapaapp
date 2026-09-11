-- 0077 — A parent can be let in by hand.
--
-- Kelly Watson (Frozen Jr., 8–9 Sep 2026) created her account, could not sign
-- in with the password she had typed, asked for four reset links, reached the
-- reset form on her phone four times and never once got a password saved. The
-- office had nothing to send her but a fifth reset link.
--
-- This is the thing to send instead: a one-time link that opens the portal for
-- one known account with no password at all, then offers to set one from
-- inside. It is issued by us (scripts/issue-login-link.mjs), never requested
-- from a form, so it cannot be used to enumerate accounts; only its SHA-256 is
-- stored, so a copy in a mail log or browser history is already worthless; it
-- is spent by a button press, not by loading the page, so the mail-security
-- proxy that fetched every one of Kelly's reset links ahead of her gets a page
-- and not a session.
--
-- Safe to re-run.

create table if not exists family_hub.login_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  email         text not null,
  token_sha256  text not null unique,
  issued_by     text,
  note          text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);

comment on table family_hub.login_links is
  'One-time, office-issued sign-in links for the parent portal. Only the token hash is stored; used_at is stamped in the same statement that checks it was null.';

create index if not exists login_links_user_idx on family_hub.login_links (user_id);

-- Service role only. No policy for authenticated or anon: nothing in a browser
-- ever reads or writes this table; the server action spends the row.
alter table family_hub.login_links enable row level security;
grant all on family_hub.login_links to service_role;

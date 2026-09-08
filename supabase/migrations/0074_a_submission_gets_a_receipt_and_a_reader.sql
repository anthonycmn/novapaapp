-- A submission gets a receipt, and the panel signs for reading it.
--
-- CJ, 8 Sep 2026: when a family submits the audition form, show them a page
-- that says it went through, give them a confirmation code, email them the
-- same, and over in the staff portal let the team open each child and have it
-- show "the director has already seen it, the vocal director has seen it,
-- the music director has seen it — based on their role in the show."
--
-- THREE THINGS, ONE MIGRATION, because they are one promise: the family is
-- told "the staff will review it shortly", and this is where that review is
-- recorded so the promise can be checked.
--
-- 1. audition_profiles.confirmation_code — the receipt. Minted ONCE, by a
--    before-insert trigger, and never touched by an update: a family who
--    changes their preference in October keeps the code from September,
--    because the code is the name of the submission, not of its latest
--    edit. The app's upsert does not send this column, so the trigger is the
--    only writer.
--
--    The alphabet leaves out 0/O, 1/I/L and 5/S on purpose. A parent reads
--    this off a phone screen to a person on a phone; a code that cannot be
--    misheard is worth more than one that packs more bits. 8 characters from
--    a 27-letter alphabet is 2.8e11 codes against a few hundred submissions a
--    season, and the unique index turns the one-in-a-billion collision into a
--    retry rather than a duplicate.
--
-- 2. audition_profiles.submitted_at — when the form first went through. The
--    row already had created_at, but "created" is the app's word and this is
--    the family's: it is the timestamp on their receipt. Backfilled from
--    acknowledged_at for the five submissions already in.
--
-- 3. audition_reviews — one row per (submission, reader, role). Written by
--    the staff portal when somebody on the show opens a child's audition.
--    reviewer_role is the show role that person holds — "Director", "Vocal
--    Director", "Music Director", "Choreographer" — copied from the portal's
--    production team AT THE MOMENT OF READING, so the stamp says what they
--    were when they read it even if the team changes later. A person holding
--    two roles on one show gets two rows, one per hat.
--
--    seen_updated_at carries the submission's updated_at as it stood when
--    read. If the family edits after that, the two dates disagree and the
--    portal can say "seen, but changed since" instead of letting a stale
--    tick stand over a new video.
--
-- RLS: staffish only, both ways. A family never sees who has read their
-- child's form — "the staff will review it shortly" is the whole of what they
-- are told, and a parent watching stamps appear one by one is a parent
-- ringing the office to ask why the third one has not.
--
-- Additive. Safe to re-run.
set search_path = family_hub, public;

/* ── 1. the receipt ─────────────────────────────────────────────────────── */

create or replace function family_hub.audition_confirmation_code()
returns text
language plpgsql
volatile
set search_path = family_hub, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRTUVWXYZ23467'; -- no 0/O, 1/I/L, 5/S, 8/B, 9
  bytes bytea;
  code text := '';
  i int;
begin
  -- One more byte than needed is cheap; mod-27 on a byte skews ever so
  -- slightly toward the first letters and nobody is guessing these.
  bytes := gen_random_bytes(8);
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return 'AUD-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

comment on function family_hub.audition_confirmation_code() is
  'A fresh AUD-XXXX-XXXX receipt code from an unambiguous alphabet. Hub 0074.';

alter table family_hub.audition_profiles
  add column if not exists confirmation_code text,
  add column if not exists submitted_at timestamptz;

comment on column family_hub.audition_profiles.confirmation_code is
  'The receipt the family is shown and emailed. Minted once on insert by '
  'trg_audition_profile_receipt; never changed by an update. Hub 0074.';
comment on column family_hub.audition_profiles.submitted_at is
  'When the form first went through — the date on the family''s receipt. '
  'updated_at moves on every later edit; this does not. Hub 0074.';

-- Every submission already in gets a receipt, dated from the acknowledgment
-- it was made with. Done row by row so each gets its own random code.
update family_hub.audition_profiles
   set confirmation_code = family_hub.audition_confirmation_code(),
       submitted_at = coalesce(submitted_at, acknowledged_at, created_at)
 where confirmation_code is null;

create unique index if not exists audition_profiles_confirmation_code_key
  on family_hub.audition_profiles (confirmation_code);

create or replace function family_hub.trg_audition_profile_receipt()
returns trigger
language plpgsql
set search_path = family_hub, extensions
as $$
begin
  if new.confirmation_code is null then
    new.confirmation_code := family_hub.audition_confirmation_code();
  end if;
  if new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audition_profile_receipt on family_hub.audition_profiles;
create trigger trg_audition_profile_receipt
  before insert on family_hub.audition_profiles
  for each row execute function family_hub.trg_audition_profile_receipt();

-- An update must not be able to blank the receipt. The app never sends the
-- column, but a hand-run UPDATE ... set confirmation_code = null would, and
-- a family whose code stops working is a family who thinks their audition
-- was lost.
create or replace function family_hub.trg_audition_profile_keep_receipt()
returns trigger
language plpgsql
set search_path = family_hub, extensions
as $$
begin
  new.confirmation_code := coalesce(old.confirmation_code, new.confirmation_code);
  new.submitted_at := coalesce(old.submitted_at, new.submitted_at, now());
  return new;
end;
$$;

drop trigger if exists trg_audition_profile_keep_receipt on family_hub.audition_profiles;
create trigger trg_audition_profile_keep_receipt
  before update on family_hub.audition_profiles
  for each row execute function family_hub.trg_audition_profile_keep_receipt();

/* ── 3. who has read it ─────────────────────────────────────────────────── */

create table if not exists family_hub.audition_reviews (
  id uuid primary key default gen_random_uuid(),
  audition_profile_id uuid not null
    references family_hub.audition_profiles (id) on delete cascade,
  student_id uuid not null references family_hub.students (id) on delete cascade,
  production_id uuid not null references family_hub.productions (id) on delete cascade,
  reviewer_user_id uuid not null references family_hub.profiles (id) on delete cascade,
  reviewer_name text not null default '',
  -- The show role the reader held when they read it: "Director", "Vocal
  -- Director", "Music Director", "Choreographer"… or "Chief"/"Admin" for
  -- somebody reading from above the show.
  reviewer_role text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- The submission's updated_at as it stood when last read. Older than the
  -- profile's updated_at means the family changed something since.
  seen_updated_at timestamptz,
  unique (audition_profile_id, reviewer_user_id, reviewer_role)
);

comment on table family_hub.audition_reviews is
  'One row per (submission, reader, show role): who on the team has opened a '
  'child''s audition and in what capacity. Written by the staff portal. '
  'Families never see it. Hub 0074.';

create index if not exists audition_reviews_production_idx
  on family_hub.audition_reviews (production_id);
create index if not exists audition_reviews_reviewer_idx
  on family_hub.audition_reviews (reviewer_user_id);

alter table family_hub.audition_reviews enable row level security;

drop policy if exists audition_reviews_staff on family_hub.audition_reviews;
create policy audition_reviews_staff on family_hub.audition_reviews
  for all
  using (family_hub.is_staffish())
  with check (family_hub.is_staffish() and reviewer_user_id = auth.uid());

-- The schema's default privileges hand every new table to anon as well;
-- nothing anonymous has any business here.
revoke all on family_hub.audition_reviews from anon;
grant select, insert, update, delete on family_hub.audition_reviews to authenticated;
grant all on family_hub.audition_reviews to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 0003_schedule_forms.sql — calendar events, iCal tokens, health forms,
-- early drop-off / late pick-up requests.
-- ─────────────────────────────────────────────────────────────────────────

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'other'
    check (type in ('class','rehearsal','tech','performance','workshop','fitting','photo_call','other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  call_time timestamptz,
  location text not null default '',
  map_url text,
  what_to_bring text,
  contact_name text,
  contact_email text,
  class_id uuid references classes (id) on delete cascade,
  production_id uuid references productions (id) on delete cascade,
  changed_at timestamptz,
  change_note text,
  check (num_nonnulls(class_id, production_id) >= 1)
);

create index calendar_events_starts_at_idx on calendar_events (starts_at);

-- Tokenized per-family iCal feed URL (#5). Regenerating the token
-- invalidates old subscriptions.
create table family_calendar_tokens (
  family_id uuid primary key references families (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- ── health forms (#9) ────────────────────────────────────────────────────
create table health_forms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  season_id uuid not null references seasons (id),
  answers jsonb not null default '{}',
  signed_by_name text,
  signed_at timestamptz,
  signed_from_ip inet,
  expires_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, season_id)
);

create index health_forms_expiry_idx on health_forms (expires_on)
  where signed_at is not null;

-- ── early drop-off / late pick-up (#10) ──────────────────────────────────
create table pickup_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  kind text not null check (kind in ('early_dropoff','late_pickup','both')),
  start_date date not null,
  end_date date not null,
  recurring_days int[] not null default '{}',
  drop_off_time time,
  pick_up_time time,
  reason text not null default '',
  supervising_adult text,
  authorized_pickup_person text,
  fee_cents int not null default 0,
  status text not null default 'pending'
    check (status in ('pending','approved','denied')),
  decision_note text,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index pickup_requests_status_idx on pickup_requests (status, start_date);

-- ── notifications & feed (Phase 2 tables, defined here alongside their
--    Phase 3 consumers so migrations stay in dependency order) ────────────
create table feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_staff_id uuid references staff_profiles (id),
  author_name text not null,
  title text,
  body text not null,
  image_urls text[] not null default '{}',
  video_embed_url text,
  link_url text,
  category text not null default 'general',
  audience jsonb not null default '{}',
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  reaction_counts jsonb not null default '{"heart":0,"clap":0,"star":0}'
);

create table post_questions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts (id) on delete cascade,
  asker_user_id uuid not null references profiles (id) on delete cascade,
  asker_name text not null,
  question text not null,
  answer text,
  answered_by_name text,
  answered_at timestamptz,
  is_public_faq boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_unread_idx on notifications (user_id, read_at);

create table notification_prefs (
  user_id uuid primary key references profiles (id) on delete cascade,
  enabled jsonb not null default '{}',
  quiet_hours_start time,
  quiet_hours_end time
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table email_sends (
  id uuid primary key default gen_random_uuid(),
  template_id text,
  subject text not null,
  body text not null,
  category text not null,
  audience jsonb not null default '{}',
  scheduled_for timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{"delivered":0,"opened":0,"total":0}',
  created_by_name text not null default ''
);

-- Family-level email category opt-outs. Critical category ignores these.
create table email_preferences (
  family_id uuid not null references families (id) on delete cascade,
  category text not null,
  opted_out boolean not null default false,
  primary key (family_id, category),
  check (category <> 'critical') -- critical can never be opted out of
);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table calendar_events enable row level security;
alter table family_calendar_tokens enable row level security;
alter table health_forms enable row level security;
alter table pickup_requests enable row level security;
alter table feed_posts enable row level security;
alter table post_questions enable row level security;
alter table notifications enable row level security;
alter table notification_prefs enable row level security;
alter table push_subscriptions enable row level security;
alter table email_sends enable row level security;
alter table email_preferences enable row level security;

-- Calendar events are readable by any signed-in user; the app filters to
-- the family's enrollments. Only staff write.
create policy calendar_read on calendar_events
  for select using (auth.uid() is not null);
create policy calendar_write on calendar_events
  for all using (is_staffish());

-- iCal tokens: own family + admin. The public .ics route reads via the
-- service role, not this policy.
create policy cal_tokens_read on family_calendar_tokens
  for select using (family_id = auth_family_id() or is_admin());
create policy cal_tokens_write on family_calendar_tokens
  for all using (family_id = auth_family_id() or is_admin());

-- Health forms: own family read/write; staffish read (safety roster).
-- Staff never write a family's attestation.
create policy health_read on health_forms
  for select using (
    is_staffish()
    or exists (
      select 1 from students s
      where s.id = health_forms.student_id and s.family_id = auth_family_id()
    )
  );
create policy health_write on health_forms
  for all using (
    exists (
      select 1 from students s
      where s.id = health_forms.student_id and s.family_id = auth_family_id()
    )
    and auth_role() = 'parent'
  );

-- Pickup requests: own family read/create; staffish read + decide.
create policy pickup_read on pickup_requests
  for select using (family_id = auth_family_id() or is_staffish());
create policy pickup_insert on pickup_requests
  for insert with check (family_id = auth_family_id() and auth_role() = 'parent');
create policy pickup_decide on pickup_requests
  for update using (is_staffish());

-- Feed: everyone signed in reads (app filters by audience); staff write.
create policy feed_read on feed_posts for select using (auth.uid() is not null);
create policy feed_write on feed_posts for all using (is_staffish());

-- Questions: asker + staffish, or published FAQs.
create policy questions_read on post_questions
  for select using (
    is_staffish() or asker_user_id = auth.uid() or is_public_faq
  );
create policy questions_insert on post_questions
  for insert with check (asker_user_id = auth.uid());
create policy questions_answer on post_questions
  for update using (is_staffish());

-- Notifications & prefs & push subscriptions: strictly own rows.
create policy notifications_own on notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on notifications
  for update using (user_id = auth.uid());
create policy prefs_own on notification_prefs
  for all using (user_id = auth.uid());
create policy push_own on push_subscriptions
  for all using (user_id = auth.uid());

-- Email: staff only.
create policy email_sends_staff on email_sends for all using (is_staffish());
create policy email_prefs_read on email_preferences
  for select using (family_id = auth_family_id() or is_staffish());
create policy email_prefs_write on email_preferences
  for all using (family_id = auth_family_id() or is_admin());

-- Health-form expiry reminders at 30/14/3 days are driven by a scheduled
-- job reading health_forms_expiry_idx (see scripts/ and NEEDS-FROM-TONY #2).
create or replace function health_forms_expiring(days_ahead int)
returns table (student_id uuid, family_id uuid, expires_on date)
language sql stable security definer set search_path = public as $$
  select hf.student_id, s.family_id, hf.expires_on
  from health_forms hf
  join students s on s.id = hf.student_id
  where hf.signed_at is not null
    and hf.expires_on = current_date + days_ahead
$$;

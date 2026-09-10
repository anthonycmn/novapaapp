-- 0081 — A bug can be reported from where it happened.
--
-- Yin, a parent, 8 Sep 2026, after reporting two bugs by email: "I also found
-- it harder to report iOS bugs because I shall provide system information (eg,
-- browser, iOS version) to help developers replicate them ... Create a bug
-- report button. When the user reports the bug, it automatically catches the
-- users' system environment such as browser version, OS platform and version."
--
-- She is describing work she had to do for us. Her first report named the
-- device, the iOS version and the phone; her second corrected herself the next
-- evening — "the name error occurs on web page too, so it's not iOS specific"
-- — which is a parent doing a second round of testing on our behalf. Almost
-- nobody does that, and the reports we lose are the ones from everybody who
-- doesn't.
--
-- So the page collects what it already knows. What it knows is written on the
-- form before it is sent: the browser, the platform, the size of the window,
-- whether the portal is installed to the home screen or open in a tab, which
-- page they were on, and which build was serving it. Pressing Send is the
-- consent, which is why the block is shown rather than described.
--
-- CJ, 10 Sep 2026: "cj@ gets the reports only no screen shot." So there is no
-- image column here and no bucket behind it — a parent's screenshot of a cast
-- list carries other people's children, and that is not a thing to start
-- storing for the sake of a nice-to-have.
--
-- Safe to re-run.

create table if not exists family_hub.bug_reports (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  /* Who hit it. Kept even if the account goes, because the report stays useful. */
  reporter_user_id  uuid references family_hub.profiles(id) on delete set null,
  reporter_name     text,
  reporter_email    text,
  reporter_role     text,

  /* Where they were when it happened, in the app's own terms. */
  page_path         text,

  /* Their words. The second box is optional: plenty of reports are just "this
     is broken", and a form that insists on a hypothesis gets fewer of them. */
  what_happened     text not null,
  what_expected     text,

  /*
   * Everything the browser told us, as shown to the reporter before they sent
   * it. jsonb rather than columns because this list will grow, and a report
   * from an older build should still open.
   */
  environment       jsonb not null default '{}'::jsonb,

  /* CJ's pile, and whether he is done with this one. */
  status            text not null default 'new'
                      check (status in ('new', 'handled')),
  handled_at        timestamptz,

  /* Whether the mail actually went. A report that saved and failed to send is
     still a report, and this is how it gets noticed rather than lost. */
  emailed           boolean not null default false
);

create index if not exists bug_reports_open_idx
  on family_hub.bug_reports (status, created_at desc);

alter table family_hub.bug_reports enable row level security;

/* Anybody signed in may report a bug — about themselves, and no one else. */
drop policy if exists bug_reports_insert_own on family_hub.bug_reports;
create policy bug_reports_insert_own on family_hub.bug_reports
  for insert
  with check (reporter_user_id = auth.uid());

/*
 * Reading them is staff work. A bug report is one family describing what they
 * were doing, sometimes with a child's name in it, and it is not something
 * other families should be able to browse.
 */
drop policy if exists bug_reports_read_staff on family_hub.bug_reports;
create policy bug_reports_read_staff on family_hub.bug_reports
  for select
  using (family_hub.is_staffish());

drop policy if exists bug_reports_update_staff on family_hub.bug_reports;
create policy bug_reports_update_staff on family_hub.bug_reports
  for update
  using (family_hub.is_staffish());

notify pgrst, 'reload schema';

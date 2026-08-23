-- A family reporting an absence can now say WHEN, not just WHICH DAY.
--
-- Tony, 23 Aug 2026: "I want the parent portal to be: Date Missed and then
-- start time and end time - for example - maybe they are arriving late etc."
--
-- Additive on purpose. The six reports already filed said "this whole day",
-- and that is exactly what NULL means here — a report with no times is the
-- whole call, which is how every existing row must keep reading.
--
-- starts_on / ends_on stay: the admin views, the notification and the
-- family's own receipt all read them, and a single-day report simply writes
-- the same date to both.
alter table family_hub.absence_reports
  add column if not exists starts_at_time time,
  add column if not exists ends_at_time time;

comment on column family_hub.absence_reports.starts_at_time is
  'Local start of the absent window; NULL means the whole call.';
comment on column family_hub.absence_reports.ends_at_time is
  'Local end of the absent window; NULL means the whole call.';

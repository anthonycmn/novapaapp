-- 0084 — An absence can be from a class.
--
-- CJ, 13 Sep 2026: "Why aren't absences being recorded. I want them to be
-- across the entire system. Build that bridge."
--
-- The absence form (0044) was written for shows — "Allow for parents to
-- submit absences in their dashboard for their shows" — and absence_reports
-- carries a production_id and nothing else to say what is being missed. A
-- family whose child is in Tuesday dance had no way to tell the teacher they
-- would not be in on Tuesday, and the staff portal's class register, which
-- reads this table for "what the family already told us", could only ever
-- draw a blank for a class.
--
-- One column. A report names a show OR a class; offering_title still carries
-- the words either way, so a report whose class is later retired still
-- reads. Nullable and on delete set null for the same reason production_id
-- is (0044): an absence that loses its class is still a thing a family told
-- us.
--
-- The staff portal's views over this table (v_absence_reports,
-- v_family_absences_by_day, v_absence_days) pick the column up in staff
-- portal 0296 and resolve it to the portal's own class through the
-- registration listing, which is the key both sides already share.
--
-- Safe to re-run.

alter table family_hub.absence_reports
  add column if not exists class_id uuid references family_hub.classes (id) on delete set null;

create index if not exists absence_reports_class_idx
  on family_hub.absence_reports (class_id, starts_on);

comment on column family_hub.absence_reports.class_id is
  'The class being missed, when the absence is from a class rather than a show (0084). Null on show absences and on reports whose class was retired; offering_title still reads.';

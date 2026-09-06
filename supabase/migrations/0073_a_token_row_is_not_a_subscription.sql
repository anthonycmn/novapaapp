-- 0073 — A token row is not a subscription.
--
-- The "Get rehearsals on your phone" card renders while the family has no
-- calendar subscription — but it tested for a family_calendar_tokens ROW,
-- and getCalendarToken lazily inserts one the first time anyone so much as
-- opens /schedule. Row presence means "once saw the schedule page", so the
-- nudge was dead on arrival for exactly its target audience (Sep 6 2026
-- review).
--
-- The honest signal is the feed being FETCHED: calendar apps poll the ICS
-- URL on a schedule, so one stamp from the feed route separates a family
-- whose phone is actually subscribed from one who merely visited.
--
-- Safe to re-run.

alter table family_hub.family_calendar_tokens
  add column if not exists last_fetched_at timestamptz;

-- A notification can ring a phone.
--
-- Every notification this app writes lands in family_hub.notifications and
-- waits to be noticed. Web push (the manifest, the service worker handlers,
-- the push_subscriptions table from 0003) has been staged since Phase 2 but
-- nothing ever SENT one: no VAPID keys, no sender, no record of what went out.
--
-- This column is the outbox marker. A row with push_sent_at null is push work
-- waiting to happen; the drain job (api/jobs/push-queue) claims it, rings
-- every device the account has subscribed, and stamps it. Quiet hours defer
-- the stamp, so the morning run delivers what the night held back.
--
-- The backfill stamps every existing row with its own created_at: the day
-- push turns on must not ring 789 families' phones with weeks of old news.

alter table family_hub.notifications
  add column if not exists push_sent_at timestamptz;

update family_hub.notifications
   set push_sent_at = created_at
 where push_sent_at is null;

-- The drain only ever asks one question: what is pending, oldest first.
create index if not exists notifications_push_pending_idx
  on family_hub.notifications (created_at)
  where push_sent_at is null;

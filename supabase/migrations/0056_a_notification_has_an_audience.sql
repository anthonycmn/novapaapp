-- A notification has an audience: the family it is about, or the office.
--
-- CJ, 2 Sep 2026, looking at his own notification center: "why am I seeing
-- everyone's notifications — I only want to see my notification, NOT
-- everyone's", and "I should only see my child's playbill correction name,
-- not everyone's."
--
-- Both sentences are the same row. Nothing here leaked: every notification is
-- already addressed to exactly one account (`user_id`), and the four playbill
-- corrections in his feed are genuinely his — sent to him because he is a
-- super admin and somebody has to key those names into the playbill. What the
-- table could not say is that ONE ACCOUNT CAN BE TWO PEOPLE. CJ is the parent
-- of one child and the administrator of the organization, and the family
-- notification center was pouring both jobs into one list: his child's casting
-- notice sitting between two other families' name corrections, and the same
-- corrections riding the dashboard's alert band because they are unread
-- broadcasts.
--
-- A parent who is only a parent never had one of these rows and still does
-- not. This is not a hole being closed; it is a page that had no way to tell
-- "news about your child" from "work waiting for the office" being given one.
--
-- 'family' is the default because that is what every row written by the portal
-- RPCs (0022, 0024, 0025, 0026, 0028) already is — a parent being told
-- something about their own child — and those functions are left alone.
--
-- The backfill reads the url: every staff-directed notification this app has
-- ever written points at /admin/..., and no family-directed one does.

alter table family_hub.notifications
  add column if not exists audience text not null default 'family';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'family_hub.notifications'::regclass
      and conname = 'notifications_audience_known'
  ) then
    alter table family_hub.notifications
      add constraint notifications_audience_known
      check (audience in ('family', 'staff'));
  end if;
end
$$;

update family_hub.notifications
   set audience = 'staff'
 where audience <> 'staff'
   and url like '/admin/%';

-- The family center, the bell count and the office tab all read one account's
-- rows of one audience, newest first.
create index if not exists notifications_audience_idx
  on family_hub.notifications (user_id, audience, created_at desc);

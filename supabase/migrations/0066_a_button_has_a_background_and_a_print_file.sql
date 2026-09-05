-- A spirit button gets a real background, and the order carries the file
-- that goes to the press.
--
-- CJ, 5 Sep 2026: upload a background per show; the parent uploads a photo,
-- the system cuts the child out and sets them on that background with the
-- name and role; the parent sees the finished button, and the office sends
-- THAT image to the button producer — printed as previewed, untouched.
--
-- Three columns, all text holding data URIs, which is the hub's standing
-- convention for images (family_hub.students.headshot_url is base64, and so
-- is every photo the store already keeps): a data URI is judged by the RLS
-- of the row it sits in and never expires, where the fh- buckets carry no
-- storage policies and their signed links die within the hour.
--
--   button_templates.background_image_url — the show's artwork, admin-
--     uploaded, drawn under the cutout. Distinct from frame_image_url
--     (an overlay concept that predates this and was never wired).
--
--   cart_items.print_image_url / button_order_items.print_image_url — the
--     flattened, print-resolution artwork (300 DPI with bleed), composited
--     in the parent's browser at submit time from exactly what the preview
--     showed. Snapshotted from cart to order like every other line field,
--     because a later template edit must not change what a family already
--     approved.
--
-- Nullable, all three: every design placed before today has none, and a
-- browser that cannot run the cutout still submits a plain-photo design.

set search_path = family_hub, extensions;

alter table button_templates add column if not exists background_image_url text;
alter table cart_items add column if not exists print_image_url text;
alter table button_order_items add column if not exists print_image_url text;

-- A post can carry something to read.
--
-- CJ, 9 Sep 2026: "allow me to attach things to feed posts so parents can
-- click them and read them — for example a slideshow."
--
-- A feed post has always had three places to put something that is not
-- words — image_urls, video_embed_url, link_url — and the parent app renders
-- exactly one of them (the link). The parent-night slideshow, the costume
-- guide, the rehearsal calendar PDF: none of them had a door. Staff pasted a
-- Drive link into the body and hoped the sharing settings were right.
--
-- So a post gets ONE list, attachments, and both portals render it the same
-- way. Each entry is either a file we host or a link somebody else hosts:
--
--     { "kind": "file", "name": "Frozen Parent Night.pdf",
--       "url": "https://…/storage/v1/object/public/fh-feed-attachments/feed/…",
--       "mime": "application/pdf", "sizeBytes": 2411000 }
--     { "kind": "link", "name": "Parent Night slides",
--       "url": "https://docs.google.com/presentation/d/…" }
--
-- camelCase keys, like the audience column beside it. image_urls,
-- video_embed_url and link_url are left exactly as they are: every post
-- written before today keeps rendering, and link_url stays the one-link
-- shortcut the hub composer already offers.
--
-- The bucket is PUBLIC-READ, and that is a decision, not an oversight. Every
-- other fh- bucket is private because it holds one family's paperwork or one
-- child's face. A feed attachment is the opposite kind of thing: it is
-- written for six hundred households at once, it is already readable by any
-- signed-in account (feed_read is "auth.uid() is not null"), and it has to
-- open from a push notification, an email, the staff portal and the parent
-- app without any of them minting a signed URL that dies in an hour. The
-- path carries a timestamp, so the address is not guessable, and nothing in
-- it names a child. Do not put anything in this bucket that you would not
-- put on the noticeboard in the lobby — the composer says so too.
--
-- Writing is staff only, judged by the same is_staffish() that judges the
-- post itself, so the staff portal can upload straight from the browser with
-- the signed-in person's token. The hub's server uploads through its
-- service role and is unaffected.
--
-- Safe to re-run.

set search_path = family_hub, extensions;

alter table feed_posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column feed_posts.attachments is
  'What the post carries besides words: [{kind: file|link, name, url, mime?, sizeBytes?}]. Files live in the public-read fh-feed-attachments bucket; links are wherever staff pasted from. Rendered identically by both portals.';

-- Malformed rows are refused at the door rather than discovered by a parent's
-- phone: an array, every element an object with a kind we know, a name and an
-- http(s) url. A function, because a check constraint may not hold a subquery.
create or replace function attachments_are_well_formed(a jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(a) = 'array'
     and coalesce((
       select bool_and(
         jsonb_typeof(e) = 'object'
         and e->>'kind' in ('file', 'link')
         and coalesce(e->>'name', '') <> ''
         and coalesce(e->>'url', '') ~* '^https?://'
       )
       from jsonb_array_elements(a) e
     ), true)
$$;

alter table feed_posts drop constraint if exists feed_posts_attachments_shape;
alter table feed_posts add constraint feed_posts_attachments_shape
  check (attachments_are_well_formed(attachments));

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0076: no storage schema here — skipping bucket setup (fine outside Supabase)';
    return;
  end if;

  -- Slideshows, PDFs, Office documents and pictures. No video: an unlisted
  -- YouTube link is the org's stated preference and a phone video would eat
  -- the limit in one file. 50 MB covers a photo-heavy exported deck.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'fh-feed-attachments', 'fh-feed-attachments', true, 52428800,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.apple.keynote',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
      'text/csv',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'
    ]
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists fh_feed_attachments_write on storage.objects$p$;
  execute $p$
    create policy fh_feed_attachments_write on storage.objects for insert to authenticated
    with check (bucket_id = 'fh-feed-attachments' and family_hub.is_staffish())
  $p$;

  execute $p$drop policy if exists fh_feed_attachments_update on storage.objects$p$;
  execute $p$
    create policy fh_feed_attachments_update on storage.objects for update to authenticated
    using (bucket_id = 'fh-feed-attachments' and family_hub.is_staffish())
  $p$;

  execute $p$drop policy if exists fh_feed_attachments_delete on storage.objects$p$;
  execute $p$
    create policy fh_feed_attachments_delete on storage.objects for delete to authenticated
    using (bucket_id = 'fh-feed-attachments' and family_hub.is_staffish())
  $p$;

  -- Reading goes through the public object URL, which needs no policy. This
  -- one exists so the staff portal's own client can list or re-sign what it
  -- uploaded if it ever needs to.
  execute $p$drop policy if exists fh_feed_attachments_read on storage.objects$p$;
  execute $p$
    create policy fh_feed_attachments_read on storage.objects for select to authenticated
    using (bucket_id = 'fh-feed-attachments' and family_hub.is_staffish())
  $p$;
end $$;

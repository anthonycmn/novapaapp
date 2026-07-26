-- ─────────────────────────────────────────────────────────────────────────
-- 0006_photos.sql — SmugMug galleries, face embeddings (pgvector), matches,
-- and the consent audit trail (#6).
--
-- This migration handles biometric data about children. Read PRIVACY.md
-- before changing anything here.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- Galleries and photos are metadata + links only. Images stay on SmugMug so
-- purchases keep flowing through their cart; we never re-host originals.
create table photo_galleries (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  title text not null,
  production_id uuid references productions (id) on delete set null,
  photo_count int not null default 0,
  url text not null,
  created_at timestamptz not null default now(),
  ingested_at timestamptz
);

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references photo_galleries (id) on delete cascade,
  external_id text not null unique,
  thumbnail_url text not null,
  url text not null,
  taken_at timestamptz,
  width int not null default 0,
  height int not null default 0
);

-- Parent-uploaded reference photos. Deleted on revocation.
create table reference_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  image_url text not null,
  uploaded_at timestamptz not null default now()
);

-- ── embeddings ───────────────────────────────────────────────────────────
-- 512-d ArcFace vectors. Exactly one of student_id (from a reference photo)
-- or photo_id (from a gallery photo) is set.
--
-- ON ENCRYPTION: these are stored as plaintext vectors, because similarity
-- search must operate on them — encrypting the column would make pgvector
-- useless. The protections are (a) Supabase's at-rest disk encryption,
-- (b) RLS that denies ALL client access so only the service role can read
-- them, and (c) the vectors are not invertible back to a viewable face.
-- PRIVACY.md states this honestly rather than claiming column-level crypto.
create table face_embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students (id) on delete cascade,
  photo_id uuid references gallery_photos (id) on delete cascade,
  embedding vector(512) not null,
  detection_confidence real not null,
  created_at timestamptz not null default now(),
  constraint embedding_source_exactly_one
    check (num_nonnulls(student_id, photo_id) = 1)
);

-- Approximate nearest-neighbour index for cosine distance.
create index face_embeddings_cosine_idx
  on face_embeddings using hnsw (embedding vector_cosine_ops);

create index face_embeddings_student_idx on face_embeddings (student_id)
  where student_id is not null;

create table photo_matches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  photo_id uuid not null references gallery_photos (id) on delete cascade,
  similarity real not null,
  state text not null default 'matched'
    check (state in ('matched','rejected','confirmed')),
  created_at timestamptz not null default now(),
  corrected_at timestamptz,
  unique (student_id, photo_id)
);

-- Audit trail. Revocation rows record HOW MUCH was deleted, so a parent can
-- be shown proof rather than a promise.
create table face_consent_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  action text not null check (action in ('granted','revoked')),
  actor_name text not null,
  created_at timestamptz not null default now(),
  embeddings_deleted int,
  matches_deleted int,
  reference_photos_deleted int
);

-- ─────────────────────────────────────────────────────────────────────────
-- Revocation. Deletes everything derived from a child's face and records
-- the counts. Runs as SECURITY DEFINER because face_embeddings denies all
-- client access; the guard below re-checks the caller's rights.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function revoke_face_consent(target_student uuid)
returns table (embeddings_deleted int, matches_deleted int, reference_photos_deleted int)
language plpgsql security definer set search_path = public as $$
declare
  emb_count int;
  match_count int;
  ref_count int;
  target_family uuid;
begin
  select family_id into target_family from students where id = target_student;
  if target_family is null then
    raise exception 'Student not found';
  end if;

  -- A parent of this child, or an admin acting on their request.
  if not (is_admin() or (auth_role() = 'parent' and auth_family_id() = target_family)) then
    raise exception 'Not permitted to revoke consent for this student';
  end if;

  delete from face_embeddings where student_id = target_student;
  get diagnostics emb_count = row_count;

  delete from photo_matches where student_id = target_student;
  get diagnostics match_count = row_count;

  delete from reference_photos where student_id = target_student;
  get diagnostics ref_count = row_count;

  update students
    set consent_face_matching = false, updated_at = now()
    where id = target_student;

  insert into face_consent_events
    (student_id, action, actor_name, embeddings_deleted, matches_deleted, reference_photos_deleted)
  values (
    target_student, 'revoked',
    coalesce((select display_name from profiles where id = auth.uid()), 'system'),
    emb_count, match_count, ref_count
  );

  return query select emb_count, match_count, ref_count;
end;
$$;

-- Safety net: if a student's consent flag is ever turned off by any other
-- path, the derived biometric data goes with it.
create or replace function purge_face_data_on_consent_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.consent_face_matching and not new.consent_face_matching then
    delete from face_embeddings where student_id = new.id;
    delete from photo_matches where student_id = new.id;
    delete from reference_photos where student_id = new.id;
  end if;
  return new;
end;
$$;

create trigger purge_face_data_trigger
  after update of consent_face_matching on students
  for each row execute function purge_face_data_on_consent_off();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table photo_galleries enable row level security;
alter table gallery_photos enable row level security;
alter table reference_photos enable row level security;
alter table face_embeddings enable row level security;
alter table photo_matches enable row level security;
alter table face_consent_events enable row level security;

-- Galleries and photos: any signed-in user may browse.
create policy galleries_read on photo_galleries
  for select using (auth.uid() is not null);
create policy galleries_write on photo_galleries for all using (is_staffish());
create policy gallery_photos_read on gallery_photos
  for select using (auth.uid() is not null);
create policy gallery_photos_write on gallery_photos for all using (is_staffish());

-- Reference photos: the family's own uploads. Staff have NO access —
-- these are photos of a child supplied for one narrow purpose.
create policy reference_photos_own on reference_photos
  for all using (
    exists (
      select 1 from students s
      where s.id = reference_photos.student_id and s.family_id = auth_family_id()
    )
    or is_admin()
  );

-- Embeddings: no client role may read or write them, ever. Only the
-- service role (background job) and the SECURITY DEFINER functions above
-- touch this table. Deliberately no permissive policy — RLS with zero
-- policies denies everything.
revoke all on face_embeddings from anon, authenticated;

-- Matches: the family, or an admin helping with a report. NOT staff at
-- large, and never another family.
create policy matches_read on photo_matches
  for select using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = photo_matches.student_id and s.family_id = auth_family_id()
    )
  );
create policy matches_correct on photo_matches
  for update using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = photo_matches.student_id and s.family_id = auth_family_id()
    )
  );

create policy consent_events_read on face_consent_events
  for select using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = face_consent_events.student_id and s.family_id = auth_family_id()
    )
  );

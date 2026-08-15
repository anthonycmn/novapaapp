# DECISIONS.md — NOVA PA / Broadway Bound App

Running log of decisions made autonomously during the build. Newest at the bottom of each section.

## Phase 0 — Foundation

- **2026-07-26 — Package manager: npm.** Node is installed on this machine; pnpm is not. npm ships with Node, keeps setup friction zero for future maintainers, and Next.js/Vercel support it first-class. Can migrate to pnpm later without code changes.
- **2026-07-26 — Registration portal repo URL was left as a placeholder** (`<<< PATH OR REPO URL >>>`). Per operating instructions, integration will be built against a `RegistrationProvider` interface with a mock adapter carrying realistic seed data. Logged in NEEDS-FROM-TONY.md.
- **2026-07-26 — Email provider: Resend.** Chosen over SendGrid: cleaner API and DX, first-class React Email template support (pairs with our Next.js stack), simple domain verification, generous free tier for an org this size (~3k emails/mo free), and webhooks for delivery/open tracking. Behind an `EmailProvider` interface in `lib/api/email/` so SendGrid can be swapped in if the org already has an account. Mock adapter ships until an API key is provided.
- **2026-07-26 — External URLs live in `config/org.ts`,** not components: main website, BookTix, SmugMug. The prompt flagged a possible misspelled domain ("virignia"); both `northernvirginiaperformingarts.org` and `broadwayboundnova.org` are recorded in NEEDS-FROM-TONY.md for Tony to confirm which is primary.

## Phase 4 — Registration integration

- **2026-07-26 — Sync target is the org's own registration portal; its API details are still to come.** Tony confirmed the custom system exists and will supply the schema. Until then the app runs on `MockRegistrationProvider` with realistic data, and the admin sync view states plainly that it is mock. Everything that changes when the real schema lands is confined to `src/lib/api/registration/custom.ts` (endpoint paths + `mapSnapshot()` field names).
- **2026-07-26 — Deep links point at the platforms the live site uses today.** Inspecting `Desktop/NOVAPA WEB 7-16` shows families are currently sent to Sawyer (classes/camps) and RegPack (coaching). Those URLs are recorded in `src/config/registration.ts` and used for the "Register" / "Pay balance" buttons, flagged in NEEDS-FROM-TONY #8b for confirmation. They are link destinations only — never a sync source.
- **2026-07-26 — Reconciliation is a pure function** (`registration/reconcile.ts`) that takes app state + an external snapshot and returns a plan of creates/updates plus issues. Keeping it free of I/O means the matching rules are unit-tested directly and behave identically for the mock and Supabase data layers.
- **2026-07-26 — Unmatched rows become visible issues, never guesses.** Account matching is link → guardian email; participant matching is name+DOB within the already-matched family, then name alone; offering matching is normalized title. Anything that fails to match is reported in the admin health view. A silently wrong match (a child attached to the wrong family) is far worse than a row an admin has to eyeball.
- **2026-07-26 — The webhook re-pulls rather than trusting its payload.** `POST /api/registration/webhook` authenticates a shared secret in constant time, then fetches a fresh snapshot. This gives one code path for manual and webhook syncs and means a spoofed payload cannot write data. It returns 200 on failure (with the failure recorded in-app) so a broken sender doesn't retry-storm.
- **2026-07-26 — Enrollment identity is (student, production|class), with the upstream id stored alongside.** That makes re-syncs idempotent — proven by a test that runs the same snapshot twice and asserts no duplicates.

## Phase 5 — Commerce & links

- **2026-07-26 — Stripe called over REST, no `stripe` npm package.** Checkout Sessions are one form-encoded POST; skipping the SDK keeps the mock path weightless and makes the real path a short, auditable fetch. Behind a `PaymentProvider` interface, so the mock completes the whole order flow until a key arrives (NEEDS #3).
- **2026-07-26 — The low-resolution guard is enforced server-side, not just in the UI.** The designer warns and requires a checkbox, but `addToCartAction` re-runs `assessPhotoQuality` and refuses a low-res design that lacks the acknowledgement. A client-side-only guard would be bypassed by a crafted POST, and the cost of a blurry button is a wasted blank plus a disappointed kid.
- **2026-07-26 — Print export is a true-inch CSS print sheet plus a CSV manifest, not server-rendered PNGs.** `ButtonPreview` renders the same markup on screen and at physical inches for printing, so what a family previews is what gets pressed, with zero image-processing dependencies. The manifest carries per-design quantity and a print-quality flag so the press operator can catch a soft photo before wasting a blank. Raster compositing (sharp → one PNG per button) is the upgrade path once real file storage exists — worth doing if the org moves to an outside print vendor.
- **2026-07-26 — Order items are snapshotted onto the order.** Editing a production's button template later must not retroactively change what someone already bought, so item rows carry their own photo, size, style, and price rather than pointing at live template data.
- **2026-07-26 — Stripe webhook verifies signatures manually** (HMAC-SHA256 over `{timestamp}.{body}`, constant-time compare, 5-minute freshness window) and reads the **raw** body before parsing, since parsing would change the bytes being verified. `markOrderPaid` is idempotent — a replayed event can't move the paid timestamp.
- **2026-07-26 — Photos are held as data URLs in mock mode (buttons).** Real deployments write to a private Supabase Storage bucket (`button-photos`, policy sketched at the end of migration 0005). Data URLs keep the demo self-contained but are not suitable for production volume — flagged for Phase 6, which needs real file storage anyway.

## Phase 6 — Photos & AI face matching

- **2026-07-26 — Face embedding: self-hosted InsightFace/ArcFace (ONNX), 512-d, stored in Postgres via pgvector.** Evaluated against the alternatives the brief listed:
  - *AWS Rekognition Collections* — accurate and managed, but it means uploading children's faces to a third-party identification service and trusting their deletion API. Per-face billing too.
  - *Azure Face* — identification/verification sits behind Microsoft's Limited Access approval programme. A youth theater nonprofit is unlikely to clear that quickly, if at all.
  - *face-api.js* — no external dependency, but noticeably weaker on children's faces and on stage lighting, which is exactly our workload.
  - *InsightFace (chosen)* — best open-source accuracy, runs on CPU for a background job, and critically: **the biometric data never leaves infrastructure the org controls.** When a parent revokes consent we can prove deletion because we hold the only copy. That argument outweighs the convenience of a managed service when the data subjects are minors.
  Behind a `FaceMatchProvider` interface; a deterministic mock ships so the whole flow is testable without the model (NEEDS #5).
- **2026-07-26 — Match threshold 0.62 cosine, detection-confidence floor 0.9.** Deliberately conservative. A false positive shows one family a photo of another family's child, which is a privacy incident; a false negative is a photo someone scrolls to find. The asymmetry justifies missing some matches.
- **2026-07-26 — Consent may only be granted by a parent of that specific child.** Not staff, not admin, not another guardian in a different family — enforced in the data layer and tested. Admins *can* revoke, because a parent phoning the office to demand deletion must not be blocked on their own login working.
- **2026-07-26 — Consent with no detectable face is refused and rolls back.** Storing reference photos of a child that can never be used is retention without purpose.
- **2026-07-26 — Rejected matches are kept as rows, not deleted.** A `rejected` row is how the matcher remembers never to re-assert that pairing. Deleting it would make the correction undone on the next run.
- **2026-07-26 — Seed data ships with face matching OFF for every student**, so the app's default state matches the privacy policy and the demo walks through real consent rather than starting mid-flow.
- **2026-07-26 — Matching runs only in a background job.** `/api/photos/ingest` (staff button or cron secret) and an in-process guard against concurrent runs. Page renders read stored matches and never await embedding work — a parent in a theater lobby must not wait on face processing.
- **2026-07-26 — Honest statement about encryption at rest.** pgvector similarity requires plaintext vectors, so the protection is access control (RLS with no permissive policies, privileges revoked from client roles) plus disk-level encryption, not column-level crypto. PRIVACY.md says exactly this rather than overclaiming.
- **2026-07-26 — SmugMug OAuth 1.0a signing is left unimplemented rather than guessed.** The adapter throws a clear error pointing at NEEDS #4. A subtly wrong signature implementation fails in confusing ways; better to fail loudly until real credentials exist.

## Phase 7 — Reviews & polish

- **2026-07-26 — Anonymity is enforced by the return type, not by a flag.** `getReviewsForStaff` returns `StaffReviewView`, which has no `reviewerUserId` or `familyId` field *at all* — not "null when anonymous". A staff-facing template therefore cannot leak identity even by mistake, and a test asserts the serialized payload contains neither the reviewer's name nor their family id. The SQL mirrors this with `staff_review_view`.
- **2026-07-26 — Admins can de-anonymize; that is deliberate and disclosed.** Anonymity protects the reviewer from the staff member being reviewed, not from the organization — otherwise a safeguarding concern could be raised with nobody able to follow it up. The consent copy on the form says so in plain words rather than implying total anonymity.
- **2026-07-26 — Submitted reviews are immutable to families.** Only admins may update a review row (to flag/resolve). An editable review would let someone rewrite history after a conversation, which undermines the trend data the feature exists to produce.
- **2026-07-26 — A co-taught class counts toward every attached staff member.** `aggregateByStaff` attributes a review to all staff on the subject. Splitting credit would need per-staff prompts, which is more burden than a parent should carry.
- **2026-07-26 — Fixed a latent ordering bug found by the test suite.** `getConsentHistory` and other "newest first" sorts compared ISO timestamps that could be generated inside the same millisecond, making the order ambiguous — it passed alone and failed under parallel load. The mock's clock is now monotonic (each call strictly later than the last), so audit ordering is deterministic. Postgres solves the same problem with a sequence. This was a real defect in an audit trail, not a flaky test.
- **2026-07-26 — Lighthouse was actually run, not asserted.** Headless Chrome, mobile emulation, production build; authenticated pages audited via a Puppeteer-seeded session cookie because Lighthouse's `extraHeaders` did not apply to the initial navigation (an early run scored authenticated pages against the 307 redirect body, which looked like a catastrophic a11y failure until it was traced). Numbers in PROGRESS.md.
- **2026-07-26 — `CardTitle` takes an `as` prop.** Cards default to `<h3>`, correct inside an `<h2>` section but a heading-order violation when cards are a page's top-level structure. Lighthouse caught this on `/login`.
- **2026-07-26 — Contrast is verified by computation, not by eye.** `tests/contrast.test.ts` parses the real tokens out of `globals.css` and computes WCAG relative luminance for every foreground/background pair in both themes. Changing a colour to something non-compliant fails the build.

## Auditions & casting — org policies (confirmed by Tony)

- **2026-07-27 — Named roles are strictly one student; ensemble groups hold many.** Tony confirmed: "If there are multiple people in an ensemble, that is okay, but I do not want any student to receive the same named role." Every non-ensemble Frozen Jr. role is seeded with capacity 1, and a policy test asserts no named role can ever be multi-capacity.
- **2026-07-27 — The parent's playbill correction is final. No staff approval step.** Direct consequence: the family must be able to revise their own answer (a typo they couldn't fix would go to print), so the confirmation form reopens via a "Change" button, the input warns that text goes to print exactly as typed, and a test proves corrections can be revised and cleared. Staff see the latest spelling on the responses page.
- **2026-07-27 — Never name a form field anything ending in "response".** Netlify's platform returns a bare 403 (empty body, before the request reaches the app) for any multipart POST containing a field whose name ends in `_response` — and React prefixes server-action form fields, turning `response` into `_1_response`. Diagnosed by capturing the exact browser POST with puppeteer and bisecting field names against the live endpoint: `_1_response`, `x_response`, `1_response` → 403; `response`, `_1_answer`, `myresponse` → pass. The confirmation form's field is now `decision`. Related: the same day, the Git-linked build auto-enabled Netlify Forms detection, whose handler also intercepted ALL multipart posts — forms processing is disabled at the site level and must stay off.

## Casting v2 (2026-07-31)
- **Understudies cover LEAD roles only**, cast after the main board is
  submitted (per Tony: duplicate the students' tags after all roles are
  filled). One understudy per lead, one lead per student, and a student
  can't cover a role they hold. Holes never block publishing — they're
  flagged instead.
- **Scene/song mapping**: Frozen Jr.'s MTI musical numbers are seeded as
  the "curriculum" with the roles called for each. When the admin's real
  script/curriculum upload arrives (Tony will provide registration data
  later), it replaces the seed — everything downstream reads ShowScene.
- **Role-driven calendar**: a rehearsal tagged with scenes appears only
  on the calendars of students whose published role (or covered lead) is
  called. Untagged events keep whole-production behavior. Before casting
  is published, tagged rehearsals stay visible to all enrolled students
  rather than hiding schedules.
- **Rehearsal notices** ride the existing hourly cron: 24h-before
  reminder and post-rehearsal thank-you, per family, deduped in
  store.eventNotices so re-runs never double-send.
- **Lost-update guard**: submitting the board while an assign action's
  refresh is still applying makes React discard the response (server
  still processes it). Submit/publish buttons now disable during any
  pending assign transition.

## Private lessons (2026-07-31)
- **Weekly recurring slots with the same teacher** (Tony's call) — a slot
  is teacher + weekday + time; booking attaches one student until the
  family cancels. No one-off booking, no packages.
- Slot holders are private: other families see "taken", never a name.
  The staff roster (/admin/lessons) is the only place names appear.
- Booked lessons materialize on the family calendar as the next four
  occurrences and get the 24h reminder through the existing hourly cron.
- Payment is "billed by the studio" until Stripe keys arrive; the flow
  is built so real checkout drops in without touching booking.

## Shared Supabase with the staff portal (2026-08-11, Tony: "GO")
- The family hub now lives in the SAME Supabase project as the staff
  portal (novapa-deh / assqaaplthcipyacolon) — one brain, two faces.
- Separation rule: the portal owns the `staff_portal` schema (81 tables,
  untouched); the family hub owns `public` (56 tables, 100+ RLS
  policies, applied as migrations family_hub_0001..0011). Verified after
  every step that no family-hub object landed in `staff_portal`.
- Supabase security advisor run post-apply: fixed families_parent_view
  to security_invoker (definer default would have bypassed RLS);
  lesson_slot_occupancy stays definer BY DESIGN (exposes slot_id+taken
  only). Remaining advisor errors are pre-existing staff_portal views —
  not ours to touch.
- Netlify env now carries NEXT_PUBLIC_SUPABASE_URL + anon key;
  DATA_BACKEND=mock keeps the live site on demo data until the
  SupabaseDataProvider adapter + real sign-in land. The flip to real
  data is a one-variable change.

## Supabase adapter COMPLETE (2026-08-11)
- Every DataProvider method (151) is ported to the shared novapa-deh
  database and live-verified — 149/149 integration checks in
  scripts/adapter-smoke.ts, covering identity, families, calendar,
  the full casting pipeline, lessons, messages, feed, store, health
  forms, pickups, documents, reviews, email, photos/face-matching
  (with revocation-count proof), registration sync, and FSA.
- The mock backend remains the live default until real sign-in lands
  and the cutover is rehearsed; NEXT_PUBLIC_DATA_MODE=supabase flips it.

## The cutover plot twist + repoint to live novapa (2026-08-15, Tony: "GO")
- 2026-08-11, the same day the family hub integrated with novapa-deh,
  the staff portal CUT OVER to a different Supabase project: **novapa**
  (tlkuqwsqicxcjdmumkje). novapa-deh is now a frozen rollback artifact
  that accepts writes silently. Verified directly: novapa carries the
  portal's 82 tables, 341 real auth users (325+ parents from website
  checkout), and NO trigger on auth.users (portal hard rule 2 — the
  signup-door saga concerned a function never attached on the live
  side; superseded by portal migration 0081).
- novapa's `public` schema is OWNED BY THE WEBSITE (47 registration/
  ticketing tables — families, campers, activities, orders, cast
  roster, tix_*, SmugMug photos, star-page ads). Name collisions with
  the family hub (`families`, `orders`, `order_items`) plus a portal
  storage-bucket collision (`resumes`) rule out replaying into public.
- Therefore the family hub moves into its own dedicated schema:
  **family_hub** (mirroring how the portal owns staff_portal), with
  storage buckets prefixed **fh-**. Consolidated replay migration:
  supabase/migrations-novapa/family_hub_replay_on_novapa.sql (all 18
  originals transformed: search_path pinned, SECURITY DEFINER helpers
  repointed off `public`, 0013 omitted as superseded). PostgREST
  exposed schemas must gain `family_hub` (currently public,
  graphql_public, staff_portal).
- The website's registration tables ARE the long-promised "registration
  data later" (NEEDS-FROM-TONY #8). New WebsiteDbRegistrationProvider
  reads them READ-ONLY through a public-schema client and feeds the
  existing sync engine; cast_roster_2026 renders on the admin casting
  board page. The family hub never writes to website or portal tables.
- Live-DB writes are classifier-gated in auto permission mode; the
  replay applies via MCP apply_migration with Tony's mode-switch +
  Allow (same sanctioned path as the 0013 episode).

## Netlify "secret" env vars never reach the function runtime (2026-08-15)
- Post-cutover, live login 500'd while local (same build) passed 12/12.
  A temporary token-gated diagnostic route proved it: NEXT_PUBLIC_* all
  correct at runtime, but SUPABASE_SERVICE_ROLE_KEY and SESSION_SECRET —
  both stored with Netlify's "secret" flag — were entirely ABSENT from
  process.env in deployed functions. This was latent since 8-11: mock
  mode never read them at runtime, so it only surfaced when supabase
  mode went live.
- Fix: recreated them as ordinary env vars (team-visible in Netlify UI,
  all scopes). CRON_SECRET had the same flaw and an unknowable value —
  rotated to a fresh value as a plain var; both the scheduled function
  and the API route read the same env so no code change was needed.
- Also discovered NEXT_PUBLIC_DATA_MODE=supabase had actually LANDED on
  8-12 (believed blocked) — the live site had been silently building in
  supabase mode against the frozen project. The cutover turned that
  from a landmine into the intended configuration.

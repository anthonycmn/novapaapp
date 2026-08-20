# NOVA PA — System Handoff

*Written 15 Aug 2026. This is the document for whoever touches this system
next — a future developer, a future AI session, or Tony at 11pm trying to
remember how something works. Everything here was true on the date above;
where something is likely to drift, the canonical source is named.*

---

## 1. What exists

Three products, one database, one login system.

| Product | URL | Who uses it | Repo | Deploys how |
|---|---|---|---|---|
| **Website + registration** | novapa.org | The public; families register & pay here (live Stripe) | `anthonycmn/novapawebsite` | Push to `main` auto-deploys. Working checkout may sit on `claude/site-sweep`; commit there, cherry-pick to `main` via a worktree. |
| **Staff portal** | staffportal.northernvirginiaperformingarts.org | The 7 staff | `anthonycmn/novapa-staff-portal` (Vite + React) | Push to `main` auto-deploys |
| **Parent portal** | portal.novapa.org | Families (once invited) | `anthonycmn/novapaapp` (Next.js 15) | **Does NOT auto-deploy.** See §4. |

Plus the **interactive curriculum dashboards** on the website
(novapa.org/deh, novapa.org/sweeney) — staff-facing show curricula with
props/set/purchase sheets, gate-code protected, powered by Netlify functions
in the website repo.

Naming rule (Tony, 15 Aug 2026): the family-facing product is **the parent
portal**, never "the app". `org.appName` in the hub repo's
`src/config/org.ts` is the single source of its display name.

## 2. The one database

Supabase project **`novapa`** (`tlkuqwsqicxcjdmumkje`). Three schemas, three
owners:

- **`public`** — the website's. Registration truth: `families`, `campers`,
  `orders`/`order_items`, `activities`, `cast_roster_2026`, ticketing
  (`tix_*`), DEH camp tables. **The portals only ever read it.**
- **`staff_portal`** — the staff portal's. Productions, staff, contracts,
  pay, rosters (via views over `public`), budgets, curriculum links.
- **`family_hub`** — the parent portal's. Families/students/enrollments
  (synced from `public`), casting, feed, messaging, health forms, photos,
  lessons, reviews, store, vault, notifications.

Rules that must never be broken:

- **`novapa-deh` is frozen.** The old rehearsal project accepts writes
  silently and serves no one. Never point anything at it.
- **No triggers on `auth.users`.** Ever. (It has broken sign-ups before.)
- **RLS stays on** for every table, even though the parent portal's server
  uses the service key. RLS is what makes the staff portal's direct
  PostgREST access safe.

Anon key (public, safe to write down):
`sb_publishable_8ar97CkK-C0YlWuOGtI_tA_mwTDVE6H`.
The service-role key lives ONLY in Netlify env vars for the hub and website
functions — never in the staff portal, by design.

## 3. How the products talk to each other

There is **no sync layer anywhere**. Everything is either a direct read of
another schema or a write to shared tables.

**Registration bridge (parent portal ← website).** The hub's
`WebsiteDbRegistrationProvider` reads `public` directly (service key,
read-only client). 769 accounts / 235 enrollments reconciled to within 8¢ of
the website. Sync runs finish `success` with 0 issues — coaching purchases
resolve against the portal's `v_coaching_catalog` (closed 15 Aug 2026,
NEEDS-FROM-TONY #8c).

**Schedule bridge (staff portal → parent portal).** An hourly Netlify
function (`schedule-sync` in the hub) copies portal rehearsal/class schedules
into `family_hub.calendar_events`. Title mapping lives in TWO places that
must be kept in step when a show is added:
- hub repo `src/lib/api/schedule-sync.ts` → `PORTAL_TITLE_MAP`
- portal repo `src/lib/hub.ts` → `HUB_TITLES` (the inverse)

**Budget bridge (staff portal → curriculum dashboards).** The website's
`sweeney-db.mjs` function (`budget_get` op) reads
`staff_portal.show_budget_lines` and overrides the dashboard's Cost view.
Enter budgets in the portal's Show Budgets; the curriculum updates on next
load. DEH is deliberately NOT wired (it was live in camp). New curricula
clone the Sweeney pattern with the show's portal title.

**Staff-portal ↔ parent-portal bridge (the big one).** The staff portal
talks to `family_hub` two ways:

1. *Direct PostgREST with the signed-in user's own token* —
   `hubFetch()` in portal `src/lib/hub.ts` adds
   `Accept-Profile`/`Content-Profile: family_hub`. Every read/write is judged
   by the hub's own RLS. All 7 staff have `family_hub.profiles` rows, so
   `is_staffish()` says yes. No service key in the portal, ever.
2. *SECURITY DEFINER RPCs* for anything that must notify families or be
   transactional (`family_hub.notifications` has no INSERT policy on
   purpose). The full set, all applied to novapa and recorded in
   `supabase/migrations/`:

   | Migration | Function | Does |
   |---|---|---|
   | 0022 | `portal_submit_casting`, `portal_publish_understudies` | Publish a cast list / understudies + per-family notifications |
   | 0024 | `portal_decide_pickup` | Approve/deny pickup + notify |
   | 0025 | `portal_release_feedback` | Release audition feedback to scored+cast students + notify |
   | 0026 | `portal_reply_thread` | Staff reply to family message + notify |
   | 0027 | `portal_mark_thread_read` | Mark a thread's family messages read |
   | 0028 | `portal_nudge_confirmations` | Remind unconfirmed playbill names (12h courtesy gap) |
   | 0031 | `portal_set_order_status` | Advance a button order + notify on ready/delivered |
   | 0032 | `portal_review_staff_profile` | Approve/reject staff bio edits + notify |

3. *Bearer + CORS server endpoints on the hub* for work that needs the hub's
   server (keys, CPU): `/api/photos/ingest` (SmugMug ingest + face match),
   `/api/email/send` (the Resend pipeline), `/api/documents/file` (mints
   10-minute signed URLs for the private vault bucket). Shared auth helper:
   hub `src/lib/auth/portal-bridge.ts` — verifies the portal user's Supabase
   token server-side. CORS origin: `STAFF_PORTAL_ORIGIN` env var (defaults
   to the portal's Netlify URL).

## 4. Deploying

- **Staff portal**: `git push origin main`. Netlify builds automatically.
  Before pushing: `npx tsc -b && npx vitest run && npx vite build` (205
  tests; the starIndex guard test fails if a route lacks a search entry).
- **Website**: `git push origin main` auto-deploys novapa.org.
- **Parent portal (hub): pushes do NOT deploy.** The Netlify site is not
  linked to GitHub for builds. Procedure:
  1. `npx next build` locally FIRST — Netlify lints during build;
     `tsc --noEmit` alone has passed while the deploy failed (a
     `prefer-const` lint error once burned two uploads).
  2. Ask the Netlify MCP for the `deploy-site` command (site id
     `463a022e-a57e-447f-8eee-2fc310c2fc36`) and run it from the repo root
     with `--no-wait`. The CLI may crash *after* "Deploy process has
     started…" — cosmetic; the build runs server-side.
  3. Verify by polling for a string only the new build serves, never a
     status code an old build could also return.
- **Netlify env gotcha**: variables flagged "secret" never reach function
  runtime. Use plain env vars and redeploy.
- **Deleted files haunt the next deploy.** Netlify reuses `/opt/build/repo`
  between upload deploys and extracts the new source *over* the old tree, so
  a file you delete here is never deleted there. On 16 Aug 2026 a deleted
  `more-menu.tsx` survived server-side and failed three deploys with
  `Property 'emoji' does not exist on type 'NavSection'` — naming a path that
  no longer existed in the repo, which is why every local build passed. If a
  build fails on a file you know you deleted, that is this: hit **"Clear
  cache and retry deploy"** in the Netlify UI, which wipes the build
  directory. (`npx tsc --noEmit` locally will not reproduce it either —
  `incremental` caches the check. `rm tsconfig.tsbuildinfo` first.)

## 5. Daily operations (the cookbook)

**Add a show.** Create the production in the staff portal AND in the hub
(`family_hub.productions` — one row per age band, e.g. "Charlie… (9-12)").
Add the title pair to both maps (§3). Add roles on the show dashboard's
casting board, scenes on the scene map.

**Cast a show.** My shows → the show → Casting. Drag names from the pool
onto roles (drag back to un-cast; click any name for their audition rubric).
When every registered child holds a role, **Submit & notify families**
(double-click). Understudies: drag from the bench onto lead roles, then
Publish understudies. Nudge button appears for unconfirmed playbill names.
Audition scoring lives under the board — same rubric as the parent portal,
verbatim. **Release feedback to families** pushes rubrics to families
(skips unscored children).

**Answer families.** Dashboard feed card (questions go amber), Family
messages (replies land in their portal instantly), Health & pick-up
(approve/deny with note).

**Email families.** Email families page. ALWAYS "Send myself a test" first.
Caveat until the sending domain is verified with Resend (NEEDS-FROM-TONY
#12): the default `onboarding@resend.dev` sender can only deliver to the
Resend account owner's own inbox — tests work, family sends will not, and
`EMAIL_FROM_ADDRESS` must be set to the verified domain when it exists.

**Photos.** Photos page → Run ingest & match → review each AI match
(✓/✗) → families see confirmed photos. Consent tab revokes (deletes the
child's face data immediately). Matching is MOCK until the face service
exists (NEEDS-FROM-TONY #5).

**Everything else**: Private lessons (slot inventory; families book in the
parent portal — no book-on-behalf, payment consent stays with the parent),
Family reviews (open a window = ask for feedback; anonymity warnings are
load-bearing), Button orders (status conveyor; ready/delivered notify),
Family vault (10-minute signed links; Chief-only delete), Bio approvals
(old/new side-by-side; reject requires an actionable reason).

## 6. Security model

- Staff-portal roles: `canWrite` = chief/admin/director; `canSeePay` and
  Who's-In are chief-only; `canSeeHealthSafety` gates children's medical
  data and safety threads; `canEmailFamilies` gates the email desk.
- Hub roles: the 7 staff are `staff`/`admin`/`super_admin` in
  `family_hub.profiles`. Hub `is_admin()` gates photo matches, reviews,
  lesson slots, vault deletes — a portal Director without a hub admin role
  simply gets empty lists, which is the hub's rule, not a bug.
- **Iron rules for new `family_hub` functions** (learned the hard way,
  migrations 0023/0029):
  1. Guard with `coalesce(is_staffish(), false)` — a bare
     `if not is_staffish()` NEVER fires without a JWT (null propagation).
  2. `revoke ... from anon` EXPLICITLY — Supabase default privileges grant
     EXECUTE to anon+PUBLIC on every new function, and they re-apply on
     every `create or replace`. Re-revoke after each replace.
  3. Prove it: bare-anon-key probe must return `42501`.
- Four data leaks were found and sealed on 15 Aug 2026 — anon-executable
  consent revocation (could delete a child's biometrics), unguarded
  health-form expiry listing, staff-readable callback notes, and
  staff-readable anonymous-reviewer identity. Pattern: a permissive
  base-table policy under an invoker view. If you add a "stripped" view,
  make it a **definer view with its own scoping** and drop the base policy.
- The helper predicates (`is_staffish`, `is_admin`, `auth_role`,
  `auth_family_id`, `staff_has_program`) keep anon EXECUTE **on purpose** —
  RLS evaluated under the anon role needs them, and they only read the
  caller's own JWT.

## 7. People

Seven staff accounts (shared Supabase auth, both portals):
Tony (anthonycmn@gmail.com), CJ, Jason, Todd — super_admin;
Katie, Zoe — admin; Ryyana — staff.
Real family data: 769 accounts synced from the website. **No family has
been invited yet** — see §9.

## 8. What's real and what's still mock

| Capability | State | Unlock |
|---|---|---|
| Registration & payments on the website | **Real** (live Stripe on novapa.org) | — |
| Email | Real pipeline; sandbox sender | Verify domain + `EMAIL_FROM_ADDRESS` (NFT #2/#12) |
| Face matching | Mock vectors | Self-hosted InsightFace service (NFT #5) |
| Spirit-button checkout in the parent portal | Mock payment | Stripe keys in hub env (NFT #3) |
| SmugMug ingestion | Reads `public.smugmug_photos` | SmugMug API OAuth (NFT #4) |
| FSA statements | Prints "not ready" warning | Only the EIN + signatory name remain (NFT #14) |
| Push notifications | Keys exist; in-app notifications are the live channel | — |

`NEEDS-FROM-TONY.md` (this repo) is the canonical unlock list.

## 9. Standing holds — do not cross without Tony's explicit word

1. **No family outreach.** No invites, no emails to families, nothing that
   reaches a real parent, until Tony says go. In-app notifications triggered
   by Tony's own clicks (publishing casting, approving a pickup) are fine —
   the click is the go.
2. **Nothing gets retired.** "Keep building — no retiring yet" (15 Aug).
   Both portals stay; the staff side of the parent portal is redundant now
   but harmless.
3. **Additive only** outside these three repos. Don't touch Tony's other
   apps or sites.

## 10. For the next developer

- Start here, then `DECISIONS.md` (why things are the way they are) and
  `NEEDS-FROM-TONY.md` (what's blocked on the org).
- Hub tests: `npm test` (vitest; the provider suite is the behavioral
  contract — the portal mirrors its semantics, so read it before changing
  casting/feedback/messaging rules). Portal tests: `npx vitest run`.
- Migrations: hub repo `supabase/migrations/` numbered `00NN_*.sql`.
  Files 0022+ note whether the applied migration on novapa is canonical.
  Apply via the Supabase MCP / SQL editor — there is no CLI pipeline.
- The parent portal's provider (`src/lib/api/supabase/provider.ts`) is the
  richest description of every feature's semantics. When in doubt about a
  rule ("can two students hold one role?"), it answers.
- Character conventions that are load-bearing: casting board jsonb uses
  camelCase keys (`roleId`/`studentId`); understudy assignments append
  `" (Understudy)"` to `character_name` and the hub parses it back out;
  `pending_changes` on staff profiles uses camelCase (`photoUrl`).

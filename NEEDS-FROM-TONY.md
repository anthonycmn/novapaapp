# NEEDS-FROM-TONY.md

Everything the build needs from you to go from mocks to live integrations. The app works end-to-end without these (mock adapters + seed data), but each item unlocks the real thing.

## Credentials & keys

| # | Item | Used for | Where to get it | Env var(s) |
|---|------|----------|-----------------|------------|
| 1 | Supabase project URL + anon key + service role key | Database, auth, storage, realtime | supabase.com → create project → Settings → API | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 2 | Resend API key | Transactional + bulk email (#1) | resend.com → API Keys; verify the org's sending domain | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` |
| 3 | Stripe secret + publishable keys (test then live) | Spirit buttons checkout (#11) | dashboard.stripe.com → Developers → API keys | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 4 | SmugMug API key + org account OAuth | Gallery ingestion for photo matching (#6) | api.smugmug.com → Apply for API key with the org account | `SMUGMUG_API_KEY`, `SMUGMUG_API_SECRET`, `SMUGMUG_OAUTH_TOKEN`, `SMUGMUG_OAUTH_SECRET` |
| 5 | Face-matching provider credentials | AI photo recognition (#6) | Decision + justification in DECISIONS.md when Phase 6 starts | TBD in Phase 6 |
| 6 | VAPID key pair | Web Push (#2) | Generated locally during Phase 2 (`npx web-push generate-vapid-keys`) — no signup needed, just keep the private key secret | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| 7 | Vercel account/team linked to the repo | Hosting + deploys | vercel.com → import the Git repo | (managed by Vercel) |

## Information & assets

| # | Item | Why |
|---|------|-----|
| 8 | **Registration portal API details** — base URL, auth scheme, and the shape of the accounts / participants / enrollments responses. You mentioned you'd send this. | Phase 4 is built and tested against a `RegistrationProvider` interface running on mock data. Plugging in the real system is a one-file change: endpoint paths and field names in `src/lib/api/registration/custom.ts`, then set `REGISTRATION_API_URL` + `REGISTRATION_API_KEY`. |
| 8b | **Which signup links families should see.** The live site currently sends families to Sawyer (`hisawyer.com/nova-performing-arts`, location 202081) for classes/camps and RegPack (group `100920141`) for coaching. | Those URLs are wired as the app's "Register" and "Pay balance" deep links (`src/config/registration.ts`). If the custom portal replaces either, give me its URLs and I'll swap them. |
| 9 | **Primary public domain confirmation** — `northernvirginiaperformingarts.org` vs `broadwayboundnova.org` | Both are in `config/org.ts`; confirm which is primary for links and email sender domain |
| 10 | Org logo files (SVG preferred) + any brand guide | Design system currently derives palette from the public website |
| 11 | Per-production spirit button template art | Store ships with a generic default frame |
| 12 | Email sending domain + DNS access | SPF/DKIM records for Resend domain verification |
| 13 | Which staff roles should count as `admin` vs `super_admin` | Role seeding for real accounts |

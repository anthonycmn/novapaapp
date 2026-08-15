# NEEDS-FROM-TONY.md

Everything the build needs from you to go from mocks to live integrations. The app works end-to-end without these (mock adapters + seed data), but each item unlocks the real thing.

## Credentials & keys

| # | Item | Used for | Where to get it | Env var(s) |
|---|------|----------|-----------------|------------|
| 1 | ~~Supabase project~~ **DONE** — the hub runs on **`novapa`** (`tlkuqwsqicxcjdmumkje`), in its own **`family_hub`** schema, alongside the website's `public` and the staff portal's `staff_portal`. *(Corrected 15 Aug 2026: this row used to name `novapa-deh`, which was retired at the 11 Aug cutover and now only accepts writes silently. Never point anything here.)* | Lets the app's server code read/write its own schema | already set | `SUPABASE_SERVICE_ROLE_KEY` |
| 2 | Resend API key | Transactional + bulk email (#1) | resend.com → API Keys; verify the org's sending domain | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` |
| 3 | Stripe secret + publishable keys (test then live) | Spirit buttons checkout (#11) | dashboard.stripe.com → Developers → API keys | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 4 | SmugMug API key + org account OAuth | Gallery ingestion for photo matching (#6) | api.smugmug.com → Apply for API key with the org account | `SMUGMUG_API_KEY`, `SMUGMUG_API_SECRET`, `SMUGMUG_OAUTH_TOKEN`, `SMUGMUG_OAUTH_SECRET` |
| 5 | **A host for the face-embedding service** (small container running InsightFace/ArcFace, CPU is fine) | AI photo recognition (#6) | Self-hosted deliberately — children's biometric data stays on org-controlled infrastructure (rationale in DECISIONS.md). It needs one endpoint: `POST {image_url} → {faces:[{embedding:number[512], confidence, box}]}`. Until it exists the app uses deterministic mock vectors and the admin page says so. | `FACE_SERVICE_URL`, `FACE_SERVICE_KEY`, `PHOTO_JOB_SECRET` |
| 6 | VAPID key pair | Web Push (#2) | Generated locally during Phase 2 (`npx web-push generate-vapid-keys`) — no signup needed, just keep the private key secret | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| 7 | ~~Hosting~~ **DONE** — Netlify site `novapa-family-hub` deploys automatically from GitHub `anthonycmn/novapaapp` | Hosting + deploys | — | (managed by Netlify) |

## Information & assets

| # | Item | Why |
|---|------|-----|
| 8 | ~~Registration portal API details~~ **NOT NEEDED — closed 15 Aug 2026.** Nothing is required from Jason for this. | Registration turned out to live in the **same database**, so the bridge is a direct read of `public` (families, campers, order_items, activities) via `WebsiteDbRegistrationProvider`, not an HTTP integration. No base URL, no auth scheme, no API for anyone to build. `custom.ts` and `REGISTRATION_API_URL`/`_API_KEY` remain only as a fallback for a future off-database system. **Proven live:** 769 accounts and 235 enrollments read, 234 matched, balances agreeing with the website to within 8¢. |
| 8b | **Which signup links families should see — still open, and now probably wrong.** The app still deep-links "Register" and "Pay balance" to Sawyer (`hisawyer.com/nova-performing-arts`, location 202081) and RegPack (group `100920141`). | But families are demonstrably buying through the website's own Stripe checkout — 235 enrollments and $53,306 outstanding came from `public.orders`, not from either of those. So these links likely send families to the wrong place. Confirm the live checkout URL and I'll swap them in `src/config/registration.ts`. |
| 8c | **Where a coaching package belongs in the hub.** One offering fails to map on every sync: *"10-Pack Acting Coaching Sessions"*. | It is the only reason sync runs finish `partial` instead of `success`. Coaching is neither a class nor a production, so the reconciler is right to refuse to guess. Either give coaching a home in the hub's catalog, or tell me to exclude coaching offerings from the sync — a one-line rule, after which runs go green and a genuine failure becomes visible again. |
| 9 | **Primary public domain confirmation** — `northernvirginiaperformingarts.org` vs `broadwayboundnova.org` | Both are in `config/org.ts`; confirm which is primary for links and email sender domain |
| 10 | Org logo files (SVG preferred) + any brand guide | Design system currently derives palette from the public website |
| 11 | Per-production spirit button template art | Store ships with a generic default frame |
| 12 | Email sending domain + DNS access | SPF/DKIM records for Resend domain verification |
| 13 | Which staff roles should count as `admin` vs `super_admin` | Role seeding for real accounts |
| 14 | **Org tax details for Dependent Care FSA statements**: EIN, legal name, street address, ZIP, phone, and who signs (name + title) | Families claiming childcare FSA reimbursement need the provider's taxpayer ID — an administrator will reject the claim without it. Fill in `org.tax` in `src/config/org.ts`. Until then the FSA page prints a visible "not ready to submit" warning rather than an official-looking form that would bounce. |

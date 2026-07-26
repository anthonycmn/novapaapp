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

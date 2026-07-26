# DECISIONS.md — NOVA PA / Broadway Bound App

Running log of decisions made autonomously during the build. Newest at the bottom of each section.

## Phase 0 — Foundation

- **2026-07-26 — Package manager: npm.** Node is installed on this machine; pnpm is not. npm ships with Node, keeps setup friction zero for future maintainers, and Next.js/Vercel support it first-class. Can migrate to pnpm later without code changes.
- **2026-07-26 — Registration portal repo URL was left as a placeholder** (`<<< PATH OR REPO URL >>>`). Per operating instructions, integration will be built against a `RegistrationProvider` interface with a mock adapter carrying realistic seed data. Logged in NEEDS-FROM-TONY.md.
- **2026-07-26 — Email provider: Resend.** Chosen over SendGrid: cleaner API and DX, first-class React Email template support (pairs with our Next.js stack), simple domain verification, generous free tier for an org this size (~3k emails/mo free), and webhooks for delivery/open tracking. Behind an `EmailProvider` interface in `lib/api/email/` so SendGrid can be swapped in if the org already has an account. Mock adapter ships until an API key is provided.
- **2026-07-26 — External URLs live in `config/org.ts`,** not components: main website, BookTix, SmugMug. The prompt flagged a possible misspelled domain ("virignia"); both `northernvirginiaperformingarts.org` and `broadwayboundnova.org` are recorded in NEEDS-FROM-TONY.md for Tony to confirm which is primary.

# Getting NOVA PA Family Hub online

Two services, both free to start: **Supabase** (database + login + file storage)
and **Vercel** (hosts the app). Budget about an hour for the first pass.

You can deploy in two stages, and stage 1 alone already fixes the speed problem:

| Stage | What you get | Needs |
|---|---|---|
| **1. Ship it on mock data** | A real URL, fast, installable on phones. Demo-able to your board or staff. Data resets on redeploy. | Vercel only (~15 min) |
| **2. Add the real database** | Real accounts, data that persists, families can actually use it. | Supabase + the migrations (~45 min) |

---

## Stage 1 — Put it online (Vercel)

### 1. Get the code into GitHub

The project is already a git repository with all the work committed. It just
needs somewhere to live.

```bash
# From the project folder
gh auth login              # if you've not used the GitHub CLI before
gh repo create novapa-family-hub --private --source=. --push
```

No GitHub CLI? Create an empty **private** repo at github.com/new, then:

```bash
git remote add origin https://github.com/<your-username>/novapa-family-hub.git
git push -u origin main
```

> Keep it **private**. It contains seeded example family data and, later, real
> configuration.

### 2. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Pick the `novapa-family-hub` repo. Vercel detects Next.js on its own —
   don't change the build settings.
3. Under **Environment Variables**, add just this one for now:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_DATA_MODE` | `mock` |

4. Click **Deploy**. About two minutes later you get a URL like
   `novapa-family-hub.vercel.app`.

That URL works on any phone and installs to the home screen. Every push to
`main` redeploys automatically.

---

## Stage 2 — Add the real database (Supabase)

### 1. Create the project

1. [supabase.com](https://supabase.com) → **New project**.
2. Name it `novapa-family-hub`. Choose region **East US (North Virginia)** —
   closest to your families, so the app feels quicker.
3. Set a database password and **save it in your password manager**. You
   cannot recover it later, only reset it.
4. Wait ~2 minutes for provisioning.

### 2. Run the database setup

Seven migration files in `supabase/migrations/` build every table, plus the
security rules that keep each family's data private.

**The easy way — copy/paste:**

Open **SQL Editor** in the Supabase dashboard and run the files **in numerical
order**, one at a time, waiting for each to succeed:

```
0001_foundation.sql     families, students, guardians, the privacy rules
0002_catalog.sql        seasons, classes, productions, casting
0003_schedule_forms.sql calendar, health forms, pick-up requests
0004_registration.sql   registration sync
0005_store.sql          spirit buttons store
0006_photos.sql         photo galleries and face matching
0007_reviews.sql        private feedback
```

Order matters — later files reference tables the earlier ones create.

**The repeatable way — CLI** (better if you'll do this more than once):

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # from Settings → General
supabase db push
```

### 3. Copy your keys

In Supabase: **Settings → API**. You need three values:

| Supabase calls it | Goes in |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ The **service_role** key bypasses every privacy rule in the app. It goes
> in Vercel's environment variables and nowhere else — never in the code,
> never in a message, never in the browser.

### 4. Point the app at it

In Vercel → your project → **Settings → Environment Variables**, add the three
keys above, then change:

```
NEXT_PUBLIC_DATA_MODE = supabase
```

Redeploy (**Deployments → ⋯ → Redeploy**).

### 5. Load the demo data (optional)

To start with the example families rather than an empty database:

```bash
npm run seed
```

Skip this if you're going straight to entering real families.

---

## What still runs on stand-ins

The app works fully without these — each shows an honest "mock" badge in
**Staff tools → System status** until you connect it. Add them whenever
you're ready; none block launch.

| Feature | Needs | Where to get it |
|---|---|---|
| Sending real email | `RESEND_API_KEY` | [resend.com](https://resend.com) — verify your domain first |
| Taking real payments | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | [dashboard.stripe.com](https://dashboard.stripe.com) — use **test** keys first |
| Pulling photo galleries | 4 × `SMUGMUG_*` | [api.smugmug.com](https://api.smugmug.com) |
| Face matching | `FACE_SERVICE_URL`, `FACE_SERVICE_KEY` | Needs a small server you host — see NEEDS-FROM-TONY.md #5 |
| Registration sync | `REGISTRATION_API_URL`, `REGISTRATION_API_KEY` | Your own registration system |
| Push notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generate free: `npx web-push generate-vapid-keys` |

---

## Before real families use it

Things that matter once actual children's data is in the system:

- [ ] **Verify the privacy rules actually work.** Sign in as two different
      families and confirm neither can see the other's children. The automated
      tests cover this logic, but the database rules themselves have never run
      against a live Postgres.
- [ ] **Turn off the demo sign-in.** Right now anyone can click a demo account
      and get in. Real deployment needs Supabase magic-link login enabled and
      the demo buttons removed from the login page.
- [ ] **Custom domain** — Vercel → Settings → Domains (e.g.
      `app.northernvirginiaperformingarts.org`).
- [ ] **Back-ups** — Supabase's free tier keeps 7 days. Paid keeps more.
      Worth it once you hold real health forms.
- [ ] Read `PRIVACY.md` and confirm the retention policy matches what you
      actually want to promise families.

---

## If something breaks

- **Vercel build fails** — open the deployment, read the log. It's almost
  always a missing environment variable.
- **App loads but shows no data** — `NEXT_PUBLIC_DATA_MODE` is probably still
  `mock`, or a Supabase key is wrong. Check **Staff tools → System status**.
- **"relation does not exist"** — a migration didn't run, or ran out of order.
  Re-run them in numerical order.
- **Local is slow again** — you're in dev mode. Use `npm run build && npm start`
  for a fast local copy; `npm run dev` recompiles pages as you open them.

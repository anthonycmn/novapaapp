# NOVA PA Family Hub

Mobile-first PWA for **Northern Virginia Performing Arts / Broadway Bound**
families: profiles, schedules, forms, photos, purchases, and communication
in one place.

## Quick start (no credentials needed)

```bash
npm install
node scripts/generate-icons.mjs   # placeholder PWA icons
npm run dev
```

Open http://localhost:3000 — the app runs in **mock data mode** with
realistic seeded families, students, staff, and productions. Sign in with
any demo account listed on the login page (e.g. `sofia@example.com`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | typecheck + lint + tests + build (CI runs the same) |
| `npm run test` | Vitest (includes RLS-mirror access-control tests) |
| `npm run seed` | Seed a real Supabase project (needs env keys) |

## Going live

1. Fill in `.env` from `.env.example` — see `NEEDS-FROM-TONY.md` for where
   every key comes from.
2. Create the Supabase project, run `supabase db push`, then `npm run seed`.
3. Set `NEXT_PUBLIC_DATA_MODE=supabase`.
4. Import the repo into Vercel; set the same env vars.

## Documentation

- `ARCHITECTURE.md` — stack, layering rules, data flow
- `DECISIONS.md` — running log of build decisions
- `PRIVACY.md` — minors, consent, retention policy
- `NEEDS-FROM-TONY.md` — outstanding credentials/assets
- `PROGRESS.md` — per-phase build notes

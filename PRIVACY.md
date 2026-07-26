# PRIVACY.md — NOVA PA Family Hub

Data handling and retention policy for the NOVA PA / Broadway Bound family
app. Written for staff and parents; the technical enforcement lives in
Supabase Row Level Security policies (`supabase/migrations/`) and is
mirrored by the application data layer.

## Principles

1. **Minors first.** Most students are under 18; many are under 13. The app
   is designed so that a child's data is only ever visible to their own
   family and to NOVA PA staff with a legitimate need.
2. **Opt-in, revocable consent.** Photo use, facial recognition, and
   directory visibility are separate, per-student, parent-controlled flags.
   Defaults are OFF.
3. **No public child data.** No combination of a student's full name,
   photo, and schedule is ever accessible without authentication.

## Accounts and children under 13 (COPPA-style handling)

- Children under 13 **cannot have login credentials**. Their information is
  managed entirely through the parent/guardian account.
- Students 13+ may have a parent-enabled sub-profile login. The parent can
  disable it at any time.
- We collect from students only what the program needs: name, DOB, grade,
  school, sizes, health/safety information, and performance materials
  (headshot, resume, audition links) — all entered by the parent.

## Facial recognition (photo matching)

- **Opt-in only**, per student, by a parent/guardian of that child, after a
  plain-English explanation screen. Staff and admins cannot grant consent on
  a family's behalf. The default for every student is OFF.
- Consent requires 2–4 reference photos. If no face can be detected in them,
  consent is refused and the uploaded photos are discarded — we don't retain
  photos of a child that serve no purpose.
- We store **face embeddings only** — 512-number vectors derived from a
  face. We never retain a cropped face image from a gallery photo, and
  gallery images themselves stay on SmugMug (we store links, not copies).
- Revoking consent deletes the embeddings, the reference photos, and all
  matches **immediately** — well inside the 24-hour commitment. The parent
  is shown the counts of what was deleted. A database trigger provides a
  second line of defence if the consent flag is cleared by any other path.
- Match results are visible to the student's own family and to admins.
  Teaching staff do not browse them.
- Matching accuracy is imperfect, especially with stage makeup and theater
  lighting. The threshold is set conservatively (a false positive would show
  one family another family's child), and every match has a "not my child"
  correction that is never re-asserted on later runs.

### On "encrypted at rest" — a precise statement

Embeddings are stored as plaintext vectors in Postgres, because similarity
search has to operate on them; encrypting the column would make the feature
impossible. The actual protections are:

1. **No client role can read the table.** `face_embeddings` has row-level
   security enabled with *no* permissive policies and privileges revoked
   from `anon` and `authenticated`, so only the service role (the background
   job) and audited `SECURITY DEFINER` functions can touch it.
2. **Supabase encrypts the underlying storage at rest** (disk-level).
3. **The vectors are not invertible** into a viewable photograph.

We state it this way rather than claiming column-level encryption we don't
have. If the org later requires cryptographic protection of the vectors
themselves, that means moving similarity search into a trusted enclave or
accepting exact-match-only encrypted search — a significant redesign.

## Who can see what

| Data | Own family | Other families | Staff | Admin |
|---|---|---|---|---|
| Student profile basics | ✅ | ❌ | ✅ (their programs) | ✅ |
| Allergies / medical flags | ✅ | ❌ | ✅ (safety roster) | ✅ |
| Parent/student "hopes" | ✅ (per visibility rules) | ❌ never | ✅ | ✅ |
| Family staff-notes | ❌ | ❌ | ✅ | ✅ |
| Photos matched to a child | ✅ | ❌ | ❌ | ✅ |
| Reviews of classes/staff | own submissions | ❌ | aggregate + own feedback | ✅ incl. identity |
| Directory entry (name + program) | — | ✅ only if opted in | ✅ | ✅ |

## Retention

| Data | Retained | Then |
|---|---|---|
| Family & student profiles | While enrolled + 2 seasons | Anonymized (name → initials, contact deleted) |
| Health forms | Season of validity + 1 year | Deleted |
| Face embeddings | While consent active | Deleted within 24h of revocation |
| Photos (references uploaded by parents) | While consent active | Deleted with revocation |
| Email/notification logs | 18 months | Deleted |
| Payment records (Stripe) | Per Stripe/IRS requirements (7 years) | Stripe-side only; app stores order metadata |
| Reviews | 3 years | Anonymized |

## Virginia student data expectations

The app is operated by NOVA PA (not a school division), but we follow the
spirit of Virginia's student data privacy law (Code of Virginia § 22.1-289.01):
no sale of student data, no targeted advertising, no profiles for
non-educational purposes, and deletion on request by a parent.

## Data subject requests

Parents may request export or deletion of their family's data by emailing
the org (see config). Admins fulfill these via the admin dashboard;
deletion honors the retention table above.

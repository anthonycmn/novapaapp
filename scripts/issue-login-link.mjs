/**
 * Issue a one-time sign-in link for a parent who cannot get in any other way.
 *
 *   node scripts/issue-login-link.mjs kelly@mikloud.com [--days 7] [--by cj@novapa.org] [--note "why"]
 *
 * Prints the URL. Sends nothing — the link goes into whatever email the office
 * writes. Reads .env.local for the service key (the same file next dev reads).
 *
 * The row is the same shape lib/auth/login-links writes, and the token is made
 * the same way (32 random bytes, base64url; only the SHA-256 is stored), so a
 * link from here and a link from the app are indistinguishable to /welcome.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const days = Number(opt("days", "7"));
const issuedBy = opt("by", "office");
const note = opt("note", null);
const portal = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.novapa.org";

if (!email) {
  console.error("Usage: node scripts/issue-login-link.mjs <email> [--days 7] [--by who] [--note why]");
  process.exit(1);
}

const hub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});

// The guardian row knows the auth user once they have signed in or been
// backfilled; otherwise walk the admin user list, which is the only lookup
// Supabase offers by email.
async function findUserId() {
  const { data: guardian } = await hub
    .from("guardians")
    .select("user_id")
    .ilike("email", email)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (guardian?.user_id) return guardian.user_id;
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await hub.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

const userId = await findUserId();
if (!userId) {
  console.error(`No portal account exists for ${email}. Create one first (admin createUser, email_confirm: true).`);
  process.exit(2);
}

const token = randomBytes(32).toString("base64url");
const expiresAt = new Date(Date.now() + days * 86_400_000);
const { error } = await hub.from("login_links").insert({
  user_id: userId,
  email,
  token_sha256: createHash("sha256").update(token).digest("hex"),
  issued_by: issuedBy,
  note,
  expires_at: expiresAt.toISOString(),
});
if (error) {
  console.error(`Could not issue the link: ${error.message}`);
  process.exit(3);
}

console.log(`${portal}/welcome/${token}`);
console.log(`for ${email} (user ${userId}), expires ${expiresAt.toISOString()}`);

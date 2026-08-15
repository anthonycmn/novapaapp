/**
 * Run a registration sync from the website source as the admin user and
 * summarize the outcome (counts + distinct issue kinds/offerings).
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/run-website-sync.ts
 */
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
import { getProvider } from "../src/lib/api";
import { WebsiteDbRegistrationProvider } from "../src/lib/api/registration/website";

async function main() {
  const provider = getProvider();
  const adminEmail = process.argv[2] ?? "cj@novapa.org";
  const admin = await provider.getUserByEmail(adminEmail);
  if (!admin) throw new Error(`admin user ${adminEmail} not found`);

  const snapshot = await new WebsiteDbRegistrationProvider().fetchSnapshot();
  const run = await provider.syncRegistration(admin.id, snapshot, "manual");
  console.log("status:", run.status);
  console.log("counts:", JSON.stringify(run.counts));
  console.log("issues:", run.issues.length);

  const byKind = new Map<string, number>();
  const offerings = new Map<string, number>();
  for (const issue of run.issues) {
    byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
    if (issue.kind === "unknown_offering") {
      const m = /"([^"]+)"/.exec(issue.message);
      if (m) offerings.set(m[1], (offerings.get(m[1]) ?? 0) + 1);
    }
  }
  console.log("issues by kind:", JSON.stringify([...byKind.entries()]));
  console.log("unknown offerings:", JSON.stringify([...offerings.entries()]));
}

main().catch((e) => {
  console.error("SYNC FAILED:", e.message ?? e);
  process.exit(1);
});

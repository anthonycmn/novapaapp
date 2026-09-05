import { decodeUnsubscribeToken } from "@/lib/api/email/tracking";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { setEmailOptOut } from "@/lib/email/opt-outs";
import { org } from "@/config/org";
import { revalidatePath } from "next/cache";

export const metadata = { title: "Unsubscribe" };

/**
 * One click, off the list — the route every newsletter footer now points at.
 *
 * No sign-in: the signed token in the link IS the authority, exactly like
 * the calendar feed. It names the recipient and the category; the write is
 * family-wide (a household that says "no newsletters" means it on every
 * address) and idempotent, so mail scanners that prefetch the link do no
 * more harm than honoring the request early. Safety and schedule email is
 * not opt-outable and says so.
 */

const CATEGORY_LABEL: Record<string, string> = {
  newsletter: "newsletters",
  fundraising: "fundraising emails",
};

async function familyIdForRecipient(recipientId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getServiceClient()
    .from("profiles")
    .select("family_id")
    .eq("id", recipientId)
    .maybeSingle();
  const familyId = (data as { family_id?: string } | null)?.family_id;
  return familyId ? String(familyId) : null;
}

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ref = decodeUnsubscribeToken(token);
  const familyId = ref ? await familyIdForRecipient(ref.recipientId) : null;

  const ok = Boolean(ref && familyId && (await setEmailOptOut(familyId!, ref!.category, true)));
  const label = ref ? (CATEGORY_LABEL[ref.category] ?? ref.category) : "";

  async function resubscribe() {
    "use server";
    const again = decodeUnsubscribeToken(token);
    if (!again) return;
    const fid = await familyIdForRecipient(again.recipientId);
    if (fid) await setEmailOptOut(fid, again.category, false);
    revalidatePath(`/unsubscribe/${token}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/novapa-logo.png" alt="" aria-hidden width={72} height={72} />
      {ok ? (
        <>
          <h1 className="text-2xl font-semibold">You&apos;re unsubscribed</h1>
          <p className="max-w-sm text-muted-foreground">
            Your family won&apos;t receive {label} from us anymore. Anything
            about your child&apos;s safety or schedule still comes through —
            that part isn&apos;t optional, and we keep it rare.
          </p>
          <form action={resubscribe}>
            <button
              type="submit"
              className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
            >
              Changed your mind? Resubscribe
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
          <p className="max-w-sm text-muted-foreground">
            It may be from an old email. Reply to any message from us, or write
            to {org.supportEmail}, and we&apos;ll take you off the list by hand.
          </p>
        </>
      )}
      <p className="text-sm text-muted-foreground">{org.appName}</p>
    </main>
  );
}

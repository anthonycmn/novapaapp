import { redirect } from "next/navigation";
import { decodeUnsubscribeToken } from "@/lib/api/email/tracking";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { setEmailOptOut } from "@/lib/email/opt-outs";
import { org } from "@/config/org";

export const metadata = { title: "Unsubscribe" };

/**
 * One click, off the list — the route every newsletter footer now points at.
 *
 * No sign-in: the signed token in the link IS the authority, exactly like
 * the calendar feed. It names the recipient and the category; the write is
 * family-wide (a household that says "no newsletters" means it on every
 * address).
 *
 * The write happens in the BUTTON's server action, never during GET render.
 * Corporate mail scanners (Outlook SafeLinks and friends) fetch every link
 * in a delivered email, so a render-time write would have unsubscribed
 * scanned households en masse the day the first newsletter went out — and
 * the old page's own resubscribe action revalidated this route, whose
 * render then opted the family straight back out (Sep 6 2026 review).
 * Scanners GET; people press the button.
 */

const CATEGORY_LABEL: Record<string, string> = {
  newsletter: "newsletters",
  fundraising: "fundraising emails",
};

/**
 * Who the link was sent to: a parent (a profile — the opt-out is the
 * family's) or a student copied on a staff email (hub 0095 — the opt-out is
 * that one address, never the parents').
 */
type Recipient = { kind: "family"; familyId: string } | { kind: "student"; studentId: string };

async function recipientFor(recipientId: string): Promise<Recipient | null> {
  if (!isSupabaseConfigured()) return null;
  const db = getServiceClient();
  const { data } = await db
    .from("profiles")
    .select("family_id")
    .eq("id", recipientId)
    .maybeSingle();
  const familyId = (data as { family_id?: string } | null)?.family_id;
  if (familyId) return { kind: "family", familyId: String(familyId) };
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("id", recipientId)
    .not("email", "is", null)
    .maybeSingle();
  return student ? { kind: "student", studentId: recipientId } : null;
}

async function setOptOut(recipient: Recipient, category: string, optedOut: boolean) {
  if (recipient.kind === "family") {
    await setEmailOptOut(recipient.familyId, category, optedOut);
    return;
  }
  await getServiceClient()
    .from("students")
    .update({ email_opted_out: optedOut })
    .eq("id", recipient.studentId);
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { token } = await params;
  const { state } = await searchParams;
  const ref = decodeUnsubscribeToken(token);
  const recipient = ref ? await recipientFor(ref.recipientId) : null;
  const valid = Boolean(ref && recipient);
  const isStudent = recipient?.kind === "student";
  // A student's switch is one switch for both categories.
  const label = isStudent
    ? "newsletters and fundraising emails"
    : ref
      ? (CATEGORY_LABEL[ref.category] ?? ref.category)
      : "";
  const who = isStudent ? "You" : "Your family";

  async function unsubscribe() {
    "use server";
    const again = decodeUnsubscribeToken(token);
    if (!again) return;
    const r = await recipientFor(again.recipientId);
    if (r) await setOptOut(r, again.category, true);
    redirect(`/unsubscribe/${token}?state=done`);
  }

  async function resubscribe() {
    "use server";
    const again = decodeUnsubscribeToken(token);
    if (!again) return;
    const r = await recipientFor(again.recipientId);
    if (r) await setOptOut(r, again.category, false);
    redirect(`/unsubscribe/${token}?state=back`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/novapa-logo.png" alt="" aria-hidden width={72} height={72} />
      {!valid ? (
        <>
          <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
          <p className="max-w-sm text-muted-foreground">
            It may be from an old email. Reply to any message from us, or write
            to {org.supportEmail}, and we&apos;ll take you off the list by hand.
          </p>
        </>
      ) : state === "done" ? (
        <>
          <h1 className="text-2xl font-semibold">You&apos;re unsubscribed</h1>
          <p className="max-w-sm text-muted-foreground">
            {who} won&apos;t receive {label} from us anymore. Anything
            about your child&apos;s safety or schedule still comes through -
            that part isn&apos;t optional, and we keep it rare.
          </p>
          <form action={resubscribe}>
            <button
              type="submit"
              className="min-h-11 text-sm font-medium underline underline-offset-4 hover:text-foreground"
            >
              Changed your mind? Resubscribe
            </button>
          </form>
        </>
      ) : state === "back" ? (
        <>
          <h1 className="text-2xl font-semibold">You&apos;re back on the list</h1>
          <p className="max-w-sm text-muted-foreground">
            {who} will receive {label} from us again. Good to have you.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Unsubscribe from {label}?</h1>
          <p className="max-w-sm text-muted-foreground">
            {isStudent
              ? <>This stops {label} to this address. Your parents still get them.</>
              : <>This stops {label} for your whole family.</>} Anything about your
            child&apos;s safety or schedule still comes through - that part
            isn&apos;t optional, and we keep it rare.
          </p>
          <form action={unsubscribe}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Yes, unsubscribe
            </button>
          </form>
        </>
      )}
      <p className="text-sm text-muted-foreground">{org.appName}</p>
    </main>
  );
}

import "server-only";
import webpush from "web-push";
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";

/**
 * The push outbox drain (hub 0068).
 *
 * Everything the app tells a family already lands in family_hub.notifications
 * — replies, schedule changes, feed posts, casting, photos, forms. Push is
 * not a second announcement system; it is those same rows reaching a phone.
 * The drain reads rows with push_sent_at null, honours the same per-type
 * preferences and quiet hours the notification center uses, rings every
 * device the account subscribed, and stamps the row.
 *
 * Called two ways, both landing here:
 *   - every 5 minutes by netlify/functions/push-queue.mjs via
 *     /api/jobs/push-queue (the safety net that also releases quiet-hours
 *     holds in the morning);
 *   - inline by the server actions parents are actively waiting on
 *     (messages, feed) via kickPushQueue(), so a reply rings in seconds,
 *     not at the next cron tick.
 *
 * Delivery is at-most-once: rows are CLAIMED (stamped) before sending, so
 * two overlapping drains cannot ring the same phone twice. A send that then
 * fails is a lost push, not a repeated one — the notification center still
 * has the row, which is the durable copy.
 */

/** How far back the drain will ever look. Anything older ships silently. */
const LOOKBACK_HOURS = 48;
/** Per-run cap; the next tick takes the rest. */
const BATCH = 200;

type PendingRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
};

type PrefsRow = {
  user_id: string;
  enabled: Record<string, boolean> | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh?: string; auth?: string } | null;
};

export type DrainResult = {
  skipped?: string;
  claimed: number;
  sent: number;
  deferred: number;
  prunedSubscriptions: number;
};

let vapidConfigured = false;

function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(org.portalUrl, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

/**
 * True while the org clock sits inside this account's quiet hours.
 * Times are stored as local wall-clock ("21:00"); the window may wrap
 * midnight. An empty or degenerate window (start == end) never holds.
 */
function inQuietHours(prefs: PrefsRow | undefined, nowHHMM: string): boolean {
  const start = prefs?.quiet_hours_start?.slice(0, 5);
  const end = prefs?.quiet_hours_end?.slice(0, 5);
  if (!start || !end || start === end) return false;
  return start < end
    ? nowHHMM >= start && nowHHMM < end
    : nowHHMM >= start || nowHHMM < end;
}

export async function drainPushQueue(): Promise<DrainResult> {
  const none: DrainResult = { claimed: 0, sent: 0, deferred: 0, prunedSubscriptions: 0 };
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase" || !isSupabaseConfigured()) {
    return { ...none, skipped: "not in supabase mode" };
  }
  if (!configureWebPush()) {
    return { ...none, skipped: "VAPID keys unset" };
  }

  const db = getServiceClient();
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

  const { data: pending, error } = await db
    .from("notifications")
    .select("id, user_id, type, title, body, url")
    .is("push_sent_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`push queue read failed: ${error.message}`);
  if (!pending?.length) return none;

  const rows = pending as PendingRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [{ data: prefRows }, { data: subRows }] = await Promise.all([
    db.from("notification_prefs").select("user_id, enabled, quiet_hours_start, quiet_hours_end").in("user_id", userIds),
    db.from("push_subscriptions").select("id, user_id, endpoint, keys").in("user_id", userIds),
  ]);

  const prefsByUser = new Map((prefRows as PrefsRow[] | null)?.map((p) => [p.user_id, p]) ?? []);
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of (subRows as SubscriptionRow[] | null) ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  const nowHHMM = formatInTimeZone(new Date(), org.timeZone, "HH:mm");

  /* Sort each pending row into: deferred (quiet hours — leave unstamped for
     the morning run), or claimable. A claimable row with a disabled type or
     no subscribed device is stamped without ringing anything: it was
     handled, and must not be re-examined every 5 minutes forever. */
  const deferredIds: string[] = [];
  const claimable: PendingRow[] = [];
  for (const row of rows) {
    const prefs = prefsByUser.get(row.user_id);
    const wantsPush =
      prefs?.enabled?.[row.type] !== false && (subsByUser.get(row.user_id)?.length ?? 0) > 0;
    if (wantsPush && inQuietHours(prefs, nowHHMM)) {
      deferredIds.push(row.id);
      continue;
    }
    claimable.push(row);
  }
  if (!claimable.length) return { ...none, deferred: deferredIds.length };

  /* Claim before sending: only rows still unstamped come back, so an
     overlapping drain (cron tick meeting an inline kick) splits the batch
     instead of doubling it. */
  const { data: claimedRows, error: claimError } = await db
    .from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .in("id", claimable.map((r) => r.id))
    .is("push_sent_at", null)
    .select("id");
  if (claimError) throw new Error(`push queue claim failed: ${claimError.message}`);
  const claimedIds = new Set((claimedRows ?? []).map((r: { id: string }) => r.id));

  let sent = 0;
  const deadSubIds = new Set<string>();
  for (const row of claimable) {
    if (!claimedIds.has(row.id)) continue;
    const prefs = prefsByUser.get(row.user_id);
    if (prefs?.enabled?.[row.type] === false) continue;
    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url ?? "/notifications",
    });
    for (const sub of subsByUser.get(row.user_id) ?? []) {
      if (deadSubIds.has(sub.id)) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys?.p256dh ?? "", auth: sub.keys?.auth ?? "" },
          },
          payload,
          { TTL: 24 * 3600 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        /* 404/410: the browser revoked this subscription. Forget it. */
        if (status === 404 || status === 410) {
          deadSubIds.add(sub.id);
        } else {
          console.error(`push send failed (${status ?? "?"}) for sub ${sub.id}`);
        }
      }
    }
  }

  if (deadSubIds.size) {
    await db.from("push_subscriptions").delete().in("id", [...deadSubIds]);
  }

  return {
    claimed: claimedIds.size,
    sent,
    deferred: deferredIds.length,
    prunedSubscriptions: deadSubIds.size,
  };
}

/**
 * Fire the drain from a server action whose author is waiting on the other
 * end — a staff reply, a feed post. Failures are swallowed: the action
 * already succeeded, the row is in the center, and the 5-minute cron will
 * retry anything unstamped. Same bargain logActivity keeps.
 */
export async function kickPushQueue(): Promise<void> {
  try {
    await drainPushQueue();
  } catch (err) {
    console.error("push queue kick failed", err);
  }
}

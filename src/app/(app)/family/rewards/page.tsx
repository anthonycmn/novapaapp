import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getEncore } from "@/lib/encore";
import { TIER_LABEL, describeEntry, formatDollars, formatPoints } from "@/lib/encore/rules";
import type { Redemption, RedemptionItem } from "@/lib/encore/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
import { RewardMenu } from "@/components/encore/reward-menu";
import { CopyCode } from "@/components/encore/copy-code";

export const metadata = { title: "Encore Points" };

/**
 * Encore Points (hub 0098): the balance, the tier, the menu, the rewards a
 * family already has and every point in and out. Not reachable until CJ
 * launches the program in the staff portal (or puts this family on the
 * preview list); before that the page sends a parent home.
 */
export default async function RewardsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");
  const encore = getEncore();
  const page = await encore.page(user).catch(() => null);
  if (!page) redirect("/dashboard");

  const { balance, tier, seasonSpendCents, next, rewards, ledger, redemptions, students } = page;
  const studentName = (id?: string) => students.find((s) => s.id === id)?.name;
  const live = redemptions.filter((r) => r.status === "active");
  const waiting = live.filter((r) => r.items.some((i) => i.status === "open"));
  const done = live.filter((r) => !r.items.some((i) => i.status === "open"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Encore Points</h1>
          <p className="text-sm text-muted-foreground">
            Every $1 you pay NOVA PA earns points. Spend them here on tickets, show-night treats and more.
          </p>
        </div>
        {!page.program.launched && <Badge variant="secondary">Preview: families can&apos;t see this yet</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Your points" value={formatPoints(balance)} hint={next ? `Next: ${next.reward.title}, ${formatPoints(next.short)} points away` : "Everything on the menu is in reach"} tone={next && next.short <= 2000 && page.affordable.length === 0 ? "warn" : "default"} />
        <StatTile
          label="Your tier"
          value={TIER_LABEL[tier]}
          hint={
            page.toNextTier
              ? `${formatDollars(page.toNextTier.cents)} more this season for ${TIER_LABEL[page.toNextTier.tier]}`
              : "The top tier: 12.5 points per $1"
          }
        />
        <StatTile label="Paid this season" value={formatDollars(seasonSpendCents)} hint="Since September 1" />
      </div>

      {next && next.short <= 2000 && page.affordable.length === 0 && (
        <Card className="border-gold/60 bg-accent/30 px-4 py-3 text-sm">
          <span className="font-semibold">You&apos;re {formatPoints(next.short)} points from your next reward.</span>{" "}
          Any class, camp day or store purchase gets you there.{" "}
          <Link href="/store/buttons" className="font-medium underline underline-offset-4">Browse the store</Link>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card pad={false}>
          <SectionHeader title="Your rewards" subtitle="Codes to use and things on their way" inCard />
          <ul className="divide-y">
            {waiting.map((r) => (
              <RewardRow key={r.id} r={r} studentName={studentName(r.studentId)} />
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="menu">
        <SectionHeader title={<span id="menu">Rewards</span>} subtitle="Nothing is spent until you press Redeem and confirm." />
        <RewardMenu rewards={rewards} balance={balance} students={students} />
      </section>

      <Card pad={false}>
        <SectionHeader title="Points history" inCard />
        {ledger.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No points yet. They appear here when a payment clears.</p>
        ) : (
          <ul className="divide-y text-[13.5px]">
            {ledger.slice(0, 60).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                  {new Date(e.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })}
                </span>
                <span className="min-w-0 flex-1">
                  {describeEntry(e)}
                  {e.spendCents > 0 && <span className="text-muted-foreground"> · {formatDollars(e.spendCents)} paid</span>}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${e.points > 0 ? "" : "text-muted-foreground"}`}>
                  {e.points > 0 ? "+" : "−"}
                  {formatPoints(Math.abs(e.points))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card pad={false}>
          <SectionHeader title="Used rewards" inCard />
          <ul className="divide-y">
            {done.slice(0, 20).map((r) => (
              <RewardRow key={r.id} r={r} studentName={studentName(r.studentId)} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="px-4 py-3 text-[13px] text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>10 points per $1 as a Patron, 11 as a Director ($1,500+ a season), 12.5 as a Producer ($3,000+). Your tier holds through the next season.</li>
          <li>Points post when a payment clears, including each monthly class payment. A refund removes the points it earned.</li>
          <li>Refer a family who is new to NOVA PA and earn {formatPoints(page.program.referralPoints)} points when they register.</li>
          <li>Points expire after 12 months with no earning or redeeming. They have no cash value and stay with your family account.</li>
        </ul>
      </Card>
    </div>
  );
}

const ITEM_LABEL: Record<RedemptionItem["item"], string> = {
  concession: "Concession ticket",
  gram: "Break-a-leg-a-gram",
  tshirt: "T-shirt",
  ticket_code: "Ticket code",
  registration_code: "Registration code",
  store_voucher: "Store voucher",
  day_camp_credit: "Day camp credit",
};

function itemLine(i: RedemptionItem): { text: string; code?: string } {
  const d = i.detail as Record<string, string | number | undefined>;
  switch (i.item) {
    case "concession":
      return { text: i.status === "done" ? "Used" : "Show this code at the concession table", code: i.status === "open" ? i.code : undefined };
    case "gram":
      return { text: i.status === "done" ? `Delivered to ${d.to}` : `On its way to ${d.to} on show night` };
    case "tshirt":
      return { text: i.status === "done" ? `Handed out (${d.size})` : `Size ${d.size}, handed out at rehearsal` };
    case "ticket_code":
      return { text: "Enter this code at checkout when you buy show tickets", code: i.code };
    case "registration_code":
      return { text: "Enter this code at checkout when you register for a show", code: i.code };
    case "store_voucher":
      return i.status === "done"
        ? { text: `Spent on order ${d.order ?? ""}`.trim() }
        : { text: d.product === "star_page" ? `Build your ${d.size} star page in the store; points pay for it at checkout` : "Build your spirit button in the store; points pay for one button at checkout" };
    case "day_camp_credit":
      return { text: "Added to the day camp punch card" };
  }
}

function RewardRow({ r, studentName }: { r: Redemption; studentName?: string }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.title}</span>
        {studentName && <span className="text-muted-foreground">for {studentName}</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {r.items.map((i) => {
          const line = itemLine(i);
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant={i.status === "open" ? "gold" : "secondary"}>{ITEM_LABEL[i.item]}</Badge>
              <span>{line.text}</span>
              {line.code && <CopyCode code={line.code} />}
              {i.item === "store_voucher" && i.status === "open" && (
                <Link href={i.detail.product === "star_page" ? "/store/star-pages" : "/store/buttons"} className="font-medium text-foreground underline underline-offset-4">
                  Go to the store
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

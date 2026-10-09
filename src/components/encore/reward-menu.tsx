"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redeemRewardAction } from "@/lib/actions/encore";
import { TSHIRT_SIZES, formatDollars, formatPoints } from "@/lib/encore/rules";
import type { RedeemResult, Reward, StudentChoice } from "@/lib/encore/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyCode } from "@/components/encore/copy-code";

const NEEDS_STUDENT = new Set(["show_night_pack", "tshirt", "day_camp_day", "registration_credit"]);

/**
 * The menu, cheapest first. Redeem opens a confirm step on the card itself:
 * which student, which size, what the gram says. Points move only on the
 * second press, and a refusal from the database ("You need 1,200 more
 * points") lands on the same card.
 */
export function RewardMenu({
  rewards,
  balance,
  students,
}: {
  rewards: Reward[];
  balance: number;
  students: StudentChoice[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rewards.map((r) => (
        <RewardCard
          key={r.key}
          reward={r}
          balance={balance}
          students={students}
          open={openKey === r.key}
          onOpen={() => setOpenKey(r.key)}
          onClose={() => setOpenKey(null)}
        />
      ))}
    </div>
  );
}

function RewardCard({
  reward,
  balance,
  students,
  open,
  onOpen,
  onClose,
}: {
  reward: Reward;
  balance: number;
  students: StudentChoice[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const [size, setSize] = useState(student?.tshirtSize ?? "");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RedeemResult | null>(null);

  const short = reward.points - balance;
  const affordable = short <= 0;
  const pct = Math.min(100, Math.round((balance / reward.points) * 100));
  const needsStudent = NEEDS_STUDENT.has(reward.kind);
  const campBlocked = reward.kind === "day_camp_day" && student && !student.onPunchCard;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await redeemRewardAction(reward.key, needsStudent || reward.kind === "spirit_button" || reward.kind === "star_page" ? studentId || null : null, {
        size: reward.kind === "tshirt" ? size : undefined,
        message: reward.kind === "show_night_pack" ? message : undefined,
        from: reward.kind === "show_night_pack" ? from : undefined,
      });
      if (res.ok) {
        setDone(res.result);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  };

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold leading-tight">{reward.title}</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">{reward.blurb}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums">{formatPoints(reward.points)}</div>
          <div className="text-[11px] text-muted-foreground">{formatDollars(reward.valueCents)} value</div>
        </div>
      </div>

      {done ? (
        <div className="rounded-md bg-accent/40 px-3 py-2 text-[13px]" role="status">
          <p className="font-medium">Done. {formatPoints(done.points)} points spent; {formatPoints(done.balance)} left.</p>
          {done.codes.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {done.codes.map((c) => (
                <CopyCode key={c.code} code={c.code} />
              ))}
              <p className="text-muted-foreground">These codes are also saved under Your rewards.</p>
            </div>
          )}
          {(reward.kind === "spirit_button" || reward.kind === "star_page") && (
            <p className="mt-1 text-muted-foreground">Build it in the store; points pay for it at checkout.</p>
          )}
        </div>
      ) : !affordable ? (
        <div className="mt-auto">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{formatPoints(short)} more points</p>
        </div>
      ) : !open ? (
        <Button className="mt-auto" variant="outline" size="sm" onClick={onOpen}>
          Redeem
        </Button>
      ) : (
        <div className="mt-1 flex flex-col gap-2 border-t pt-2 text-[13px]">
          {(needsStudent || reward.kind === "spirit_button" || reward.kind === "star_page") && students.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">For which student?</span>
              <select
                id={`stu-${reward.key}`}
                className="h-10 rounded-md border bg-background px-2"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setSize(students.find((s) => s.id === e.target.value)?.tshirtSize ?? "");
                }}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reward.kind === "tshirt" && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Size</span>
              <select id={`size-${reward.key}`} className="h-10 rounded-md border bg-background px-2" value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="">Choose a size</option>
                {[...new Set([...(size && !TSHIRT_SIZES.includes(size as (typeof TSHIRT_SIZES)[number]) ? [size] : []), ...TSHIRT_SIZES])].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reward.kind === "show_night_pack" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Your break-a-leg-a-gram message</span>
                <textarea
                  id={`msg-${reward.key}`}
                  className="min-h-16 rounded-md border bg-background px-2 py-1.5"
                  maxLength={280}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Break a leg tonight! We are so proud of you."
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Signed</span>
                <input id={`from-${reward.key}`} className="h-10 rounded-md border bg-background px-2" maxLength={80} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Love, Mom and Dad" />
              </label>
            </>
          )}
          {reward.kind === "registration_credit" && (
            <p className="text-muted-foreground">One registration credit per student per season. You get a code to enter at checkout on novapa.org.</p>
          )}
          {reward.kind === "show_ticket" && (
            <p className="text-muted-foreground">You get a code worth one ticket. Enter it at checkout when you buy tickets.</p>
          )}
          {campBlocked && (
            <p className="text-destructive">This student is not on the day camp punch card yet. Call the office and we will add the day by hand.</p>
          )}
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={pending || Boolean(campBlocked) || (reward.kind === "tshirt" && !size)}>
              {pending ? "Redeeming..." : `Spend ${formatPoints(reward.points)} points`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

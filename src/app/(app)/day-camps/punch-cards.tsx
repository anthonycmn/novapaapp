"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudSnow, Lock, ShoppingCart, Ticket, X } from "lucide-react";
import {
  DAY_CAMP_CREDITS_GOOD_THROUGH,
  DAY_CAMP_PACK_SIZE,
  DAY_CAMP_PACK_SNOW_BONUS,
  priceDays,
} from "@/config/day-camps";
import type {
  PunchCard,
  PunchCardBoard,
  PunchCardDay,
  PunchCardSession,
} from "@/lib/api/registration/punch-card";
import {
  bookWithCreditsAction,
  checkoutDayCampsAction,
} from "@/lib/actions/day-camps";
import { formatCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The cards themselves — one per child — and the tray that collects what a
 * parent has picked before they commit.
 *
 * Three kinds of row, and the parent can tell them apart at a glance:
 *   BOOKED    a lock, the session, when and how it was bought. No control at
 *             all: "if they purchased a specific day — show that and do not
 *             let them change." A change is a message to the office.
 *   USE A CREDIT  while the child has credits left to allocate. Picking
 *             several before confirming is fine, up to the balance.
 *   ADD · $79  into the cart, which prices exactly as the checkout will and
 *             says when five of them become the $349 pack.
 * A row is in the credit pile or the cart, never both.
 */

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

type Picks = { credit: Set<number>; cart: Set<number>; band: Record<string, number> };

export function PunchCards({ board }: { board: PunchCardBoard }) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, Picks>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ studentId: string; ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const picksFor = (card: PunchCard): Picks =>
    picks[card.student.id] ?? { credit: new Set(), cart: new Set(), band: {} };

  const update = (card: PunchCard, fn: (p: Picks) => Picks) =>
    setPicks((all) => ({ ...all, [card.student.id]: fn(picksFor(card)) }));

  /** The session a row currently shows: the parent's choice, else the default band. */
  const sessionShown = (card: PunchCard, day: PunchCardDay): PunchCardSession | undefined => {
    const chosen = picksFor(card).band[day.date];
    return (
      day.sessions.find((s) => s.activityId === chosen) ??
      day.sessions.find((s) => s.isDefaultBand) ??
      undefined
    );
  };

  const book = (card: PunchCard) => {
    const ids = [...picksFor(card).credit];
    startTransition(async () => {
      const result = await bookWithCreditsAction({ studentId: card.student.id, activityIds: ids });
      setConfirming(null);
      setNotice({ studentId: card.student.id, ok: result.ok, text: result.message });
      if (result.ok) {
        update(card, (p) => ({ ...p, credit: new Set() }));
        router.refresh();
      }
    });
  };

  const checkout = (card: PunchCard, packId?: number) => {
    const ids = [...picksFor(card).cart];
    startTransition(async () => {
      const result = await checkoutDayCampsAction({ studentId: card.student.id, activityIds: ids, packId });
      if (result.ok && result.url) {
        window.location.assign(result.url);
        return;
      }
      setNotice({ studentId: card.student.id, ok: false, text: result.message ?? "That didn't go through." });
    });
  };

  const anyPicks = board.cards.some((c) => picksFor(c).credit.size + picksFor(c).cart.size > 0);

  return (
    <div className={`flex flex-col gap-4 ${anyPicks ? "pb-40" : ""}`}>
      {board.cards.map((card) => (
        <ChildCard
          key={card.student.id}
          card={card}
          board={board}
          picks={picksFor(card)}
          notice={notice?.studentId === card.student.id ? notice : null}
          dismissNotice={() => setNotice(null)}
          sessionShown={(day) => sessionShown(card, day)}
          onBand={(day, activityId) =>
            update(card, (p) => {
              // Switching band moves a pick with it: the parent chose the day.
              const prev = sessionShown(card, day)?.activityId;
              const credit = new Set(p.credit);
              const cart = new Set(p.cart);
              if (prev != null && credit.delete(prev)) credit.add(activityId);
              if (prev != null && cart.delete(prev)) cart.add(activityId);
              return { credit, cart, band: { ...p.band, [day.date]: activityId } };
            })
          }
          onCredit={(activityId) =>
            update(card, (p) => {
              const credit = new Set(p.credit);
              const cart = new Set(p.cart);
              if (credit.has(activityId)) credit.delete(activityId);
              else if (credit.size < card.credits.day) {
                credit.add(activityId);
                cart.delete(activityId);
              }
              return { ...p, credit, cart };
            })
          }
          onCart={(activityId) =>
            update(card, (p) => {
              const credit = new Set(p.credit);
              const cart = new Set(p.cart);
              if (cart.has(activityId)) cart.delete(activityId);
              else {
                cart.add(activityId);
                credit.delete(activityId);
              }
              return { ...p, credit, cart };
            })
          }
          onBuyPack={(packId) => checkout(card, packId)}
          pending={pending}
        />
      ))}

      {anyPicks && (
        <Tray
          cards={board.cards}
          picksFor={picksFor}
          dayPriceCents={board.dayPriceCents}
          onClear={(card) => update(card, (p) => ({ ...p, credit: new Set(), cart: new Set() }))}
          onBook={(card) => setConfirming(card.student.id)}
          onCheckout={(card) => checkout(card)}
          pending={pending}
        />
      )}

      {confirming && (() => {
        const card = board.cards.find((c) => c.student.id === confirming);
        if (!card) return null;
        const chosen = [...picksFor(card).credit].map((id) => {
          const day = card.days.find((d) => d.sessions.some((s) => s.activityId === id));
          const session = day?.sessions.find((s) => s.activityId === id);
          return { day, session };
        });
        const left = card.credits.day - chosen.length;
        const first = card.student.preferredName ?? card.student.firstName;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <Card className="w-full max-w-md p-4">
              <h2 id="confirm-title" className="text-base font-semibold">
                Book {first} with {chosen.length} credit{chosen.length === 1 ? "" : "s"}?
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {chosen.map(({ day, session }) => (
                  <li key={session?.activityId} className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 text-muted-foreground">{day?.label}</span>
                    <span>{session?.name}{session?.band ? ` (${session.band.label})` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                {left} credit{left === 1 ? "" : "s"} will be left. Booked days are locked — to change one later, message the office.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(null)}>
                  Not yet
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => book(card)}>
                  {pending ? "Booking…" : `Book ${chosen.length === 1 ? "it" : `${chosen.length} days`}`}
                </Button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

/* ── one child ─────────────────────────────────────────────────────────── */

function ChildCard({
  card, board, picks, notice, dismissNotice, sessionShown, onBand, onCredit, onCart, onBuyPack, pending,
}: {
  card: PunchCard;
  board: PunchCardBoard;
  picks: Picks;
  notice: { ok: boolean; text: string } | null;
  dismissNotice: () => void;
  sessionShown: (day: PunchCardDay) => PunchCardSession | undefined;
  onBand: (day: PunchCardDay, activityId: number) => void;
  onCredit: (activityId: number) => void;
  onCart: (activityId: number) => void;
  onBuyPack: (packId: number) => void;
  pending: boolean;
}) {
  const [bandsOpen, setBandsOpen] = useState<Set<string>>(new Set());
  const first = card.student.preferredName ?? card.student.firstName;
  const packCredits = card.packsBought.reduce((n, p) => n + p.credits, 0);
  const creditsFree = card.credits.day - picks.credit.size;

  const months = useMemo(() => {
    const groups: { key: string; label: string; days: PunchCardDay[] }[] = [];
    for (const day of card.days) {
      const key = day.date.slice(0, 7);
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label: MONTH.format(new Date(`${day.date}T12:00:00Z`)), days: [] };
        groups.push(g);
      }
      g.days.push(day);
    }
    return groups;
  }, [card.days]);

  const upcoming = card.days.filter((d) => !d.past);

  return (
    <Card pad={false} data-tour="punch-card">
      <SectionHeader
        inCard
        title={`${first} ${card.student.lastName}`}
        subtitle={card.age != null ? `Age ${card.age}` : undefined}
        right={
          card.camper && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Badge variant={card.credits.day > 0 ? "gold" : "outline"}>
                <Ticket aria-hidden className="mr-1 size-3" />
                {card.credits.day > 0
                  ? packCredits > 0 && card.credits.day <= packCredits
                    ? `${card.credits.day} of ${packCredits} credit${packCredits === 1 ? "" : "s"} left`
                    : `${card.credits.day} credit${card.credits.day === 1 ? "" : "s"}`
                  : "No credits — buy a pack below"}
              </Badge>
              {card.credits.snow > 0 && (
                <Badge
                  variant="secondary"
                  title="Used automatically when we run a Snow Day Fun Day. We email by 7 AM."
                >
                  <CloudSnow aria-hidden className="mr-1 size-3" />
                  {card.credits.snow} snow day{card.credits.snow === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          )
        }
      />

      {!card.camper ? (
        <div className="p-4 text-sm">
          <p className="font-medium">We can&apos;t find {first} in the registration system yet.</p>
          <p className="mt-1 text-muted-foreground">
            A punch card needs the child linked to their registration record.{" "}
            <Link href="/messages" className="underline">Message the office</Link> and we&apos;ll
            connect them — usually the same day.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-[12px] text-muted-foreground">
            {card.credits.day > 0 && <span>Credits are good through {DAY_CAMP_CREDITS_GOOD_THROUGH}.</span>}
            {card.packsBought.map((p, i) => (
              <span key={i}>{p.name} bought {SHORT_DATE.format(new Date(p.on))}</span>
            ))}
            {card.ageNote && <span className="text-foreground">{card.ageNote}</span>}
          </div>

          {notice && (
            <div
              className={`flex items-start gap-2 border-b px-4 py-2.5 text-sm ${notice.ok ? "bg-accent/40" : "bg-destructive/10"}`}
              role="status"
            >
              {notice.ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" /> : null}
              <span className="flex-1">{notice.text}</span>
              <button type="button" aria-label="Dismiss" className="text-muted-foreground" onClick={dismissNotice}>
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )}

          {upcoming.length === 0 && card.days.every((d) => d.past) ? (
            <p className="p-4 text-sm text-muted-foreground">
              Every day camp on the calendar has happened. New dates appear here as soon as they are announced.
            </p>
          ) : null}

          {months.map((month) => (
            <div key={month.key}>
              <div className="bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {month.label}
              </div>
              <ul className="divide-y">
                {month.days.map((day) => {
                  const shown = sessionShown(day);
                  const inCredit = shown ? picks.credit.has(shown.activityId) : false;
                  const inCart = shown ? picks.cart.has(shown.activityId) : false;
                  const open = bandsOpen.has(day.date);
                  const canBook = !day.past && !day.booked && !day.full;
                  const shownFull = shown ? !shown.bookable || (shown.remaining != null && shown.remaining <= 0) : true;
                  const canCredit = canBook && shown && !shownFull && (inCredit || creditsFree > 0);
                  return (
                    <li key={day.date} className={`px-4 py-2.5 ${day.past ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="w-[6.5rem] shrink-0 text-[13.5px] font-medium tabular-nums">{day.label}</span>

                        {day.booked ? (
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                            <Badge variant="gold"><Lock aria-hidden className="mr-1 size-3" />Booked</Badge>
                            <span className="truncate">
                              {day.booked.name}
                              {day.booked.band ? ` (${day.booked.band.label})` : ""}
                            </span>
                            <span className="text-[12px] text-muted-foreground">
                              {day.booked.viaCredit ? "with a credit" : "paid"} {SHORT_DATE.format(new Date(day.booked.on))}
                            </span>
                          </span>
                        ) : (
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                            {shown ? (
                              <>
                                <span className="truncate">{shown.name}</span>
                                {shown.band && (
                                  <button
                                    type="button"
                                    className="rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground hover:bg-muted"
                                    onClick={() =>
                                      setBandsOpen((s) => {
                                        const next = new Set(s);
                                        if (next.has(day.date)) next.delete(day.date);
                                        else next.add(day.date);
                                        return next;
                                      })
                                    }
                                    aria-expanded={open}
                                  >
                                    {shown.band.label}{day.sessions.length > 1 ? " ▾" : ""}
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">Pick an age group</span>
                            )}
                            <span className="text-[12px] text-muted-foreground">
                              {day.past
                                ? "Past"
                                : day.full || shownFull
                                  ? "Full"
                                  : shown?.remaining != null && shown.remaining < 10
                                    ? `${shown.remaining} spot${shown.remaining === 1 ? "" : "s"} left`
                                    : null}
                            </span>
                          </span>
                        )}

                        {canBook && shown && !shownFull && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            {(card.credits.day > 0) && (
                              <Button
                                type="button"
                                size="sm"
                                variant={inCredit ? "default" : "outline"}
                                className="h-8 px-2.5 text-[12px]"
                                disabled={!canCredit || pending}
                                onClick={() => onCredit(shown.activityId)}
                                aria-pressed={inCredit}
                              >
                                <Ticket aria-hidden className="size-3.5" />
                                {inCredit ? "Credit ✓" : "Use a credit"}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant={inCart ? "default" : "outline"}
                              className="h-8 px-2.5 text-[12px]"
                              disabled={pending}
                              onClick={() => onCart(shown.activityId)}
                              aria-pressed={inCart}
                            >
                              <ShoppingCart aria-hidden className="size-3.5" />
                              {inCart ? "In cart" : `Add · ${formatCents(board.dayPriceCents)}`}
                            </Button>
                          </span>
                        )}
                      </div>

                      {!day.booked && (open || !shown) && day.sessions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[6.5rem]">
                          {day.sessions.map((s) => {
                            const full = !s.bookable || (s.remaining != null && s.remaining <= 0);
                            const active = shown?.activityId === s.activityId;
                            return (
                              <button
                                key={s.activityId}
                                type="button"
                                disabled={day.past || full}
                                onClick={() => {
                                  onBand(day, s.activityId);
                                  setBandsOpen((st) => { const n = new Set(st); n.delete(day.date); return n; });
                                }}
                                className={`rounded-md border px-2 py-1 text-left text-[12px] disabled:opacity-50 ${active ? "border-gold bg-accent/40" : "hover:bg-muted"}`}
                                aria-pressed={active}
                              >
                                <span className="font-medium">{s.band?.label ?? "All ages"}</span>
                                <span className="text-muted-foreground"> · {s.name}</span>
                                {full ? <span className="text-muted-foreground"> · Full</span> : null}
                                {!s.isOffered && !full ? <span className="text-muted-foreground"> · outside {first}&apos;s age</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[12px] text-muted-foreground">
            <span>
              Need to change a booked day?{" "}
              <Link href="/messages" className="underline">Message the office</Link>.
            </span>
            {card.ledger.length > 0 && (
              <details className="min-w-0">
                <summary className="cursor-pointer">Credit history</summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {card.ledger.map((line, i) => (
                    <li key={i}>
                      {SHORT_DATE.format(new Date(line.on))} ·{" "}
                      {line.kind === "grant" ? "+" : "−"}
                      {line.day > 0 ? `${line.day} day${line.day === 1 ? "" : "s"}` : ""}
                      {line.day > 0 && line.snow > 0 ? ", " : ""}
                      {line.snow > 0 ? `${line.snow} snow` : ""} · {line.what}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Buy credits. One camper per pack — the registration system grants
              them to the named camper and never shares between siblings. */}
          <div className="border-t px-4 py-3">
            <p className="text-[13px] font-medium">Buy more credits for {first}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              One camper per pack. Credits land on {first}&apos;s card as soon as the checkout finishes.
              {board.snowBonusOpen ? ` A pack bought by September 21 also adds ${DAY_CAMP_PACK_SNOW_BONUS} Snow Day credits.` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {board.packs.map((pack) => (
                <Button
                  key={pack.activityId}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !pack.bookable}
                  onClick={() => onBuyPack(pack.activityId)}
                >
                  {pack.name} — {formatCents(pack.cents)}
                  <span className="text-muted-foreground">
                    · {pack.credits} credits{picks.cart.size ? ` + ${picks.cart.size} day${picks.cart.size === 1 ? "" : "s"} in the cart` : ""}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ── the tray ──────────────────────────────────────────────────────────── */

function Tray({
  cards, picksFor, dayPriceCents, onClear, onBook, onCheckout, pending,
}: {
  cards: PunchCard[];
  picksFor: (card: PunchCard) => Picks;
  dayPriceCents: number;
  onClear: (card: PunchCard) => void;
  onBook: (card: PunchCard) => void;
  onCheckout: (card: PunchCard) => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur" data-tour="punch-card-tray">
      {/* Right padding keeps the buttons clear of Ask Spot, which sits fixed
          in the same corner one layer above. */}
      <div className="mx-auto flex max-w-3xl flex-col gap-2 p-3 pr-[7.5rem]">
        {cards.map((card) => {
          const p = picksFor(card);
          if (p.credit.size + p.cart.size === 0) return null;
          const first = card.student.preferredName ?? card.student.firstName;
          const pricing = priceDays(p.cart.size);
          const single = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
          return (
            <div key={card.student.id} className="flex flex-col gap-1.5">
              {p.credit.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Ticket aria-hidden className="size-4 text-gold" />
                  <span className="flex-1">
                    <strong>{first}</strong> · {single(p.credit.size)} with {p.credit.size} credit{p.credit.size === 1 ? "" : "s"}
                    <span className="text-muted-foreground"> · {card.credits.day - p.credit.size} will be left</span>
                  </span>
                  <Button type="button" size="sm" disabled={pending} onClick={() => onBook(card)}>
                    Book with credits
                  </Button>
                </div>
              )}
              {p.cart.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ShoppingCart aria-hidden className="size-4 text-gold" />
                  <span className="flex-1">
                    <strong>{first}</strong> · {single(p.cart.size)} · {formatCents(pricing.cents)}
                    {pricing.packs > 0 && pricing.singles === 0 ? (
                      <span className="text-muted-foreground">
                        {" "}({pricing.packs === 1 ? "pack price" : `${pricing.packs} packs`}, {formatCents(pricing.perDayPackedCents)} a day)
                      </span>
                    ) : pricing.nudge ? (
                      <span className="block text-[12.5px] text-muted-foreground sm:inline">
                        {" "}<strong className="text-foreground">Add {pricing.nudge.more} more and pay {formatCents(pricing.nudge.totalCents)} for all {pricing.nudge.totalDays === DAY_CAMP_PACK_SIZE ? "five" : pricing.nudge.totalDays}</strong> ({formatCents(pricing.perDayPackedCents)} a day instead of {formatCents(dayPriceCents)}).
                      </span>
                    ) : null}
                  </span>
                  <Button type="button" size="sm" disabled={pending} onClick={() => onCheckout(card)}>
                    {pending ? "One moment…" : "Check out"}
                  </Button>
                </div>
              )}
              <div className="text-right">
                <button type="button" className="text-[11.5px] text-muted-foreground underline" onClick={() => onClear(card)} disabled={pending}>
                  Clear {first}&apos;s picks
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

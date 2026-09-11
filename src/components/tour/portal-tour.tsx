"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { markTourSeenAction } from "@/lib/actions/tour";
import { TOUR_VERSION, type TourOutcome, type TourStep } from "@/lib/tour";
import { cn } from "@/lib/utils";

/**
 * The tour, drawn: a dimmed page with a window cut around the thing each step
 * is about, and a card beside it that says what the thing is.
 *
 * No library. The whole of it is "find the element with this data-tour value,
 * scroll it into view, measure it, draw a box there" — and the box is a div
 * whose box-shadow is the dimming, so the element under it stays exactly as
 * rendered and nothing on the page is cloned or re-styled.
 *
 * The shell owns the phone drawer, not this component, so the steps about the
 * menu ask for it by event (`novapa:tour-menu`) and the shell answers by
 * opening or closing it. The sidebar inside the drawer carries the same
 * data-tour marks as the desktop rail, so the spotlight lands on the same rows
 * whichever one is showing.
 *
 * Nothing under the overlay is clickable while the tour is up. A tour where
 * tapping the highlighted thing navigates away mid-sentence is a tour nobody
 * finishes — the card's own link is the way in, and taking it counts as done.
 */

/** Written the moment the tour closes, before the server has confirmed. */
const SEEN_KEY = "novapa-tour-seen";

export const TOUR_MENU_EVENT = "novapa:tour-menu";

const PAD = 6;
const GAP = 12;
const MARGIN = 12;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function isPhone(): boolean {
  // Tailwind's lg — where the shell swaps the rail for the drawer.
  return window.matchMedia("(max-width: 1023.98px)").matches;
}

function findAnchor(anchors: string[]): HTMLElement | null {
  for (const anchor of anchors) {
    const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`);
    for (const el of candidates) {
      // The desktop rail is display:none on a phone and vice versa; a hidden
      // element has no client rects, so "visible" is just "has a box".
      const rect = el.getBoundingClientRect();
      if (el.getClientRects().length > 0 && rect.width > 0 && rect.height > 0) return el;
    }
  }
  return null;
}

function measure(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function PortalTour({
  steps,
  autoStart,
  replay,
}: {
  steps: TourStep[];
  /** Server says this account has not seen the current version. */
  autoStart: boolean;
  /** `?tour=1` — somebody asked for it, so it opens whatever the record says. */
  replay: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBoxState] = useState<Box | null>(null);
  /* Same box, same state: the follow loop below measures every frame for a
     moment, and nearly every one of those is the same numbers again. */
  const setBox = useCallback((next: Box | null) => {
    setBoxState((current) => {
      if (current === next) return current;
      if (
        current &&
        next &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.height === next.height
      )
        return current;
      return next;
    });
  }, []);
  /* Inline style for the card once we know where the box is and how big
     the card turned out to be. Undefined means centered. */
  const [cardStyle, setCardStyle] = useState<React.CSSProperties | undefined>();
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const step = steps[index];
  const last = index === steps.length - 1;

  const setMenu = useCallback((wanted: boolean) => {
    window.dispatchEvent(new CustomEvent(TOUR_MENU_EVENT, { detail: { open: wanted } }));
  }, []);

  /* ── starting ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (replay) {
      setIndex(0);
      setOpen(true);
      return;
    }
    if (!autoStart) return;
    try {
      // The server said "not seen", but the row may simply not have landed
      // yet from a close a second ago on this same browser.
      if (Number(localStorage.getItem(SEEN_KEY) ?? 0) >= TOUR_VERSION) return;
    } catch {
      // A browser that blocks storage still gets the tour — once per the
      // server's record, which is the one that matters.
    }
    // A beat after the dashboard paints, so the first spotlight has
    // something to land on rather than a skeleton.
    const timer = window.setTimeout(() => {
      setIndex(0);
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoStart, replay]);

  /* ── closing ──────────────────────────────────────────────────────── */

  const close = useCallback(
    (outcome: TourOutcome) => {
      setOpen(false);
      setBox(null);
      setMenu(false);
      try {
        localStorage.setItem(SEEN_KEY, String(TOUR_VERSION));
      } catch {
        // ignore
      }
      void markTourSeenAction(outcome).catch(() => {
        /* The record is a convenience; the tour has closed either way, and
           the menu can bring it back. Nothing to tell the parent. */
      });
      // Take ?tour=1 back off the address so a refresh does not restart it.
      if (replay) router.replace("/dashboard", { scroll: false });
    },
    [replay, router, setMenu, setBox]
  );

  /* ── the spotlight follows the step ───────────────────────────────── */

  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    let raf = 0;

    const wantMenu = Boolean(step.menu) && isPhone();
    setMenu(wantMenu);

    const settle = () => {
      if (cancelled) return;
      const el = step.anchors.length ? findAnchor(step.anchors) : null;
      targetRef.current = el;
      if (!el) {
        setBox(null);
        return;
      }
      // The page scrolls inside <main>, and the drawer's list inside itself;
      // scrollIntoView finds whichever ancestor needs to move. Instant, so
      // the box is measured where the element has landed, not mid-glide.
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      // Measured now, not on the next frame — a tab the browser is not
      // painting (a background tab, a hidden pane) never gets that frame, and
      // the box would stay a plain dim forever.
      setBox(measure(el));
      // Then follow it for half a second: the first measurement after a
      // scroll was landing a hundred pixels high while the browser was still
      // settling, and a scroll event is not guaranteed for every one of those
      // frames. Frames are cheap; a box drawn round the wrong thing is not.
      const until = performance.now() + 500;
      const follow = () => {
        if (cancelled) return;
        setBox(measure(el));
        if (performance.now() < until) raf = requestAnimationFrame(follow);
      };
      raf = requestAnimationFrame(follow);
    };

    // A frame for the drawer to mount, and a moment for it to lay out.
    const timer = window.setTimeout(settle, wantMenu ? 120 : 30);

    // Keep the box on the element when things move under it — a streamed
    // panel landing above the week, a rotated phone, a scroll.
    const remeasure = () => {
      const el = targetRef.current;
      if (el && el.isConnected) setBox(measure(el));
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(document.body);
    window.addEventListener("resize", remeasure);
    document.addEventListener("scroll", remeasure, true);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("scroll", remeasure, true);
    };
  }, [open, step, setMenu, setBox]);

  /* ── the card sits beside the box ─────────────────────────────────── */

  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!box) {
      setCardStyle(undefined);
      return;
    }

    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    // Phones: a band across the screen, on whichever half the box is not.
    if (vw < 640) {
      const boxMid = box.top + box.height / 2;
      setCardStyle(
        boxMid < vh / 2
          ? { left: MARGIN, right: MARGIN, bottom: MARGIN }
          : { left: MARGIN, right: MARGIN, top: MARGIN }
      );
      return;
    }

    // Something as tall as the sidebar: sit beside it.
    if (box.height > vh * 0.6) {
      const left =
        box.left + box.width + GAP + cw <= vw - MARGIN
          ? box.left + box.width + GAP
          : Math.max(MARGIN, box.left - GAP - cw);
      setCardStyle({ left, top: clamp(box.top + 16, MARGIN, vh - ch - MARGIN) });
      return;
    }

    const left = clamp(box.left, MARGIN, vw - cw - MARGIN);
    if (box.top + box.height + GAP + ch <= vh - MARGIN) {
      setCardStyle({ left, top: box.top + box.height + GAP });
    } else if (box.top - GAP - ch >= MARGIN) {
      setCardStyle({ left, top: box.top - GAP - ch });
    } else if (box.left + box.width + GAP + cw <= vw - MARGIN) {
      setCardStyle({
        left: box.left + box.width + GAP,
        top: clamp(box.top, MARGIN, vh - ch - MARGIN),
      });
    } else {
      setCardStyle({ left, bottom: MARGIN });
    }
  }, [open, box, index]);

  /* ── keys and focus ───────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close("skipped");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (last) close("finished");
        else setIndex((i) => i + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "Tab") {
        // Keep focus on the card: everything else on the page is under the
        // overlay and cannot be used anyway.
        const card = cardRef.current;
        if (!card) return;
        const focusable = card.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          first.focus();
        } else if (!card.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, last, close]);

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[70]"
      // The overlay is what stops clicks reaching the page: it is a full-size
      // element with pointer events, and the spotlight div only draws.
      onClick={(event) => event.stopPropagation()}
    >
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[10px]"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 2px var(--gold), 0 0 0 200vmax rgba(8, 17, 31, 0.62)",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="fixed inset-0"
          style={{ background: "rgba(8, 17, 31, 0.62)" }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={cn(
          "fixed w-[calc(100vw-1.5rem)] max-w-sm rounded-lg border bg-card text-card-foreground shadow-xl outline-none",
          !cardStyle && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        )}
        style={cardStyle}
      >
        <div className="gold-band flex items-center gap-2 border-b px-4 py-2.5">
          <Compass aria-hidden size={15} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            Show me around
          </p>
          <span className="ml-auto text-[11px] opacity-80">
            {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => close(last ? "finished" : "skipped")}
            aria-label={last ? "Close the tour" : "Skip the tour"}
            className="-mr-1.5 inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
          >
            <X aria-hidden size={15} />
          </button>
        </div>

        <div className="px-4 py-3">
          <h2 id={titleId} className="text-[15px] font-semibold leading-snug">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {step.body}
          </p>
          {step.link && (
            <Link
              href={step.link.href}
              // Going there is the point of the tour; leaving by this door
              // counts as having finished it.
              onClick={() => close("finished")}
              className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-gold hover:underline"
            >
              {step.link.label} <ArrowRight aria-hidden size={13} />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-2.5">
          {/* Dots are decoration; the header's "3 of 11" is the count. At phone
              width they cost the buttons their one line, so they go. */}
          <div className="hidden items-center gap-1 sm:flex" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "size-1.5 rounded-full",
                  i === index ? "bg-gold" : "bg-foreground/15"
                )}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition-colors hover:bg-muted"
              >
                <ArrowLeft aria-hidden size={14} /> Back
              </button>
            )}
            {index === 0 && !last && (
              <button
                type="button"
                onClick={() => close("skipped")}
                className="inline-flex h-9 items-center whitespace-nowrap rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Not now
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close("finished") : setIndex((i) => i + 1))}
              className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {last ? "Done" : index === 0 ? "Show me around" : "Next"}
              {!last && <ArrowRight aria-hidden size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

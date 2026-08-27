import { Lightbulb } from "lucide-react";
import { org } from "@/config/org";
import { quoteOfTheDay } from "@/lib/quotes";

/**
 * The mission plaque — the staff portal's "We Care" block, carrying the org
 * mission for families.
 *
 * Fixed navy and gold rather than themed, exactly as the staff portal does
 * it: the deep navy is a *text* color in dark mode and would flip pale,
 * turning the plaque inside out. It looks the same whichever theme you are
 * in, which is the point of a plaque.
 */
export function MissionPlaque() {
  return (
    <div
      className="mb-4 overflow-hidden rounded-lg px-5 py-4 text-center"
      style={{
        background:
          "radial-gradient(600px 200px at 50% -40%, #1b3563 0%, #0F1E36 60%, #08111F 100%)",
        border: "1px solid rgba(232,184,75,0.35)",
      }}
    >
      <div
        className="font-display text-[22px] font-bold leading-tight tracking-tight sm:text-[30px]"
        style={{ color: "#E8B84B" }}
      >
        {org.mission}
      </div>
      <div
        className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "rgba(255,255,255,0.72)" }}
      >
        Our&nbsp;Mission
      </div>
    </div>
  );
}

/**
 * One line a day about what theatre is doing for their child. Rendered on the
 * server, so it is already in the HTML — no flash of an empty card, and no
 * client JS for something that changes once a day.
 */
export function TipOfTheDay() {
  const quote = quoteOfTheDay();

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-gold/40 bg-tip px-4 py-3">
      <Lightbulb aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
          Tip of the day
        </div>
        <blockquote className="mt-0.5 text-[13.5px] leading-relaxed text-tip-foreground">
          {quote.text}
          {quote.author && (
            <footer className="mt-1 text-[12px] text-tip-foreground/70">
              — {quote.author}
            </footer>
          )}
        </blockquote>
      </div>
    </div>
  );
}

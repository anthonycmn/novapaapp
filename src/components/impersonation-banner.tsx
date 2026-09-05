import { LogOut, ShieldAlert } from "lucide-react";
import { leaveImpersonationAction } from "@/lib/actions/impersonation";

/**
 * The bar that says whose account this is.
 *
 * Sticky, high-contrast, and above everything. A Chief who forgets they are
 * inside a parent's account is the failure this feature has to design against:
 * the mistake is not entering, it is staying — reading a message as them,
 * answering it as them, or typing into the wrong window an hour later.
 *
 * So it names the family out loud rather than saying "impersonating", it keeps
 * the way out at the same width as the way in, and it does not collapse or
 * dismiss. A banner you can hide is a banner that will be hidden.
 */
export function ImpersonationBanner({
  who,
  actorEmail,
}: {
  /** The account being stood in, named the way the parent would recognise it. */
  who: string;
  actorEmail: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/60 bg-amber-100 text-amber-950 dark:border-amber-600/60 dark:bg-secondary dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <ShieldAlert aria-hidden size={16} className="shrink-0" />
        <p className="min-w-0 flex-1">
          You are signed in as <strong className="font-semibold">{who}</strong>. Anything you
          do here is recorded against {actorEmail}.
        </p>
        {/* A form rather than a link: leaving changes state — it closes the
            record and drops two cookies — and a POST is the honest shape for
            that. It also keeps the way out exactly as wide as the way in. */}
        <form action={leaveImpersonationAction} className="shrink-0">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-700/40 bg-amber-200 px-2.5 py-1 font-medium transition-colors hover:bg-amber-300 dark:border-amber-600/60 dark:bg-muted dark:hover:bg-border"
          >
            <LogOut aria-hidden size={13} />
            Leave their account
          </button>
        </form>
      </div>
    </div>
  );
}

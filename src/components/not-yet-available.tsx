import Link from "next/link";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { STORE_FEATURE_COPY, type StoreFeature } from "@/lib/store-availability";

/**
 * What a family sees where a feature will be.
 *
 * CJ, 4 Sep 2026: "when they click spirit buttons - it says this feature is not
 * yet available - same for star pages."
 *
 * It says "not yet", names what it will do, and points back to somewhere useful.
 * A dead end that only says no is the kind of page that generates the email the
 * feature was meant to save.
 */
export function NotYetAvailable({ feature }: { feature: StoreFeature }) {
  const copy = STORE_FEATURE_COPY[feature];

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full border bg-muted">
          <Clock aria-hidden size={20} className="text-muted-foreground" />
        </span>
        {/* The same pill the meals and volunteering cards use, so "not built
            yet" reads the same way everywhere in the portal. */}
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Coming soon
        </span>
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.body}</p>
        <Link
          href="/dashboard"
          className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to your dashboard
        </Link>
      </CardContent>
    </Card>
  );
}

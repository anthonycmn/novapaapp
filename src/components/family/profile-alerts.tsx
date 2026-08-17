import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import type { ProfileReview } from "@/lib/profile-completeness";
import { Card } from "@/components/ui/card";

/**
 * What is still missing from this family's profile.
 *
 * Tony, 17 Aug 2026: "leaves red alerts around things that are not complete."
 *
 * Red is reserved for things that stop us running a rehearsal safely or reaching
 * a parent. Everything else is amber and sits behind a disclosure, because a
 * page that shouts about a missing t-shirt size teaches families to ignore it —
 * and then the unsigned health form gets ignored with it.
 */
export function ProfileAlerts({ review }: { review: ProfileReview }) {
  const { required, suggested, percentComplete } = review;

  if (required.length === 0 && suggested.length === 0) {
    return (
      <Card pad={false} className="mb-4 border-primary/30">
        <p className="flex items-center gap-2 px-4 py-3 text-[13px]">
          <CheckCircle2 aria-hidden size={16} className="shrink-0 text-primary" />
          <span>
            <span className="font-medium">This profile is complete.</span>{" "}
            <span className="text-muted-foreground">
              Nothing outstanding — thank you, it genuinely makes show week easier.
            </span>
          </span>
        </p>
      </Card>
    );
  }

  return (
    <Card pad={false} className={`mb-4 ${required.length > 0 ? "border-destructive/50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          {required.length > 0 ? (
            <>
              <AlertTriangle aria-hidden size={15} className="shrink-0 text-destructive" />
              {required.length} {required.length === 1 ? "thing needs" : "things need"} your
              attention
            </>
          ) : (
            <>
              <Info aria-hidden size={15} className="shrink-0 text-gold" />
              Nothing urgent
            </>
          )}
        </h2>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {percentComplete}% complete
        </span>
      </div>

      {/* A bar, because a percentage on its own is a number and a bar is a
          feeling of how far there is left to go. */}
      <div className="h-1 w-full bg-muted" role="presentation">
        <div
          className={required.length > 0 ? "h-1 bg-destructive" : "h-1 bg-primary"}
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      {required.length > 0 && (
        <ul className="divide-y">
          {required.map((alert, index) => (
            <li key={`${alert.label}-${alert.studentId ?? "family"}-${index}`}>
              <Link
                href={alert.href}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted"
              >
                <AlertTriangle
                  aria-hidden
                  size={14}
                  className="mt-0.5 shrink-0 text-destructive"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    {alert.label}
                    {alert.studentName && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {alert.studentName}
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] leading-snug text-muted-foreground">
                    {alert.why}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  size={14}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {suggested.length > 0 && (
        <details className="group border-t">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
            <span className="transition-transform group-open:rotate-90">›</span>
            {suggested.length} optional {suggested.length === 1 ? "detail" : "details"} we&apos;d
            find useful
          </summary>
          <ul className="divide-y border-t">
            {suggested.map((alert, index) => (
              <li key={`${alert.label}-${alert.studentId ?? "family"}-${index}`}>
                <Link
                  href={alert.href}
                  className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-muted"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px]">
                      {alert.label}
                      {alert.studentName && (
                        <span className="text-muted-foreground"> · {alert.studentName}</span>
                      )}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-muted-foreground">
                      {alert.why}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

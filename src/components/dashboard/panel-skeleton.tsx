import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a streamed panel shows while its data is still on the wire.
 *
 * The dashboard's slow panels (needs-attention, upcoming payments) used to
 * stream in over `fallback={null}`, so the page composed itself and THEN a
 * card shoved everything down 1–3 seconds later — layout shift on exactly
 * the panels a parent is meant to read first (CJ, 6 Sep 2026: "add loading
 * skeletons where streamed panels pop in").
 *
 * The trade: a family for whom the panel resolves to nothing sees this
 * shimmer collapse instead. That is the smaller harm — the collapse is a
 * named, animated "we were checking", where the pop-in was content moving
 * under a reading eye — and it is why the skeleton stays SHORT: two rows,
 * never a full-height ghost of the card.
 */
export function PanelSkeleton({ title }: { title: string }) {
  return (
    <Card pad={false} aria-busy="true">
      <SectionHeader title={title} inCard />
      <div className="flex flex-col gap-2.5 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </Card>
  );
}

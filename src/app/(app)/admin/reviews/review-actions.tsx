"use client";

import { flagReviewAction, resolveReviewAction } from "@/lib/actions/reviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReviewActions({
  reviewId,
  isFlagged,
  isResolved,
}: {
  reviewId: string;
  isFlagged: boolean;
  isResolved: boolean;
}) {
  if (isFlagged && !isResolved) {
    return (
      <form action={resolveReviewAction.bind(null, reviewId)} className="flex flex-wrap gap-2">
        <Input name="note" placeholder="How was it resolved?" className="min-w-40 flex-1" />
        <Button type="submit" size="sm">
          Mark resolved
        </Button>
      </form>
    );
  }

  if (isResolved) return null;

  return (
    <form action={flagReviewAction.bind(null, reviewId)} className="flex flex-wrap gap-2">
      <Input name="reason" placeholder="Why does this need follow-up?" className="min-w-40 flex-1" />
      <Button type="submit" size="sm" variant="outline">
        Flag for follow-up
      </Button>
    </form>
  );
}

"use client";

import { decidePickupRequestAction } from "@/lib/actions/pickup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DecisionForm({ requestId }: { requestId: string }) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <Input
        name="note"
        placeholder="Note back to the family (optional)"
        className="min-w-48 flex-1"
      />
      <Button
        type="submit"
        size="sm"
        formAction={decidePickupRequestAction.bind(null, requestId, "approved")}
      >
        Approve
      </Button>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        formAction={decidePickupRequestAction.bind(null, requestId, "denied")}
      >
        Deny
      </Button>
    </form>
  );
}

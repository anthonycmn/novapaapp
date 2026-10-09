"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePerformerAction, type PerformanceActionResult } from "@/lib/actions/performance";
import { performerName } from "@/lib/performance/rules";
import type { ActPerformer, PerformanceAct, PerformanceEvent, PerformerCandidate } from "@/lib/performance/types";
import { HeadshotPicker } from "./act-wizard";

/**
 * The family that accepted an invitation fills in its own student's headshot
 * and program details; nothing else of the act is theirs to edit.
 */
export function InviteePerformerForm({
  event,
  act,
  performer,
  candidate,
}: {
  event: PerformanceEvent;
  act: PerformanceAct;
  performer: ActPerformer;
  candidate?: PerformerCandidate;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [row, setRow] = useState({
    bio: performer.bio ?? "",
    pronunciation: performer.pronunciation ?? "",
    programName: performer.programName ?? performerName(performer),
  });
  const run = (work: () => Promise<PerformanceActionResult | void>) =>
    start(async () => {
      setError("");
      const r = await work();
      if (r && !r.ok) setError(r.message ?? "That did not save.");
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          const r = await updatePerformerAction(act.id, performer.id, {
            ...(event.reqBio !== "off" ? { bio: row.bio } : {}),
            pronunciation: row.pronunciation,
            programName: row.programName,
          });
          if (!r.ok) setError(r.message ?? "That did not save.");
          else setSaved(true);
          router.refresh();
        });
      }}
    >
      {event.reqHeadshot !== "off" && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">
            Headshot{" "}
            <span className="text-xs font-normal text-muted-foreground">({event.reqHeadshot === "required" ? "required" : "optional"})</span>
          </div>
          <HeadshotPicker act={act} performer={performer} candidate={candidate} run={run} pending={pending} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="iv-name">Name as it should print in the program</Label>
        <Input id="iv-name" value={row.programName} onChange={(e) => setRow({ ...row, programName: e.target.value })} maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="iv-say">How to say it</Label>
        <Input id="iv-say" value={row.pronunciation} onChange={(e) => setRow({ ...row, pronunciation: e.target.value })} maxLength={160} />
      </div>
      {event.reqBio !== "off" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="iv-bio">Program bio</Label>
          <Textarea id="iv-bio" value={row.bio} onChange={(e) => setRow({ ...row, bio: e.target.value })} maxLength={event.bioMaxChars} rows={4} />
          <p className="text-xs text-muted-foreground">
            {row.bio.length} of {event.bioMaxChars} characters
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}

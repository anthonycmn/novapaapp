"use client";

import { useActionState, useState } from "react";
import { sendPushToAllParentsAction, type PushBroadcastState } from "@/lib/actions/push-broadcast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: PushBroadcastState = { ok: false };

/**
 * Title, message, optional portal link, and the urgent switch. The send
 * asks once before it goes: there is no unsend for a phone that rang.
 */
export function PushComposer({ parentCount }: { parentCount: number | null }) {
  const [state, formAction, pending] = useActionState(sendPushToAllParentsAction, initialState);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function confirmSend(event: React.FormEvent<HTMLFormElement>) {
    const who = parentCount ? `all ${parentCount} parents` : "every parent";
    if (!window.confirm(`Send "${title.trim()}" to ${who}? Phones ring right away.`)) {
      event.preventDefault();
    }
  }

  return (
    <Card>
      <CardContent className="py-4">
        {state.ok && state.message && (
          <p role="status" className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm">
            {state.message}
          </p>
        )}
        {!state.ok && state.message && <FieldError message={state.message} />}

        <form action={formAction} onSubmit={confirmSend} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="push-title">Title</Label>
            <Input
              id="push-title"
              name="title"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rehearsal moved to 6 pm tonight"
              required
            />
            <FieldError message={state.errors?.title} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="push-body">Message</Label>
            <Textarea
              id="push-body"
              name="body"
              maxLength={300}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Same room. Pick-up is now 8:30 pm."
              className="min-h-24"
              required
            />
            <p className="text-xs text-muted-foreground">{body.length}/300</p>
            <FieldError message={state.errors?.body} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="push-url">Opens this page (optional)</Label>
            <Input id="push-url" name="url" placeholder="/schedule" />
            <FieldError message={state.errors?.url} />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="urgent" className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              <span className="font-medium">Urgent</span> - closures and cancellations only.
              Also shows as the red banner on every family&apos;s home page.
            </span>
          </label>

          <div>
            <Button type="submit" disabled={pending || !title.trim() || !body.trim()}>
              {pending ? "Sending…" : "Send to all parents"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

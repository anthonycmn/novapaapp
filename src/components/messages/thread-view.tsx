"use client";

import { useActionState } from "react";
import { replyAction } from "@/lib/actions/messages";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Message } from "@/lib/api/messages/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { cn } from "@/lib/utils";

const initial: FamilyFormState = { ok: false };

export function ReplyForm({ threadId }: { threadId: string }) {
  const bound = replyAction.bind(null, threadId);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <Textarea
        id="reply-body"
        name="body"
        placeholder="Write a reply…"
        className="min-h-24"
        maxLength={5000}
        required
      />
      <FieldError message={state.errors?.body ?? state.errors?._form} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

/** Chat-style transcript. Family messages sit left, staff replies right. */
export function MessageList({
  messages,
  viewerSide,
}: {
  messages: Message[];
  viewerSide: "family" | "staff";
}) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => {
        const mine = message.authorSide === viewerSide;
        return (
          <li
            key={message.id}
            className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5",
                mine
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted"
              )}
            >
              <p className="whitespace-pre-line text-sm">{message.body}</p>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {message.authorName}
              {message.authorSide === "staff" && " · NOVA PA"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

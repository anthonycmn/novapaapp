"use client";

import { useActionState, useMemo, useState } from "react";
import { Phone } from "lucide-react";
import { startThreadAction } from "@/lib/actions/messages";
import type { FamilyFormState } from "@/lib/actions/family";
import { describeRecipient } from "@/lib/api/messages/topics";
import { RECIPIENT_ROLES, type MessageTopic } from "@/lib/api/messages/types";
import type { Student } from "@/lib/api/types";
import { org } from "@/config/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initial: FamilyFormState = { ok: false };

export interface TopicGroup {
  category: string;
  topics: MessageTopic[];
}

/**
 * Choosing what a message is about.
 *
 * A parent knows their problem; they do not know our org chart, and they
 * should not have to. So the choice on offer is the concern — "Refund
 * request", "Allergies or dietary needs" — and the person is the ANSWER we
 * show back, not the question we ask.
 *
 * Showing that answer is the point of the line under the dropdown. It is not
 * decoration: a parent who can see "This goes to Katie Rivers, Director of
 * Health & Safety" before they press send can tell straight away that they
 * picked the wrong thing, which is a correction that otherwise takes two days
 * and a forwarded email.
 */
export function NewThreadForm({
  students,
  groups,
}: {
  students: Student[];
  groups: TopicGroup[];
}) {
  const topics = useMemo(() => groups.flatMap((group) => group.topics), [groups]);
  /** No topics means the bridge is down — fall back to the two roles. */
  const bridged = topics.length > 0;

  const [topicId, setTopicId] = useState("");
  const [role, setRole] = useState("admin");
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(startThreadAction, initial);

  const chosen = topics.find((topic) => topic.routeId === topicId);
  const goesTo = chosen ? describeRecipient(chosen) : "";

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      {bridged ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topicId">What is your message about?</Label>
          <select
            id="topicId"
            name="topicId"
            required
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">Choose one…</option>
            {groups.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.topics.map((topic) => (
                  <option key={topic.routeId} value={topic.routeId}>
                    {topic.topic}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <FieldError message={state.errors?.topicId} />

          {chosen ? (
            <div className="rounded-lg border bg-accent p-3 text-sm text-accent-foreground">
              <p>
                Goes to <span className="font-medium">{goesTo}</span>
              </p>
              {chosen.blurb && (
                <p className="mt-1 text-xs opacity-80">{chosen.blurb}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              We&apos;ll show you who it reaches before you send.
            </p>
          )}
        </div>
      ) : (
        /* The staff directory is unreachable. A shorter menu is a far better
           outcome than a family unable to reach anybody at all. */
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Who should see this?</legend>
          {RECIPIENT_ROLES.map((entry) => (
            <label
              key={entry.value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="recipientRole"
                value={entry.value}
                checked={role === entry.value}
                onChange={() => setRole(entry.value)}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block text-sm font-medium">{entry.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {entry.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {/* The contact tree's own urgency, said plainly. Somebody whose child is
          hurt right now must not be typing — and this is the moment they would
          otherwise start. */}
      {chosen && chosen.priority !== "Standard" && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
          <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <span className="font-medium">
              If this is happening right now, please phone us
            </span>
            {org.tax.phone ? (
              <>
                {" "}
                on{" "}
                <a className="underline" href={`tel:${org.tax.phone.replace(/[^\d+]/g, "")}`}>
                  {org.tax.phone}
                </a>
              </>
            ) : null}
            . Messages are read during office hours, and an emergency needs a
            call to 911 first.
          </span>
        </p>
      )}

      {students.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studentId">About which child? (optional)</Label>
          <select
            id="studentId"
            name="studentId"
            defaultValue=""
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">Not about one child</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.preferredName ?? student.firstName} {student.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" maxLength={150} required />
        <FieldError message={state.errors?.subject} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" className="min-h-40" maxLength={5000} required />
        <FieldError message={state.errors?.body} />
      </div>

      <FieldError message={state.errors?._form} />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : goesTo ? `Send to ${chosen?.recipientName}` : "Send message"}
      </Button>
    </form>
  );
}

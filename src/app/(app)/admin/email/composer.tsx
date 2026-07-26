"use client";

import { useActionState, useState } from "react";
import { sendEmailAction } from "@/lib/actions/email";
import type { FamilyFormState } from "@/lib/actions/family";
import type { EmailTemplate, Production } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState & { sentCount?: number } = { ok: false };

const CATEGORIES = [
  { value: "newsletter", label: "Newsletter" },
  { value: "casting", label: "Casting" },
  { value: "payment", label: "Payment" },
  { value: "fundraising", label: "Fundraising" },
  { value: "critical", label: "Critical (always delivers)" },
];

export function EmailComposer({
  templates,
  productions,
}: {
  templates: EmailTemplate[];
  productions: Production[];
}) {
  const [dirty, setDirty] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("newsletter");
  const [templateId, setTemplateId] = useState("");
  const [state, formAction, pending] = useActionState(sendEmailAction, initialState);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
      setCategory(template.category);
      setDirty(true);
    }
  }

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="templateId" value={templateId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template">Start from a template</Label>
        <select
          id="template"
          value={templateId}
          onChange={(event) => applyTemplate(event.target.value)}
          className="h-11 rounded-lg border border-input bg-card px-3 text-base"
        >
          <option value="">Blank email</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
        />
        <FieldError message={state.errors?.subject} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">Body</Label>
        <Textarea
          id="body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-56 font-mono text-sm"
          required
        />
        <FieldError message={state.errors?.body} />
        <p className="text-xs text-muted-foreground">
          Merge fields: {"{{parent_first}} {{student_first}} {{show_title}} {{call_time}} {{sender_name}} {{org_name}}"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="productionId">Audience</Label>
          <select
            id="productionId"
            name="productionId"
            defaultValue=""
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">All families</option>
            {productions.map((production) => (
              <option key={production.id} value={production.id}>
                {production.title} families
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scheduledFor">Schedule (optional)</Label>
        <Input id="scheduledFor" name="scheduledFor" type="datetime-local" className="w-fit" />
        <p className="text-xs text-muted-foreground">
          Leave blank to send immediately.
        </p>
      </div>

      <FieldError message={state.errors?._form} />
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ {state.sentCount === 1 ? "Test sent to you" : `Queued for ${state.sentCount} recipients`}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" name="mode" value="send" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        <Button type="submit" name="mode" value="test" variant="outline" disabled={pending}>
          Send test to myself
        </Button>
      </div>
    </form>
  );
}

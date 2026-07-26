"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createPostAction } from "@/lib/actions/feed";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Production } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState = { ok: false };

const CATEGORIES = [
  { value: "general", label: "News" },
  { value: "casting", label: "Casting" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "fundraising", label: "Fundraising" },
  { value: "show_week", label: "Show Week" },
  { value: "celebration", label: "Celebration" },
];

export function PostForm({ productions }: { productions: Production[] }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await createPostAction(prev, formData);
      if (result.ok) {
        setDirty(false);
        router.push("/feed");
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title (optional)</Label>
        <Input id="title" name="title" maxLength={150} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">Announcement</Label>
        <Textarea id="body" name="body" className="min-h-40" required />
        <FieldError message={state.errors?.body} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            defaultValue="general"
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
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
            <option value="">Everyone</option>
            {productions.map((production) => (
              <option key={production.id} value={production.id}>
                {production.title} families only
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="linkUrl">Link (optional)</Label>
        <Input id="linkUrl" name="linkUrl" type="url" placeholder="https://…" />
        <FieldError message={state.errors?.linkUrl} />
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="isPinned" className="size-4 accent-[var(--primary)]" />
        Pin to the top of the feed
      </label>

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

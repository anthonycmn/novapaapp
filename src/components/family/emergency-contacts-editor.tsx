"use client";

import { useActionState, useState } from "react";
import { Check, Trash2, UserPlus } from "lucide-react";
import { saveEmergencyContactsAction, type FamilyFormState } from "@/lib/actions/family";
import type { EmergencyContact } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";
import { SectionHeader } from "@/components/ui/section-header";

const initialState: FamilyFormState = { ok: false };

/** A row being edited. A new one has no id until the server gives it one. */
type Draft = { id: string; fullName: string; phone: string; relationship: string };

const blankRow = (): Draft => ({ id: "", fullName: "", phone: "", relationship: "" });

/**
 * Somebody other than a parent we can call.
 *
 * The profile review has always marked a household with none of these as
 * incomplete and pointed the red alert at this page — which then had nowhere to
 * type one. A parent could fill in everything they could see, save, and watch
 * the alert stay red.
 *
 * The whole list posts at once, so removing a row is a save like any other and
 * there is no separate delete that can half-succeed.
 */
export function EmergencyContactsEditor({ contacts }: { contacts: EmergencyContact[] }) {
  const [rows, setRows] = useState<Draft[]>(() =>
    contacts.length > 0
      ? contacts.map((contact) => ({
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          relationship: contact.relationship,
        }))
      : [blankRow()]
  );
  const [state, formAction, pending] = useActionState(
    saveEmergencyContactsAction,
    initialState
  );

  function update(index: number, patch: Partial<Draft>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  return (
    <Card pad={false}>
      <SectionHeader
        title="Emergency contacts"
        inCard
        right={
          <span className="text-[12px] text-muted-foreground">
            Called if we cannot reach you
          </span>
        }
      />

      <form action={formAction} className="flex flex-col gap-4 p-4">
        {rows.map((row, index) => (
          <div key={index} className="flex items-start gap-3">
            <input type="hidden" name="ecId" value={row.id} />

            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ec-name-${index}`}>Name</Label>
                <Input
                  id={`ec-name-${index}`}
                  name="ecName"
                  value={row.fullName}
                  onChange={(event) => update(index, { fullName: event.target.value })}
                  autoComplete="off"
                />
                <FieldError message={state.errors?.[`ec-${index}-fullName`]} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ec-phone-${index}`}>Phone</Label>
                <Input
                  id={`ec-phone-${index}`}
                  name="ecPhone"
                  type="tel"
                  value={row.phone}
                  onChange={(event) => update(index, { phone: event.target.value })}
                  autoComplete="off"
                />
                <FieldError message={state.errors?.[`ec-${index}-phone`]} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ec-rel-${index}`}>Relationship</Label>
                <Input
                  id={`ec-rel-${index}`}
                  name="ecRelationship"
                  value={row.relationship}
                  onChange={(event) => update(index, { relationship: event.target.value })}
                  placeholder="Grandparent, neighbor, aunt…"
                />
                <FieldError message={state.errors?.[`ec-${index}-relationship`]} />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setRows((current) =>
                  current.length === 1
                    ? [blankRow()]
                    : current.filter((_, i) => i !== index)
                )
              }
              aria-label={`Remove ${row.fullName || "this contact"}`}
              className="mt-7 inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted"
            >
              <Trash2 aria-hidden size={14} />
            </button>
          </div>
        ))}

        <FieldError message={state.errors?._form} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save emergency contacts"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((current) => [...current, blankRow()])}
          >
            <UserPlus aria-hidden />
            Add another
          </Button>
          {state.ok && (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-primary">
              <Check aria-hidden size={13} />
              Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  assignRoleAction,
  submitCastingAction,
  unassignRoleAction,
} from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import type { CastingBoard as Board, ShowRole } from "@/lib/api/auditions/types";
import { ROLE_TIERS } from "@/lib/api/auditions/types";
import type { Student } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/forms/field-error";
import { cn } from "@/lib/utils";

const initial: FamilyFormState = { ok: false };

/**
 * Drag a student chip onto a role, or — for keyboard and touch users —
 * tap a student to select them, then tap the role. Both paths call the
 * same server action.
 */
export function CastingBoardView({
  productionId,
  board,
  roles,
  unassigned,
  studentsById,
}: {
  productionId: string;
  board: Board;
  roles: ShowRole[];
  unassigned: Student[];
  studentsById: Record<string, Student>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitState, submitAction, submitting] = useActionState(
    submitCastingAction.bind(null, productionId),
    initial
  );

  const submitted = board.status === "submitted";
  const tierLabel = new Map(ROLE_TIERS.map((tier) => [tier.value, tier.label]));

  const occupants = (roleId: string) =>
    board.entries
      .filter((entry) => entry.roleId === roleId)
      .map((entry) => studentsById[entry.studentId])
      .filter(Boolean);

  function place(roleId: string, studentId: string) {
    startTransition(() => assignRoleAction(productionId, roleId, studentId).then(() => {}));
    setSelected(null);
  }

  function remove(studentId: string) {
    startTransition(() => unassignRoleAction(productionId, studentId).then(() => {}));
  }

  const name = (student: Student) =>
    `${student.preferredName ?? student.firstName} ${student.lastName}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Unassigned tray */}
      <Card className={unassigned.length > 0 ? "border-gold/50" : "border-primary/40"}>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {unassigned.length > 0 ? (
              <>
                <AlertTriangle aria-hidden className="size-4 text-gold" />
                {unassigned.length} student{unassigned.length === 1 ? "" : "s"} still
                need{unassigned.length === 1 ? "s" : ""} a role
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden className="size-4 text-primary" />
                Every student has a role
              </>
            )}
          </p>
          {unassigned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unassigned.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  draggable={!submitted}
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/student-id", student.id)
                  }
                  onClick={() =>
                    setSelected((current) => (current === student.id ? null : student.id))
                  }
                  disabled={submitted || pending}
                  aria-pressed={selected === student.id}
                  className={cn(
                    "min-h-11 cursor-grab rounded-full border px-4 text-sm font-medium",
                    selected === student.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent"
                  )}
                >
                  {name(student)}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <p className="text-xs text-muted-foreground" role="status">
              {name(studentsById[selected])} selected — now tap a role below.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Roles */}
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => {
          const held = occupants(role.id);
          const full = role.capacity !== null && held.length >= role.capacity;
          return (
            <div
              key={role.id}
              onDragOver={(event) => {
                if (!submitted) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const studentId = event.dataTransfer.getData("text/student-id");
                if (studentId && !submitted) place(role.id, studentId);
              }}
              onClick={() => {
                if (selected && !submitted) place(role.id, selected);
              }}
              className={cn(
                "rounded-xl border p-3 transition-colors",
                selected && !submitted && "cursor-pointer border-dashed border-primary",
                full && "bg-muted/50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{role.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tierLabel.get(role.tier)}
                    {role.capacity === null
                      ? ` · group (${held.length})`
                      : full
                        ? " · cast"
                        : " · open"}
                  </p>
                </div>
                <Badge variant={held.length > 0 ? "secondary" : "outline"}>
                  {role.capacity === null ? `${held.length}` : `${held.length}/${role.capacity}`}
                </Badge>
              </div>
              {held.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {held.map((student) => (
                    <li
                      key={student.id}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm"
                    >
                      {name(student)}
                      {!submitted && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            remove(student.id);
                          }}
                          aria-label={`Remove ${name(student)} from ${role.name}`}
                          className="ml-0.5 rounded-full p-1 hover:bg-background"
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {submitted ? (
        <Card className="border-primary/40">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Casting submitted ✓</p>
            <p className="text-muted-foreground">
              Every family has been notified of their child&apos;s role — and only
              their child&apos;s. Playbill confirmations are collecting on the
              responses page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form action={submitAction} className="flex flex-col gap-2">
          <FieldError message={submitState.errors?._form} />
          <Button
            type="submit"
            size="lg"
            disabled={submitting || unassigned.length > 0}
          >
            {submitting ? "Submitting…" : "Submit casting & notify families"}
          </Button>
          {unassigned.length > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Assign every student before submitting — no one gets forgotten.
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Each family will be told their own child&apos;s role only. No cast
            list is shared.
          </p>
        </form>
      )}
    </div>
  );
}

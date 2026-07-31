"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  assignRoleAction,
  assignUnderstudyAction,
  publishUnderstudiesAction,
  submitCastingAction,
  unassignRoleAction,
  unassignUnderstudyAction,
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
        <>
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
          <UnderstudySection
            productionId={productionId}
            board={board}
            roles={roles}
            studentsById={studentsById}
          />
        </>
      ) : (
        <form action={submitAction} className="flex flex-col gap-2">
          <FieldError message={submitState.errors?._form} />
          <Button
            type="submit"
            size="lg"
            // `pending` matters: submitting while an assign/remove refresh is
            // still applying makes React discard the submit action's result —
            // the server processes it but the screen never updates.
            disabled={submitting || pending || unassigned.length > 0}
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

/**
 * Understudy phase — appears only after the board is submitted (per Tony:
 * duplicate the students' tags AFTER all roles are filled). Understudies
 * cover LEAD roles only; holes are the leads still uncovered.
 */
function UnderstudySection({
  productionId,
  board,
  roles,
  studentsById,
}: {
  productionId: string;
  board: Board;
  roles: ShowRole[];
  studentsById: Record<string, Student>;
}) {
  const [answer, setAnswer] = useState<"unanswered" | "yes" | "no">(
    board.understudyEntries.length > 0 || board.understudiesPublishedAt
      ? "yes"
      : "unanswered"
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [publishState, publishAction, publishing] = useActionState(
    publishUnderstudiesAction.bind(null, productionId),
    initial
  );

  const published = Boolean(board.understudiesPublishedAt);
  const leadRoles = roles.filter((role) => role.tier === "lead");
  const name = (student: Student) =>
    `${student.preferredName ?? student.firstName} ${student.lastName}`;

  // Duplicated chips: every student already cast in the show, minus anyone
  // already covering a role (one understudy assignment per student).
  const coveredBy = new Map(board.understudyEntries.map((e) => [e.roleId, e.studentId]));
  const alreadyCovering = new Set(board.understudyEntries.map((e) => e.studentId));
  const castStudentIds = [...new Set(board.entries.map((entry) => entry.studentId))];
  const available = castStudentIds
    .filter((id) => !alreadyCovering.has(id))
    .map((id) => studentsById[id])
    .filter(Boolean);

  const holes = leadRoles.filter((role) => !coveredBy.has(role.id));
  const holdsRole = (roleId: string, studentId: string) =>
    board.entries.some((entry) => entry.roleId === roleId && entry.studentId === studentId);

  function cover(roleId: string, studentId: string) {
    if (holdsRole(roleId, studentId)) return; // can't understudy yourself
    startTransition(() =>
      assignUnderstudyAction(productionId, roleId, studentId).catch(() => {})
    );
    setSelected(null);
  }

  function uncover(studentId: string) {
    startTransition(() =>
      unassignUnderstudyAction(productionId, studentId).catch(() => {})
    );
  }

  if (answer === "no") {
    return (
      <p className="text-sm text-muted-foreground">
        No understudies for this production.{" "}
        <button
          type="button"
          onClick={() => setAnswer("yes")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Changed your mind?
        </button>
      </p>
    );
  }

  if (answer === "unanswered") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold">Are you casting understudies?</p>
          <p className="text-sm text-muted-foreground">
            Understudies cover lead roles only. Families are notified the same
            way — each told only about their own child.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setAnswer("yes")}>
              Yes, cast understudies
            </Button>
            <Button type="button" variant="outline" onClick={() => setAnswer("no")}>
              Not for this production
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div>
          <p className="text-sm font-semibold">Understudies — lead roles only</p>
          <p className="text-xs text-muted-foreground">
            Tap a student, then the lead role they&apos;ll cover. A student can&apos;t
            understudy a role they already hold.
          </p>
        </div>

        {/* Duplicated student chips */}
        {!published && (
          <div className="flex flex-wrap gap-2">
            {available.map((student) => (
              <button
                key={student.id}
                type="button"
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/us-student-id", student.id)
                }
                onClick={() =>
                  setSelected((current) => (current === student.id ? null : student.id))
                }
                disabled={pending}
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
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Everyone in the cast is already covering a lead.
              </p>
            )}
          </div>
        )}
        {selected && (
          <p className="text-xs text-muted-foreground" role="status">
            {name(studentsById[selected])} selected — tap the lead role they&apos;ll cover.
          </p>
        )}

        {/* Lead-role coverage slots */}
        <div className="grid gap-2 sm:grid-cols-2">
          {leadRoles.map((role) => {
            const coveringId = coveredBy.get(role.id);
            const covering = coveringId ? studentsById[coveringId] : undefined;
            const blocked = selected ? holdsRole(role.id, selected) : false;
            return (
              <div
                key={role.id}
                onDragOver={(event) => {
                  if (!published) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const studentId = event.dataTransfer.getData("text/us-student-id");
                  if (studentId && !published) cover(role.id, studentId);
                }}
                onClick={() => {
                  if (selected && !published && !blocked) cover(role.id, selected);
                }}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  selected && !published && !blocked && "cursor-pointer border-dashed border-primary",
                  blocked && "opacity-50",
                  !covering && "border-gold/60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{role.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {blocked
                        ? "Holds this role — pick someone else"
                        : covering
                          ? "Covered"
                          : "No understudy yet"}
                    </p>
                  </div>
                  {!covering && (
                    <Badge variant="outline" className="border-gold text-gold">
                      Hole
                    </Badge>
                  )}
                </div>
                {covering && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm">
                    {name(covering)} (u/s)
                    {!published && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          uncover(covering.id);
                        }}
                        aria-label={`Remove ${name(covering)} as understudy for ${role.name}`}
                        className="ml-0.5 rounded-full p-1 hover:bg-background"
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {leadRoles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This production has no lead-tracked roles.
            </p>
          )}
        </div>

        {/* Holes summary + publish */}
        {published ? (
          <p className="text-sm font-medium text-primary">
            Understudies published ✓ — families notified individually.
            {holes.length > 0 &&
              ` ${holes.length} lead${holes.length === 1 ? "" : "s"} left uncovered: ${holes
                .map((role) => role.name)
                .join(", ")}.`}
          </p>
        ) : (
          <form action={publishAction} className="flex flex-col gap-2">
            {holes.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle aria-hidden className="size-4 text-gold" />
                Holes: {holes.map((role) => role.name).join(", ")} — you can still
                publish with holes.
              </p>
            )}
            <FieldError message={publishState.errors?._form} />
            <Button type="submit" variant="secondary" disabled={publishing || pending}>
              {publishing ? "Publishing…" : "Publish understudies & notify families"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

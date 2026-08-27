import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileSignature,
  Receipt,
} from "lucide-react";
import type { HealthForm, Student } from "@/lib/api/types";
import { ageOn, FSA_AGE_LIMIT } from "@/lib/api/documents/fsa";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Everything this family has signed, or still needs to, in one place.
 *
 * Tony, 17 Aug 2026: "The document vault should hold all of their signed
 * agreements as well as their health forms that they filled out and an
 * automatically generated FSA form… And I want it all filled out right there."
 *
 * So each row carries its own state and its own door: a signed thing says who
 * signed it and when, an unsigned thing says so and links straight to the form.
 * Nothing here is a PDF a parent has to find, print and bring back.
 */

export interface StudentPaperwork {
  student: Student;
  healthForm: HealthForm | null;
  /**
   * Whether this child has CAMP fees — the only kind a Dependent Care FSA
   * reimburses. A term of classes is not care that lets a parent work, and
   * offering a statement for one produces a claim that gets refused.
   */
  hasCampFees: boolean;
}

function healthState(form: HealthForm | null): {
  tone: "good" | "bad";
  label: string;
  detail: string;
} {
  if (!form) {
    return {
      tone: "bad",
      label: "Not started",
      detail: "We cannot take a child into a rehearsal without one for this season.",
    };
  }
  if (!form.signedAt || !form.signedByName?.trim()) {
    return {
      tone: "bad",
      label: "Saved but unsigned",
      detail: "An unsigned form is not a medical authorization. It needs a signature.",
    };
  }
  const expired = Date.parse(`${form.expiresOn}T12:00:00Z`) < Date.now();
  if (expired) {
    return {
      tone: "bad",
      label: "Expired",
      detail: `Signed by ${form.signedByName}, but it lapsed on ${formatDate(`${form.expiresOn}T12:00:00Z`)}.`,
    };
  }
  return {
    tone: "good",
    label: "Signed",
    detail: `${form.signedByName} on ${formatDate(form.signedAt)} · valid to ${formatDate(`${form.expiresOn}T12:00:00Z`)}`,
  };
}

export function AgreementsPanel({
  paperwork,
  periodEnd,
}: {
  paperwork: StudentPaperwork[];
  /** End of the FSA period, for the under-13 test. */
  periodEnd: string;
}) {
  if (paperwork.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card pad={false}>
        <SectionHeader
          title="Agreements & forms"
          inCard
          right={
            <span className="text-[12px] text-muted-foreground">
              Filled in here — nothing to print
            </span>
          }
        />
        <ul className="divide-y">
          {paperwork.map(({ student, healthForm }) => {
            const name = student.preferredName ?? student.firstName;
            const health = healthState(healthForm);
            return (
              <li key={student.id} className="px-4 py-3">
                <p className="text-[13.5px] font-semibold">
                  {name} {student.lastName}
                </p>

                <div className="mt-2 flex flex-col gap-1.5">
                  <PaperRow
                    Icon={FileSignature}
                    title="Health & medical authorization"
                    tone={health.tone}
                    state={health.label}
                    detail={health.detail}
                    href={`/family/students/${student.id}/health`}
                    action={healthForm ? "Review or re-sign" : "Fill it in"}
                  />

                  {/*
                   * No photo-and-media row here.
                   *
                   * Tony, 20 Aug 2026: remove it entirely. It read off
                   * consents.photoUse, which defaults to false and which
                   * nothing in registration ever writes — so a family who had
                   * signed the release was told "Opt-out on file", and a parent
                   * reported exactly that about a child they had consented for.
                   * A panel that invents an opt-out nobody asked for is worse
                   * than a panel that stays quiet, and the release itself lives
                   * on paper at the office. Do not put this back without a
                   * field that is actually populated.
                   */}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <FsaPanel paperwork={paperwork} periodEnd={periodEnd} />
    </div>
  );
}

/**
 * The Dependent Care FSA statement, per child who qualifies.
 *
 * The test is the IRS one and it is done here rather than taken on trust: the
 * dependent must be under 13 for the care period, AND the fee must be for day
 * camp — care that lets a parent work. Tony, 17 Aug 2026: "only camp fees on
 * the FSA statement."
 *
 * Both tests are applied here rather than taken on trust. A statement for a
 * fourteen year old, or one padded with class fees, is not a favor to a family
 * — it is a reimbursement claim that gets refused after they have filed it.
 */
function FsaPanel({
  paperwork,
  periodEnd,
}: {
  paperwork: StudentPaperwork[];
  periodEnd: string;
}) {
  const rows = paperwork.map(({ student, hasCampFees }) => ({
    student,
    hasCampFees,
    age: ageOn(student.dateOfBirth, periodEnd),
  }));
  const eligible = rows.filter((row) => row.age < FSA_AGE_LIMIT && row.hasCampFees);
  const noCamp = rows.filter((row) => row.age < FSA_AGE_LIMIT && !row.hasCampFees);
  const tooOld = rows.filter((row) => row.age >= FSA_AGE_LIMIT);

  if (eligible.length === 0 && tooOld.length === 0 && noCamp.length === 0) return null;

  return (
    <Card pad={false}>
      <SectionHeader
        title="Dependent Care FSA"
        inCard
        right={
          <span className="text-[12px] text-muted-foreground">
            Generated from what you paid
          </span>
        }
      />

      {eligible.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          A Dependent Care FSA reimburses care that lets a parent work — day
          camp. Classes, private lessons and performances do not qualify at any
          age, and nobody in this household has camp fees for the current period.
        </p>
      ) : (
        <ul className="divide-y">
          {eligible.map(({ student, age }) => (
            <li key={student.id}>
              <PaperRow
                Icon={Receipt}
                title={`${student.preferredName ?? student.firstName}'s FSA statement`}
                tone="good"
                state="Ready"
                detail={`Age ${age} at the end of the period. Lists your camp fees only, their dates and what you paid, with our name, address and tax ID.`}
                href={`/family/students/${student.id}/fsa`}
                action="Open statement"
                inset
              />
            </li>
          ))}
        </ul>
      )}

      {tooOld.length > 0 && (
        <p className="border-t px-4 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {tooOld.map((row) => row.student.preferredName ?? row.student.firstName).join(", ")}{" "}
          {tooOld.length === 1 ? "is" : "are"} {FSA_AGE_LIMIT} or older, so their
          fees are not Dependent Care FSA eligible. A child who turns{" "}
          {FSA_AGE_LIMIT} mid-year can still claim the part of the year before
          their birthday — ask the front office and we will work it out with you.
        </p>
      )}
    </Card>
  );
}

function PaperRow({
  Icon,
  title,
  tone,
  state,
  detail,
  href,
  action,
  inset = false,
}: {
  Icon: typeof FileSignature;
  title: string;
  tone: "good" | "bad";
  state: string;
  detail: string;
  href: string;
  action: string;
  inset?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-start gap-2.5 rounded-md border p-3 transition-colors hover:bg-muted ${
        inset ? "m-4 mb-4" : ""
      } ${tone === "bad" ? "border-destructive/40" : ""}`}
    >
      <Icon
        aria-hidden
        size={15}
        className={`mt-0.5 shrink-0 ${tone === "bad" ? "text-destructive" : "text-primary"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium">{title}</span>
          <span
            className={`inline-flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide ${
              tone === "bad" ? "text-destructive" : "text-primary"
            }`}
          >
            {tone === "bad" ? (
              <AlertTriangle aria-hidden size={11} />
            ) : (
              <Check aria-hidden size={11} />
            )}
            {state}
          </span>
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-primary">
        {action}
        <ArrowRight aria-hidden size={12} />
      </span>
    </Link>
  );
}

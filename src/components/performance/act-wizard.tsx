"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Music, Paperclip, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readImageFile } from "@/lib/platform/image-picker";
import {
  acceptTermsAction,
  addGuestAction,
  addOwnPerformerAction,
  attachDataUrlAction,
  attachStoredAction,
  clearFileAction,
  inviteFamilyAction,
  removePerformerAction,
  saveActAction,
  setRehearsalsAction,
  submitActAction,
  updatePerformerAction,
  copyStudentHeadshotAction,
  type PerformanceActionResult,
} from "@/lib/actions/performance";
import {
  formatCapacity,
  formatClock,
  formatEastern,
  formatMinutes,
  formatPlainDate,
  formatRuntime,
  parseRuntime,
  parseVideoLink,
  performerName,
  stepsFor,
  type WizardStep,
} from "@/lib/performance/rules";
import {
  ACT_FORMAT_LABELS,
  ACT_TYPE_LABELS,
  type ActPerformer,
  type ActTech,
  type FileKind,
  type PerformanceAct,
  type PerformanceEvent,
  type PerformerCandidate,
  type Requirement,
} from "@/lib/performance/types";
import { RichText } from "./rich-text";
import { ActStatusChip } from "./status-chip";

/**
 * "Sign up to perform", one step at a time (hub 0097).
 *
 * Every step saves before it moves on, so a parent on a phone can stop on
 * step 4 and come back tomorrow. The server re-checks everything; the rules
 * run here too only so the parent hears about a problem on the step where
 * they can fix it. Anything the event set to Off is not rendered at all.
 */

const STEP_LABELS: Record<WizardStep, string> = {
  performer: "Performer",
  act: "The act",
  performers: "More performers",
  media: "Media",
  tech: "Tech needs",
  program: "Program",
  rehearsals: "Rehearsals",
  review: "Review and submit",
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface WizardProps {
  event: PerformanceEvent;
  act: PerformanceAct;
  candidates: PerformerCandidate[];
  initialStep: WizardStep;
  problem: string | null;
  termsMd5?: string;
  isMock: boolean;
}

function ReqTag({ req }: { req: Requirement }) {
  if (req === "off") return null;
  return (
    <span className={req === "required" ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
      {req === "required" ? "Required" : "Optional"}
    </span>
  );
}

export function ActWizard(props: WizardProps) {
  const { event, act } = props;
  const router = useRouter();
  const steps = useMemo(() => stepsFor(event), [event]);
  const [step, setStep] = useState<WizardStep>(props.initialStep);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  // The status the chip shows: what Submit just returned, until the server
  // refresh brings the same answer back as a prop.
  const [statusNow, setStatusNow] = useState(act.status);
  useEffect(() => setStatusNow(act.status), [act.status]);
  const index = steps.indexOf(step);
  const base = `/family/events/${event.id}/act/${act.id}`;

  function go(next: WizardStep) {
    setError("");
    setNotice("");
    setStep(next);
    // The address bar only. router.replace would be a server navigation, and
    // the route's loading boundary can unmount the wizard mid-step: whatever
    // the parent typed in that moment was lost, and a save pressed during it
    // could hang (found in the 8 Oct 2026 phone walkthrough).
    window.history.replaceState(null, "", `${base}?step=${next}`);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Run a save; on success refresh the server data and optionally move on. */
  function run(work: () => Promise<PerformanceActionResult | void>, then?: WizardStep, okNotice?: string) {
    setError("");
    setNotice("");
    start(async () => {
      const r = await work();
      if (r && !r.ok) {
        setError(r.message ?? "That did not save.");
        return;
      }
      if (okNotice || (r && r.message)) setNotice(okNotice ?? r?.message ?? "");
      if (then) {
        const nextIndex = steps.indexOf(then);
        await saveActAction(act.id, { step: nextIndex });
        go(then);
      }
      router.refresh();
    });
  }

  const next = steps[index + 1];
  const prev = steps[index - 1];
  const shared = { ...props, run, pending, next, setError };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/family/events/${event.id}`} className="text-sm text-muted-foreground hover:underline">
          Back to {event.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{act.title || "New act"}</h1>
          <ActStatusChip status={statusNow} />
        </div>
        {event.signupClosesAt && (
          <p className="text-sm text-muted-foreground">You can make changes until {formatEastern(event.signupClosesAt)}.</p>
        )}
      </div>

      {act.status === "needs_changes" && act.familyNote && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="font-medium">CJ asked for a change</div>
          <p className="whitespace-pre-line">{act.familyNote}</p>
          <p className="mt-1">Make the change, then submit again from the last step.</p>
        </div>
      )}

      <nav aria-label="Sign-up steps" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => (i <= Math.max(act.step, index) || act.status !== "draft" ? go(s) : undefined)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
              s === step
                ? "border-primary bg-primary text-primary-foreground"
                : i <= Math.max(act.step, index) || act.status !== "draft"
                  ? "border-input hover:bg-muted"
                  : "cursor-default border-transparent text-muted-foreground"
            }`}
            aria-current={s === step ? "step" : undefined}
          >
            {i + 1}. {STEP_LABELS[s]}
          </button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>
            Step {index + 1} of {steps.length}: {STEP_LABELS[step]}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "performer" && <PerformerStep {...shared} />}
          {step === "act" && <ActStep {...shared} />}
          {step === "performers" && <PerformersStep {...shared} />}
          {step === "media" && <MediaStep {...shared} />}
          {step === "tech" && <TechStep {...shared} />}
          {step === "program" && <ProgramStep {...shared} />}
          {step === "rehearsals" && <RehearsalsStep {...shared} />}
          {step === "review" && <ReviewStep {...shared} go={go} steps={steps} onSubmitted={(s) => setStatusNow(s as PerformanceAct["status"])} />}

          {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{notice}</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Button type="button" variant="ghost" onClick={() => go(prev)} disabled={pending}>
            <ChevronLeft aria-hidden className="size-4" /> {STEP_LABELS[prev]}
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

type StepProps = WizardProps & {
  run: (work: () => Promise<PerformanceActionResult | void>, then?: WizardStep, okNotice?: string) => void;
  pending: boolean;
  next?: WizardStep;
  setError: (m: string) => void;
};

function ContinueButton({ pending, next, label }: { pending: boolean; next?: WizardStep; label?: string }) {
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {pending ? "Saving..." : label ?? (next ? `Save and continue` : "Save")}
      {!pending && next && <ChevronRight aria-hidden className="size-4" />}
    </Button>
  );
}

function Field({ label, htmlFor, hint, children, tag }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {tag}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ── a. performer ─────────────────────────────────────────────────────────── */

function PerformerStep({ act, candidates, run, pending, next }: StepProps) {
  const lead = act.performers.find((p) => p.kind === "own") ?? act.performers[0];
  const candidate = candidates.find((c) => c.studentId === lead?.studentId);
  const [f, setF] = useState({
    legalName: lead?.legalName ?? "",
    preferredName: lead?.preferredName ?? "",
    ageText: lead?.ageText ?? "",
    gradeText: lead?.gradeText ?? "",
    guardianName: lead?.guardianName ?? "",
    guardianEmail: lead?.guardianEmail ?? "",
    guardianPhone: lead?.guardianPhone ?? "",
  });
  if (!lead) return <p className="text-sm">This act has no performer yet.</p>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updatePerformerAction(act.id, lead.id, f), next);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Filled in from your Parent Portal records. Anything you change here is for this event only and does not change your student&apos;s profile.
      </p>
      {candidate?.enrolledIn.length ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Currently in: </span>
          {candidate.enrolledIn.join(", ")}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal name" htmlFor="pf-legal">
          <Input id="pf-legal" value={f.legalName} onChange={set("legalName")} maxLength={120} required />
        </Field>
        <Field label="Preferred name" htmlFor="pf-pref" hint="If different from the first name">
          <Input id="pf-pref" value={f.preferredName} onChange={set("preferredName")} maxLength={80} />
        </Field>
        <Field label="Age" htmlFor="pf-age">
          <Input id="pf-age" value={f.ageText} onChange={set("ageText")} maxLength={10} inputMode="numeric" />
        </Field>
        <Field label="Grade" htmlFor="pf-grade">
          <Input id="pf-grade" value={f.gradeText} onChange={set("gradeText")} maxLength={20} />
        </Field>
        <Field label="Parent or guardian" htmlFor="pf-gname">
          <Input id="pf-gname" value={f.guardianName} onChange={set("guardianName")} maxLength={120} />
        </Field>
        <Field label="Guardian email" htmlFor="pf-gemail">
          <Input id="pf-gemail" type="email" value={f.guardianEmail} onChange={set("guardianEmail")} maxLength={160} />
        </Field>
        <Field label="Guardian phone" htmlFor="pf-gphone" hint="The event-day crew calls this number if they need you">
          <Input id="pf-gphone" type="tel" value={f.guardianPhone} onChange={set("guardianPhone")} maxLength={40} />
        </Field>
      </div>
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── b. the act ───────────────────────────────────────────────────────────── */

function ActStep({ event, act, run, pending, next }: StepProps) {
  const [f, setF] = useState({
    actType: act.actType ?? (event.actTypes.length === 1 ? event.actTypes[0] : undefined),
    actFormat: act.actFormat ?? (event.actFormats.length === 1 ? event.actFormats[0] : undefined),
    title: act.title ?? "",
    source: act.source ?? "",
    characterName: act.characterName ?? "",
    runtime: act.runtimeSeconds ? formatRuntime(act.runtimeSeconds) : "",
    description: act.description ?? "",
    contentOk: act.contentOk,
  });
  const seconds = parseRuntime(f.runtime);
  const tooLong = seconds && event.maxMinutesPerAct ? seconds > event.maxMinutesPerAct * 60 : false;
  const counting = act.performers.filter((p) => p.inviteStatus !== "declined").length;
  const showCharacter = f.actType === "acting" || f.actType === "song";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.runtime && !seconds) return run(async () => ({ ok: false, message: "Write the running time like 3:30." }));
        if (tooLong) return run(async () => ({ ok: false, message: `Acts can run ${formatMinutes(event.maxMinutesPerAct!)} minutes at most.` }));
        run(
          () =>
            saveActAction(act.id, {
              actType: f.actType,
              actFormat: f.actFormat,
              title: f.title,
              source: f.source,
              characterName: showCharacter ? f.characterName : "",
              runtimeSeconds: seconds,
              description: f.description,
              contentOk: f.contentOk,
            }),
          next
        );
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Type of act</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {event.actTypes.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="actType" value={t} checked={f.actType === t} onChange={() => setF({ ...f, actType: t })} required />
              {ACT_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Format</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {event.actFormats.map((fm) => (
            <label key={fm} className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="actFormat" value={fm} checked={f.actFormat === fm} onChange={() => setF({ ...f, actFormat: fm })} required />
              {ACT_FORMAT_LABELS[fm]}
            </label>
          ))}
        </div>
        {f.actFormat && f.actFormat !== "solo" && counting < 2 && (
          <p className="text-xs text-muted-foreground">You add the other performers on the next step.</p>
        )}
      </fieldset>
      <Field label="Title of the piece" htmlFor="ac-title">
        <Input id="ac-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} required placeholder="Let It Go" />
      </Field>
      <Field label="Where it is from" htmlFor="ac-source" hint="The show, musical, film, composer or choreographer">
        <Input id="ac-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} maxLength={200} placeholder="Frozen, music by Kristen Anderson-Lopez and Robert Lopez" />
      </Field>
      {showCharacter && (
        <Field label="Character" htmlFor="ac-char" hint="If it is from a show">
          <Input id="ac-char" value={f.characterName} onChange={(e) => setF({ ...f, characterName: e.target.value })} maxLength={120} />
        </Field>
      )}
      <Field
        label="Running time"
        htmlFor="ac-runtime"
        hint={event.maxMinutesPerAct ? `Minutes and seconds, like 3:30. This event allows up to ${formatMinutes(event.maxMinutesPerAct)} minutes.` : "Minutes and seconds, like 3:30"}
      >
        <Input id="ac-runtime" value={f.runtime} onChange={(e) => setF({ ...f, runtime: e.target.value })} inputMode="numeric" placeholder="3:30" required aria-invalid={Boolean(tooLong)} />
        {tooLong && <p className="text-xs text-destructive">That is longer than this event allows.</p>}
      </Field>
      <Field label="Short description" htmlFor="ac-desc" hint="A sentence or two for CJ">
        <Textarea id="ac-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={600} rows={3} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={f.contentOk} onChange={(e) => setF({ ...f, contentOk: e.target.checked })} />
        <span>The lyrics and material are appropriate for a family audience.</span>
      </label>
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── c. more performers ───────────────────────────────────────────────────── */

function PerformersStep({ event, act, candidates, run, pending, next }: StepProps) {
  const counting = act.performers.filter((p) => p.inviteStatus !== "declined");
  const cap = formatCapacity(act.actFormat, event.maxPerformersPerAct);
  const room = counting.length < cap;
  const available = candidates.filter((c) => c.eligible && !act.performers.some((p) => p.studentId === c.studentId));
  const [own, setOwn] = useState(available[0]?.studentId ?? "");
  const [email, setEmail] = useState("");
  const [guest, setGuest] = useState({ name: "", age: "", guardianName: "", guardianContact: "" });
  const target =
    act.actFormat === "duet" ? 2 : act.actFormat === "trio" ? 3 : act.actFormat === "small_group" ? "4 to 8" : act.actFormat === "large_group" ? "9 or more" : 1;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {act.actFormat ? `A ${ACT_FORMAT_LABELS[act.actFormat].toLowerCase()} has ${target} performer${target === 1 ? "" : "s"}.` : "Choose the format on the previous step first."}{" "}
        {counting.length} so far.
      </p>
      <ul className="flex flex-col divide-y rounded-md border">
        {act.performers.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{performerName(p)}</span>
              {p.kind === "guest" && <span className="text-xs text-muted-foreground">Guest{p.guestAge !== undefined ? `, age ${p.guestAge}` : ""}</span>}
              {p.kind === "invited" && p.inviteEmail && <span className="text-xs text-muted-foreground">{p.inviteEmail}</span>}
              {p.inviteStatus === "pending" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Waiting to confirm</span>}
              {p.inviteStatus === "confirmed" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Confirmed</span>}
              {p.inviteStatus === "declined" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Declined</span>}
            </span>
            {act.performers.length > 1 && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removePerformerAction(act.id, p.id))} aria-label={`Remove ${performerName(p)}`}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {room && act.actFormat !== "solo" && (
        <>
          {available.length > 0 && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => addOwnPerformerAction(act.id, own));
              }}
            >
              <Label htmlFor="pp-own">Add another of your students</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select id="pp-own" className={selectClass} value={own} onChange={(e) => setOwn(e.target.value)}>
                  {available.map((c) => (
                    <option key={c.studentId} value={c.studentId}>
                      {c.preferredName ?? c.legalName}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline" disabled={pending || !own}>
                  <UserPlus aria-hidden className="size-4" /> Add
                </Button>
              </div>
            </form>
          )}

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await inviteFamilyAction(act.id, email);
                if (r.ok) setEmail("");
                return r;
              });
            }}
          >
            <Label htmlFor="pp-invite">Invite a student from another NOVAPA family</Label>
            <p className="text-xs text-muted-foreground">
              Enter their parent&apos;s email. They confirm in their own Parent Portal and choose which student. Until they do, that place shows as waiting.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="pp-invite" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" required maxLength={160} />
              <Button type="submit" variant="outline" disabled={pending}>
                Send invitation
              </Button>
            </div>
          </form>

          {event.allowGuests && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const r = await addGuestAction(act.id, {
                    name: guest.name,
                    age: guest.age ? Number(guest.age) : undefined,
                    guardianName: guest.guardianName,
                    guardianContact: guest.guardianContact,
                  });
                  if (r.ok) setGuest({ name: "", age: "", guardianName: "", guardianContact: "" });
                  return r;
                });
              }}
            >
              <div className="text-sm font-medium">Add a guest performer from outside NOVAPA</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="Guest name" placeholder="Name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} required maxLength={120} />
                <Input aria-label="Guest age" placeholder="Age" inputMode="numeric" value={guest.age} onChange={(e) => setGuest({ ...guest, age: e.target.value.replace(/\D/g, "") })} maxLength={2} />
                <Input aria-label="Guest's parent or guardian" placeholder="Parent or guardian name" value={guest.guardianName} onChange={(e) => setGuest({ ...guest, guardianName: e.target.value })} maxLength={120} />
                <Input aria-label="Guardian phone or email" placeholder="Guardian phone or email" value={guest.guardianContact} onChange={(e) => setGuest({ ...guest, guardianContact: e.target.value })} maxLength={160} />
              </div>
              <Button type="submit" variant="outline" disabled={pending} className="self-start">
                <UserPlus aria-hidden className="size-4" /> Add guest
              </Button>
            </form>
          )}
        </>
      )}
      {act.actFormat === "solo" && <p className="text-sm text-muted-foreground">A solo has one performer. To add more, change the format on the previous step.</p>}
      {!room && act.actFormat !== "solo" && <p className="text-sm text-muted-foreground">This act has as many performers as its format allows.</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => ({ ok: true }), next);
        }}
      >
        <ContinueButton pending={pending} next={next} label="Continue" />
      </form>
    </div>
  );
}

/* ── d. media ─────────────────────────────────────────────────────────────── */

async function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Big files: sign, PUT straight to storage, then record. Mock mode: a data URL instead. */
async function uploadBigFile(actId: string, kind: FileKind, file: File, onProgress: (n: number) => void): Promise<PerformanceActionResult> {
  const type = file.type || (file.name.toLowerCase().endsWith(".m4a") ? "audio/x-m4a" : file.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : file.name.toLowerCase().endsWith(".wav") ? "audio/wav" : "");
  const res = await fetch("/api/performance/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actId, kind, contentType: type, sizeBytes: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; mock?: boolean; uploadUrl?: string; path?: string };
  if (!res.ok) return { ok: false, message: body.error ?? "Could not prepare the upload." };
  if (body.mock) {
    if (file.size > 4 * 1024 * 1024) return { ok: false, message: "In the preview, files over 4 MB cannot be stored." };
    const typed = new Blob([file], { type });
    return attachDataUrlAction(actId, kind, await readAsDataUrl(typed), file.name);
  }
  const ok = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", body.uploadUrl!);
    xhr.setRequestHeader("Content-Type", type);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!ok) return { ok: false, message: "The upload did not finish. Check the connection and try again." };
  return attachStoredAction(actId, kind, body.path!, file.name);
}

export function HeadshotPicker({ act, performer, candidate, run, pending }: { act: PerformanceAct; performer: ActPerformer; candidate?: PerformerCandidate; run: StepProps["run"]; pending: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
        {performer.headshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={performer.headshotUrl} alt={`${performerName(performer)} headshot`} className="size-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">{performerName(performer)}</div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              run(async () => {
                try {
                  const picked = await readImageFile(file, { maxEdge: 1400, maxBytes: 900 * 1024 });
                  return await attachDataUrlAction(act.id, "headshot", picked.dataUrl, file.name, performer.id);
                } catch (err) {
                  return { ok: false, message: err instanceof Error ? err.message : "Could not read that photo." };
                } finally {
                  setBusy(false);
                }
              });
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={pending || busy} onClick={() => input.current?.click()}>
            {performer.headshotPath ? "Replace photo" : "Upload photo"}
          </Button>
          {!performer.headshotPath && candidate?.headshotUrl && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => copyStudentHeadshotAction(act.id, performer.id))}>
              Use the photo we have
            </Button>
          )}
          {performer.headshotPath && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearFileAction(act.id, "headshot", performer.id))}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or HEIC. We resize it for you.</p>
      </div>
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  const parsed = parseVideoLink(url);
  if (!parsed.ok || !parsed.embedUrl) return null;
  if (parsed.host === "dropbox") {
    return <video src={parsed.embedUrl} controls className="aspect-video w-full rounded-md bg-black" />;
  }
  return (
    <iframe
      src={parsed.embedUrl}
      title="Video preview"
      className="aspect-video w-full rounded-md border"
      allow="encrypted-media; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
}

function MediaStep({ event, act, candidates, run, pending, next }: StepProps) {
  const [video, setVideo] = useState(act.videoUrl ?? "");
  const [trackMode, setTrackMode] = useState(act.trackMode ?? (event.reqTrack !== "off" ? undefined : undefined));
  const [keyTempo, setKeyTempo] = useState(act.keyTempoNotes ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const trackInput = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const videoCheck = video.trim() ? parseVideoLink(video) : null;
  const editablePerformers = act.performers.filter((p) => p.kind === "own" || p.kind === "guest");

  const upload = (kind: FileKind, file: File) =>
    run(async () => {
      setProgress(0);
      try {
        return await uploadBigFile(act.id, kind, file, setProgress);
      } finally {
        setProgress(null);
      }
    });

  const nothingToAsk = event.reqHeadshot === "off" && event.reqVideo === "off" && event.reqTrack === "off" && event.reqSheetMusic === "off";

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (videoCheck && !videoCheck.ok) return run(async () => ({ ok: false, message: videoCheck.message }));
        run(
          () =>
            saveActAction(act.id, {
              ...(event.reqVideo !== "off" ? { videoUrl: video.trim() } : {}),
              ...(event.reqTrack !== "off" ? { trackMode } : {}),
              keyTempoNotes: keyTempo,
            }),
          next
        );
      }}
    >
      {nothingToAsk && <p className="text-sm text-muted-foreground">This event does not ask for any media. Add key or tempo notes if they help.</p>}

      {event.reqHeadshot !== "off" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Headshots</h3>
            <ReqTag req={event.reqHeadshot} />
          </div>
          {editablePerformers.map((p) => (
            <HeadshotPicker key={p.id} act={act} performer={p} candidate={candidates.find((c) => c.studentId === p.studentId)} run={run} pending={pending} />
          ))}
          {act.performers.some((p) => p.kind === "invited") && (
            <p className="text-xs text-muted-foreground">Invited performers&apos; families add their own student&apos;s headshot.</p>
          )}
        </section>
      )}

      {event.reqVideo !== "off" && (
        <section className="flex flex-col gap-2">
          <Field label="Performance video link" htmlFor="md-video" tag={<ReqTag req={event.reqVideo} />} hint="YouTube, Vimeo, Google Drive or Dropbox. Make sure anyone with the link can watch it.">
            <Input id="md-video" type="url" inputMode="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/..." maxLength={500} aria-invalid={videoCheck ? !videoCheck.ok : undefined} />
          </Field>
          {videoCheck && !videoCheck.ok && <p className="text-xs text-destructive">{videoCheck.message}</p>}
          {videoCheck?.ok && <VideoPreview url={video} />}
        </section>
      )}

      {event.reqTrack !== "off" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
            Music <ReqTag req={event.reqTrack} />
          </legend>
          {(
            [
              ["upload", "I'll upload a backing track (MP3, M4A or WAV, up to 25 MB)"],
              ["accompanist", "A live accompanist is needed"],
              ["a_cappella", "A cappella, no music"],
              ["own", "I'll bring my own (instrument or music on the day)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="trackMode" value={value} checked={trackMode === value} onChange={() => setTrackMode(value)} />
              {label}
            </label>
          ))}
          {trackMode === "upload" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={trackInput}
                type="file"
                accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload("track", file);
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => trackInput.current?.click()}>
                <Music aria-hidden className="size-4" /> {act.trackPath ? "Replace track" : "Choose track"}
              </Button>
              {act.trackPath && (
                <>
                  <span className="flex items-center gap-1 text-sm">
                    <Check aria-hidden className="size-4 text-emerald-600" /> {act.trackFilename}
                  </span>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearFileAction(act.id, "track"))}>
                    Remove
                  </Button>
                </>
              )}
              {act.trackUrl && <audio src={act.trackUrl} controls className="w-full" preload="none" />}
            </div>
          )}
        </fieldset>
      )}

      {event.reqSheetMusic !== "off" && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Sheet music</h3>
            <ReqTag req={event.reqSheetMusic} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={sheetInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload("sheet_music", file);
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => sheetInput.current?.click()}>
              <Paperclip aria-hidden className="size-4" /> {act.sheetMusicPath ? "Replace PDF" : "Choose PDF"}
            </Button>
            {act.sheetMusicPath && (
              <>
                {act.sheetMusicUrl ? (
                  <a href={act.sheetMusicUrl} target="_blank" rel="noreferrer" className="text-sm underline-offset-4 hover:underline">
                    {act.sheetMusicFilename}
                  </a>
                ) : (
                  <span className="text-sm">{act.sheetMusicFilename}</span>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearFileAction(act.id, "sheet_music"))}>
                  Remove
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {progress !== null && (
        <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <Field label="Key and tempo notes" htmlFor="md-key" hint="For the accompanist or sound booth, like 'starts in G, slower than the cast recording'">
        <Input id="md-key" value={keyTempo} onChange={(e) => setKeyTempo(e.target.value)} maxLength={300} />
      </Field>
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── e. tech ──────────────────────────────────────────────────────────────── */

function TechStep({ act, run, pending, next }: StepProps) {
  const [t, setT] = useState<ActTech>(act.tech ?? {});
  const text = (k: keyof ActTech, label: string, hint?: string) => (
    <Field label={label} htmlFor={`tc-${k}`} hint={hint}>
      <Input id={`tc-${k}`} value={String(t[k] ?? "")} onChange={(e) => setT({ ...t, [k]: e.target.value })} maxLength={400} />
    </Field>
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveActAction(act.id, { tech: t }), next);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Microphone" htmlFor="tc-mic">
          <select id="tc-mic" className={selectClass} value={t.micType ?? ""} onChange={(e) => setT({ ...t, micType: (e.target.value || undefined) as ActTech["micType"] })}>
            <option value="">Not sure yet</option>
            <option value="handheld">Handheld</option>
            <option value="headset">Headset</option>
            <option value="stand">Mic on a stand</option>
            <option value="none">No microphone</option>
          </select>
        </Field>
        <Field label="How many mics" htmlFor="tc-count">
          <Input id="tc-count" inputMode="numeric" value={t.micCount ?? ""} onChange={(e) => setT({ ...t, micCount: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })} maxLength={2} />
        </Field>
        <Field label="Chairs" htmlFor="tc-chairs">
          <Input id="tc-chairs" inputMode="numeric" value={t.chairs ?? ""} onChange={(e) => setT({ ...t, chairs: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })} maxLength={2} />
        </Field>
      </div>
      {text("props", "Props")}
      {text("setPieces", "Set pieces")}
      {text("lighting", "Lighting notes", "A spotlight, a blackout at the end, anything you have in mind")}
      {text("costumeChanges", "Costume changes")}
      {text("accessibility", "Accessibility needs", "Anything that helps a performer on the day")}
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── f. program ───────────────────────────────────────────────────────────── */

function ProgramStep({ event, act, run, pending, next }: StepProps) {
  const editable = act.performers.filter((p) => p.kind === "own" || p.kind === "guest");
  const [rows, setRows] = useState(
    Object.fromEntries(
      editable.map((p) => [p.id, { bio: p.bio ?? "", pronunciation: p.pronunciation ?? "", programName: p.programName ?? performerName(p) }])
    )
  );
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          for (const p of editable) {
            const r = await updatePerformerAction(act.id, p.id, {
              ...(event.reqBio !== "off" ? { bio: rows[p.id].bio } : {}),
              pronunciation: rows[p.id].pronunciation,
              programName: rows[p.id].programName,
            });
            if (!r.ok) return r;
          }
          return { ok: true };
        }, next);
      }}
    >
      {editable.map((p) => {
        const row = rows[p.id];
        const set = (k: keyof typeof row) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setRows({ ...rows, [p.id]: { ...row, [k]: e.target.value } });
        return (
          <fieldset key={p.id} className="flex flex-col gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{performerName(p)}</legend>
            <Field label="Name as it should print in the program" htmlFor={`pg-name-${p.id}`}>
              <Input id={`pg-name-${p.id}`} value={row.programName} onChange={set("programName")} maxLength={120} />
            </Field>
            <Field label="How to say it" htmlFor={`pg-say-${p.id}`} hint="For the emcee, like 'ah-MAH-rah oh-KAH-for'">
              <Input id={`pg-say-${p.id}`} value={row.pronunciation} onChange={set("pronunciation")} maxLength={160} />
            </Field>
            {event.reqBio !== "off" && (
              <Field label="Program bio" htmlFor={`pg-bio-${p.id}`} tag={<ReqTag req={event.reqBio} />} hint={`${row.bio.length} of ${event.bioMaxChars} characters`}>
                <Textarea id={`pg-bio-${p.id}`} value={row.bio} onChange={set("bio")} maxLength={event.bioMaxChars} rows={4} />
              </Field>
            )}
          </fieldset>
        );
      })}
      {act.performers.some((p) => p.kind === "invited") && (
        <p className="text-xs text-muted-foreground">Invited performers&apos; families fill in their own student&apos;s program details.</p>
      )}
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── g. rehearsals ────────────────────────────────────────────────────────── */

function RehearsalsStep({ event, act, run, pending, next }: StepProps) {
  const [answers, setAnswers] = useState(
    Object.fromEntries(
      event.rehearsals.map((r) => {
        const a = act.rehearsals.find((x) => x.rehearsalId === r.id);
        return [r.id, { available: a ? a.available : undefined, note: a?.conflictNote ?? "" }];
      })
    ) as Record<string, { available?: boolean; note: string }>
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const missing = event.rehearsals.find((r) => r.required && (answers[r.id].available === undefined || (answers[r.id].available === false && !answers[r.id].note.trim())));
        if (missing) return run(async () => ({ ok: false, message: "Answer every required rehearsal, and explain any conflict." }));
        run(
          () =>
            setRehearsalsAction(
              act.id,
              event.rehearsals
                .filter((r) => answers[r.id].available !== undefined)
                .map((r) => ({ rehearsalId: r.id, available: Boolean(answers[r.id].available), conflictNote: answers[r.id].note }))
            ),
          next
        );
      }}
    >
      <p className="text-sm text-muted-foreground">Can every performer in this act make these?</p>
      {event.rehearsals.map((r) => {
        const a = answers[r.id];
        const set = (patch: Partial<typeof a>) => setAnswers({ ...answers, [r.id]: { ...a, ...patch } });
        return (
          <fieldset key={r.id} className="flex flex-col gap-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              {formatPlainDate(r.onDate)}
              {r.startsAt && `, ${formatClock(r.startsAt)}${r.endsAt ? ` to ${formatClock(r.endsAt)}` : ""} ET`}{" "}
              <span className={r.required ? "text-destructive" : "text-muted-foreground"}>({r.required ? "required" : "optional"})</span>
            </legend>
            {(r.place || r.notes) && <p className="text-xs text-muted-foreground">{[r.place, r.notes].filter(Boolean).join(" · ")}</p>}
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name={`rh-${r.id}`} checked={a.available === true} onChange={() => set({ available: true })} /> We can be there
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name={`rh-${r.id}`} checked={a.available === false} onChange={() => set({ available: false })} /> We have a conflict
              </label>
            </div>
            {a.available === false && (
              <Textarea aria-label="Explain the conflict" placeholder="Who cannot come, and why" value={a.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} rows={2} />
            )}
          </fieldset>
        );
      })}
      <ContinueButton pending={pending} next={next} />
    </form>
  );
}

/* ── h. review and submit ─────────────────────────────────────────────────── */

function ReviewStep({ event, act, problem, termsMd5, run, pending, go, steps, onSubmitted }: StepProps & { go: (s: WizardStep) => void; steps: WizardStep[]; onSubmitted: (status: string) => void }) {
  const router = useRouter();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const termsCurrent = Boolean(act.termsAcceptedAt) && act.termsMd5 === termsMd5;
  const lines: Array<[WizardStep, string, React.ReactNode]> = [
    ["act", "Act", [act.title, act.actType && ACT_TYPE_LABELS[act.actType], act.actFormat && ACT_FORMAT_LABELS[act.actFormat], act.runtimeSeconds && formatRuntime(act.runtimeSeconds)].filter(Boolean).join(" · ") || "Not filled in"],
    ["performers", "Performers", act.performers.filter((p) => p.inviteStatus !== "declined").map((p) => `${performerName(p)}${p.inviteStatus === "pending" ? " (waiting to confirm)" : ""}`).join(", ")],
  ];
  if (event.reqVideo !== "off") lines.push(["media", "Video", act.videoUrl ?? "None"]);
  if (event.reqHeadshot !== "off") lines.push(["media", "Headshots", `${act.performers.filter((p) => p.headshotPath).length} of ${act.performers.filter((p) => p.kind !== "invited").length}`]);
  if (event.reqTrack !== "off")
    lines.push(["media", "Music", act.trackMode === "upload" ? act.trackFilename ?? "Track not uploaded yet" : act.trackMode === "accompanist" ? "Live accompanist" : act.trackMode === "a_cappella" ? "A cappella" : act.trackMode === "own" ? "Bringing our own" : "Not chosen"]);
  if (event.reqSheetMusic !== "off") lines.push(["media", "Sheet music", act.sheetMusicFilename ?? "None"]);
  if (event.reqBio !== "off") lines.push(["program", "Program bios", `${act.performers.filter((p) => p.bio).length} written`]);
  if (event.rehearsals.length) lines.push(["rehearsals", "Rehearsals", `${act.rehearsals.length} of ${event.rehearsals.length} answered`]);

  if (submitted) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Check aria-hidden className="size-5 text-emerald-600" /> {submitted === "accepted" ? "You're in the show" : submitted === "waitlisted" ? "You're on the waitlist" : "Submitted"}
        </div>
        <p className="text-sm">
          {submitted === "accepted"
            ? "Everyone who signs up performs, and your act is in."
            : submitted === "waitlisted"
              ? "The lineup is full. If a place opens, your act moves up and you will be told here."
              : "CJ reviews every act. You will see the answer here and on your notification bell."}{" "}
          We emailed you a copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => router.push(`/family/events/${event.id}`)}>
            Back to the event
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col divide-y rounded-md border text-sm">
        {lines.map(([s, label, value], i) => (
          <div key={`${label}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
            {steps.includes(s) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => go(s)}>
                Edit
              </Button>
            )}
          </div>
        ))}
      </dl>

      {event.termsBody && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Terms</h3>
          <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-3">
            <RichText body={event.termsBody} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={termsCurrent}
              disabled={pending}
              onChange={(e) => run(() => acceptTermsAction(act.id, e.target.checked))}
            />
            <span>I have read the terms and accept them for every performer in this act.</span>
          </label>
        </div>
      )}

      {problem && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          Before you submit: {problem}
        </p>
      )}

      {act.status === "accepted" || act.status === "waitlisted" ? (
        <p className="text-sm text-muted-foreground">
          Your act is {act.status === "accepted" ? "in the show" : "on the waitlist"}. Changes you make save as you go, until sign-ups close.
        </p>
      ) : (
      <Button
        type="button"
        disabled={pending || Boolean(problem)}
        className="self-start"
        onClick={() =>
          run(async () => {
            const r = await submitActAction(act.id);
            if (r.ok) {
              setSubmitted(r.status ?? "submitted");
              onSubmitted(r.status ?? "submitted");
            }
            return r;
          })
        }
      >
        {pending ? "Submitting..." : act.status === "draft" ? "Submit" : "Submit changes"}
      </Button>
      )}
      {(act.status === "submitted" || act.status === "needs_changes") && (
        <p className="text-xs text-muted-foreground">
          Your act is already {act.status === "needs_changes" ? "waiting on your change" : "in"}. Changes you save are kept; submitting again tells CJ something changed.
        </p>
      )}
    </div>
  );
}

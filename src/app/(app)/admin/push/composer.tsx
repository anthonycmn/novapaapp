"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { sendPushToAllParentsAction, type PushBroadcastState } from "@/lib/actions/push-broadcast";
import type { PushAudience, PushAudienceOption, PushAudienceOptions, PushReach } from "@/lib/push/broadcast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: PushBroadcastState = { ok: false };

type Kind = "programIds" | "productionIds" | "classIds";

/**
 * Who it goes to, title, message, optional portal link, and the urgent
 * switch. The send asks once before it goes: there is no unsend for a phone
 * that rang.
 *
 * Who (CJ, 10 Oct 2026): every parent, or the families enrolled in the
 * shows, classes, and programs ticked — any of them, not all of them. The
 * reach numbers re-count for the picks, so the button says what it does.
 */
export function PushComposer({
  everyone,
  options,
}: {
  everyone: PushReach | null;
  options: PushAudienceOptions | null;
}) {
  const [state, formAction, pending] = useActionState(sendPushToAllParentsAction, initialState);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"everyone" | "enrolled">("everyone");
  const [picked, setPicked] = useState<Record<Kind, string[]>>({ programIds: [], productionIds: [], classIds: [] });
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [reach, setReach] = useState<PushReach | null>(everyone);
  const [counting, setCounting] = useState(false);

  const audience: PushAudience = useMemo(() => {
    if (mode === "everyone") return {};
    const out: PushAudience = {};
    for (const kind of ["programIds", "productionIds", "classIds"] as Kind[]) {
      if (picked[kind].length) out[kind] = picked[kind];
    }
    return out;
  }, [mode, picked]);
  const pickedCount = picked.programIds.length + picked.productionIds.length + picked.classIds.length;
  const nothingPicked = mode === "enrolled" && pickedCount === 0;

  // Re-count for the picks, a quarter second after the last tick.
  useEffect(() => {
    if (mode === "everyone") {
      setReach(everyone);
      setCounting(false);
      return;
    }
    if (!pickedCount) {
      setReach(null);
      setCounting(false);
      return;
    }
    let cancelled = false;
    setCounting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/push/broadcast?audience=${encodeURIComponent(JSON.stringify(audience))}`);
        const json = (await res.json()) as { reach: PushReach | null };
        if (!cancelled) setReach(json.reach);
      } catch {
        if (!cancelled) setReach(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audience, mode, pickedCount, everyone]);

  // A sent push clears the words; the picks stay, for a follow-up to the same group.
  useEffect(() => {
    if (state.ok) {
      setTitle("");
      setBody("");
    }
  }, [state]);

  function toggle(kind: Kind, id: string) {
    setPicked((current) => ({
      ...current,
      [kind]: current[kind].includes(id) ? current[kind].filter((x) => x !== id) : [...current[kind], id],
    }));
  }

  const who =
    mode === "everyone"
      ? reach ? `all ${reach.parents} parents` : "every parent"
      : reach
        ? `${reach.parents} ${reach.parents === 1 ? "parent" : "parents"} in the families picked`
        : "the families picked";

  function confirmSend(event: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Send "${title.trim()}" to ${who}? Phones ring right away.`)) {
      event.preventDefault();
    }
  }

  const needle = search.trim().toLowerCase();
  const matches = (o: PushAudienceOption) => !needle || o.name.toLowerCase().includes(needle);
  const productions = (options?.productions ?? []).filter(matches);
  const current = productions.filter((o) => !o.past);
  const past = productions.filter((o) => o.past);
  const blocked =
    pending || !title.trim() || !body.trim() || nothingPicked ||
    (mode === "enrolled" && (counting || reach?.parents === 0));

  return (
    <div className="flex flex-col gap-4">
      {reach && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 py-4 text-sm">
            <div>
              <p className="text-2xl font-semibold">{counting ? "…" : reach.parents}</p>
              <p className="text-muted-foreground">parents see it in their bell</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{counting ? "…" : reach.parentsWithPush}</p>
              <p className="text-muted-foreground">
                get it on a phone or computer ({reach.devices} devices)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-4">
          {state.ok && state.message && (
            <p role="status" className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm">
              {state.message}
            </p>
          )}
          {!state.ok && state.message && <FieldError message={state.message} />}

          <form action={formAction} onSubmit={confirmSend} className="flex flex-col gap-4">
            <input type="hidden" name="audience" value={JSON.stringify(audience)} />

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Send to</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={mode === "everyone"}
                  onChange={() => setMode("everyone")}
                  className="size-4 accent-[var(--primary)]"
                />
                Every parent
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={mode === "enrolled"}
                  onChange={() => setMode("enrolled")}
                  disabled={!options}
                  className="size-4 accent-[var(--primary)]"
                />
                Families enrolled in…
                {!options && <span className="text-muted-foreground">(not in demo mode)</span>}
              </label>

              {mode === "enrolled" && options && (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a show or class"
                    aria-label="Find a show or class"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tick as many as you like. A family in any of them gets it once.
                  </p>

                  <PickList
                    heading="Whole programs"
                    items={options.programs.filter(matches)}
                    picked={picked.programIds}
                    onToggle={(id) => toggle("programIds", id)}
                  />
                  <PickList
                    heading="Shows and camps"
                    items={current}
                    picked={picked.productionIds}
                    onToggle={(id) => toggle("productionIds", id)}
                  />
                  <PickList
                    heading="Classes"
                    items={options.classes.filter(matches)}
                    picked={picked.classIds}
                    onToggle={(id) => toggle("classIds", id)}
                  />
                  {past.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => setShowPast((v) => !v)}
                      >
                        {showPast ? "Hide" : "Show"} {past.length} past {past.length === 1 ? "show" : "shows"}
                      </button>
                      {showPast && (
                        <PickList
                          items={past}
                          picked={picked.productionIds}
                          onToggle={(id) => toggle("productionIds", id)}
                        />
                      )}
                    </div>
                  )}
                  {nothingPicked && (
                    <p className="text-sm text-muted-foreground">Tick at least one to send.</p>
                  )}
                  {!nothingPicked && !counting && reach?.parents === 0 && (
                    <p className="text-sm text-muted-foreground">
                      None of those families has a parent portal login yet, so nobody would get it.
                    </p>
                  )}
                </div>
              )}
            </fieldset>

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
                Also shows as the red banner on the home page of every family it reaches.
              </span>
            </label>

            <div>
              <Button type="submit" disabled={blocked}>
                {pending ? "Sending…" : mode === "everyone" ? "Send to all parents" : "Send to the families picked"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PickList({
  heading,
  items,
  picked,
  onToggle,
}: {
  heading?: string;
  items: PushAudienceOption[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {heading && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
      )}
      <ul className="flex max-h-56 flex-col overflow-y-auto">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-accent">
              <input
                type="checkbox"
                checked={picked.includes(item.id)}
                onChange={() => onToggle(item.id)}
                className="size-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {item.families} {item.families === 1 ? "family" : "families"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { ShowScene } from "@/lib/api/auditions/types";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * "What scenes and songs is my child in?"
 *
 * The workbook is organized by scene, but that is not the question a parent
 * arrives with — they arrive with a character. So the character picker is the
 * control, and both tables filter to it at once.
 *
 * "Full Company", "Company" and "Ensemble" are treated as matching every
 * named role as well as themselves: a child playing Toby IS in the Prologue,
 * and a list that hid it would be wrong in a way families would notice on
 * opening night.
 *
 * THE ROWS COME FROM family_hub.show_scenes, not from a file. Tony, 17 Aug
 * 2026: "I want the scene map to be bridged from one to the other so it's the
 * same regardless." The staff portal reads the same table, so a correction made
 * on one side is the correction families see — there is no copy to drift,
 * because there is no copy. Until today this read a 347-line config checked
 * into the app, and the two agreed only because somebody had made them agree
 * once.
 *
 * It takes rows as props rather than fetching: the page is a server component
 * and already has the production, so fetching here would be a second round trip
 * and a loading state for something the server can hand over rendered.
 */

const COMPANY_TERMS = ["full company", "company", "ensemble"];

/** Every character a family might pick, in the workbook's own billing order. */
const CHARACTERS = [
  "Sweeney Todd",
  "Mrs. Lovett",
  "Anthony",
  "Johanna",
  "Toby",
  "Judge Turpin",
  "Beadle",
  "Beggar Woman",
  "Pirelli",
  "Fogg",
  "Ensemble",
  "Young Lucy",
];

function matches(haystack: string, character: string): boolean {
  const text = haystack.toLowerCase();
  const needle = character.toLowerCase();
  if (text.includes(needle)) return true;
  // A named role is also in every company/ensemble number. Ensemble itself
  // should not inherit the named-role rows, so it is excluded here.
  if (needle !== "ensemble" && needle !== "young lucy") {
    return COMPANY_TERMS.some((term) => text.includes(term));
  }
  return false;
}

export function ScenesAndSongs({ rows }: { rows: ShowScene[] }) {
  const [character, setCharacter] = useState<string>("");

  // One table, two lists. kind is what separates a scene from a number, and
  // sortOrder is the workbook's own order for both.
  const allScenes = useMemo(
    () => rows.filter((r) => r.kind === "scene").sort((a, b) => a.sortOrder - b.sortOrder),
    [rows]
  );
  const allNumbers = useMemo(
    () => rows.filter((r) => r.kind === "song").sort((a, b) => a.sortOrder - b.sortOrder),
    [rows]
  );

  const scenes = useMemo(
    () =>
      character
        ? allScenes.filter((s) => matches(s.characters ?? "", character))
        : allScenes,
    [allScenes, character]
  );
  const numbers = useMemo(
    () =>
      character
        ? allNumbers.filter((n) => matches(n.characters ?? "", character))
        : allNumbers,
    [allNumbers, character]
  );

  // A show with no breakdown loaded says so rather than rendering empty tables.
  if (rows.length === 0) return null;

  return (
    <Card pad={false}>
      <SectionHeader
        title="Scenes &amp; songs"
        inCard
        right={
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Show only
            <select
              value={character}
              onChange={(event) => setCharacter(event.target.value)}
              className="rounded-md border bg-card px-2 py-1 text-[13px] text-foreground"
            >
              <option value="">Everyone</option>
              {CHARACTERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="px-4 pt-3 text-[12px] leading-relaxed text-muted-foreground">
        Rehearsals run in <strong className="text-foreground">character blocks</strong>, not
        scene order — when your child is called, everything they own is worked in
        that call. For what a given call works, see the page range on that
        entry in the schedule.
        {character && (
          <>
            {" "}
            Showing {scenes.length} scene{scenes.length === 1 ? "" : "s"} and{" "}
            {numbers.length} number{numbers.length === 1 ? "" : "s"} for{" "}
            <strong className="text-foreground">{character}</strong>, including
            full-company numbers.
          </>
        )}
      </div>

      {/* The compact answer first: which scenes, which numbers. The full
          breakdown is reference material and goes behind a disclosure — a
          parent asking "what is my child in" should not have to read a
          spreadsheet to find out. */}
      <ul className="divide-y">
        {scenes.map((scene) => (
          <li key={scene.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[12px] font-semibold tabular-nums text-gold">
                {scene.act ? `Act ${scene.act} · ` : ""}
                {scene.label ?? scene.name}
              </span>
              {scene.setting && (
                <span className="text-[12px] text-muted-foreground">{scene.setting}</span>
              )}
            </div>
            {scene.numbers && <p className="mt-0.5 text-[13px]">{scene.numbers}</p>}
          </li>
        ))}
      </ul>

      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
          <span className="transition-transform group-open:rotate-90">›</span>
          Full table, with who is in each scene
        </summary>
        <div className="overflow-x-auto p-4 pt-0">
        <table className="w-full min-w-[46rem] text-[12.5px]">
          <thead>
            <tr className="border-b">
              {["Act", "Scene", "Setting", "Numbers", "Who's in it"].map(
                (heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => (
              <tr key={scene.id} className="border-b last:border-0">
                <td className="px-2 py-1.5 font-medium">{scene.act}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {scene.label ?? scene.name}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{scene.setting}</td>
                <td className="px-2 py-1.5">{scene.numbers}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{scene.characters}</td>
                {/* The worked-on dates used to sit here, copied from the
                    workbook. They went stale the moment the schedule moved —
                    9/5 and 10/15 were still listed after those calls were
                    gone. What a call works now lives on the call itself, as
                    the page range the calendar states, which cannot drift
                    because it IS the calendar. Tony, 31 Aug 2026: "page range
                    on each calendar entry is enough." */}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>

      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
          <span className="transition-transform group-open:rotate-90">›</span>
          Every musical number, and who sings it
        </summary>
        <div className="px-4 pb-3">
        <h3 className="sr-only">Musical numbers</h3>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {numbers.map((number) => (
            <li key={number.id} className="flex gap-2 text-[12.5px]">
              <span
                className={
                  number.isCut
                    ? "w-8 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground"
                    : "w-8 shrink-0 tabular-nums text-muted-foreground"
                }
              >
                {number.isCut ? "CUT" : number.numberNo}
              </span>
              <span className="min-w-0">
                {/* The row's name carries its own running number — "10.
                    Johanna (Anthony)" — and that number already has a column
                    of its own to the left, so printing it twice would read as
                    a mistake. */}
                <span className={number.isCut ? "line-through" : "font-medium"}>
                  {number.name.replace(/^\s*\d+\.\s*/, "")}
                </span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {number.characters}
                </span>
              </span>
            </li>
          ))}
        </ul>
        </div>
      </details>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import { SWEENEY_NUMBERS, SWEENEY_SCENES } from "@/config/shows/sweeney-todd";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * "What scenes and songs is my child in?"
 *
 * The workbook is organised by scene, but that is not the question a parent
 * arrives with — they arrive with a character. So the character picker is the
 * control, and both tables filter to it at once.
 *
 * "Full Company", "Company" and "Ensemble" are treated as matching every
 * named role as well as themselves: a child playing Toby IS in the Prologue,
 * and a list that hid it would be wrong in a way families would notice on
 * opening night.
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

export function ScenesAndSongs() {
  const [character, setCharacter] = useState<string>("");

  const scenes = useMemo(
    () =>
      character
        ? SWEENEY_SCENES.filter((s) => matches(s.characters.join(", "), character))
        : SWEENEY_SCENES,
    [character]
  );
  const numbers = useMemo(
    () =>
      character
        ? SWEENEY_NUMBERS.filter((n) => matches(n.sungBy, character))
        : SWEENEY_NUMBERS,
    [character]
  );

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
        that call. Dates below say when material is <em>worked</em>; the schedule
        is the source of truth for who is called when.
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

      {/* The compact answer first: which scenes, which numbers. Nine columns
          of dates is reference material, and it goes behind a disclosure —
          a parent asking "what is my child in" should not have to read a
          spreadsheet to find out. */}
      <ul className="divide-y">
        {scenes.map((scene) => (
          <li key={`${scene.act}-${scene.scene}`} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[12px] font-semibold tabular-nums text-gold">
                Act {scene.act} · {scene.scene}
              </span>
              <span className="text-[12px] text-muted-foreground">{scene.setting}</span>
            </div>
            <p className="mt-0.5 text-[13px]">{scene.numbers.join(" · ")}</p>
          </li>
        ))}
      </ul>

      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
          <span className="transition-transform group-open:rotate-90">›</span>
          Full table, with who is in each scene and the dates it is worked
        </summary>
        <div className="overflow-x-auto p-4 pt-0">
        <table className="w-full min-w-[46rem] text-[12.5px]">
          <thead>
            <tr className="border-b">
              {["Act", "Scene", "Setting", "Numbers", "Who's in it", "Music", "Blocking", "Staging"].map(
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
              <tr key={`${scene.act}-${scene.scene}`} className="border-b last:border-0">
                <td className="px-2 py-1.5 font-medium">{scene.act}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">{scene.scene}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{scene.setting}</td>
                <td className="px-2 py-1.5">{scene.numbers.join("; ")}</td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {scene.characters.join(", ")}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                  {scene.musicCalls}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                  {scene.blocking}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                  {scene.staging}
                </td>
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
            <li key={number.no} className="flex gap-2 text-[12.5px]">
              <span
                className={
                  number.no === "CUT"
                    ? "w-8 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground"
                    : "w-8 shrink-0 tabular-nums text-muted-foreground"
                }
              >
                {number.no}
              </span>
              <span className="min-w-0">
                <span className={number.no === "CUT" ? "line-through" : "font-medium"}>
                  {number.title}
                </span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {number.sungBy}
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

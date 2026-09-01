import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { org } from "@/config/org";
import type { IcalFeed } from "@/config/ical-feeds";
import type { IcalEvent } from "@/lib/ical/parse";

/**
 * Turning one VEVENT into one calendar_events row.
 *
 * Kept apart from the sync itself so it carries no database import, which
 * means these rules — the ones with the sharp edges — are unit-testable.
 */
/**
 * Tags that end a line. Google Calendar's rich-text editor writes one <div>
 * (or a list item) per line and emits no <br> at all, so stripping these
 * without putting the break back collapses a whole description onto one line —
 * and then nothing anchors to ^CALLED or ^Scene:, because there is only ever
 * one line and it starts with the room name.
 *
 * That is not hypothetical: it is why a run of Sweeney calls came back with
 * called_note AND works_note both null while their titles, times and locations
 * parsed perfectly. Content the calendar plainly had, that we could not read.
 */
const BLOCK_TAGS =
  /<\/?(div|p|li|ul|ol|table|thead|tbody|tfoot|tr|td|th|h[1-6]|blockquote|section|article|pre|dl|dt|dd)[^>]*>/gi;

/** Tags that mark up words inside a line and must NOT break it. */
const INLINE_TAGS = /<\/?(b|i|strong|em|u|s|span|a|font|small|sub|sup|code|mark)[^>]*>/gi;

/**
 * The show calendar writes its event descriptions as small HTML documents.
 * Flatten one to plain lines, so the rest of this file can read it.
 *
 * Order matters: breaks first, then inline markup, then any tag left over.
 */
export function descriptionLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(BLOCK_TAGS, "\n")
    .replace(INLINE_TAGS, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    // Curly quotes and dashes arrive numerically and land in song titles, which
    // are matched on their text — &#39; in "Pirelli&#39;s" must not survive.
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface CalledList {
  /** Character names called, in the calendar's own order. */
  called: string[];
  /** How many of the company are called, when the calendar states it. */
  calledCount?: number;
  companyCount?: number;
  /** True when the calendar explicitly says nobody is called. */
  nobodyCalled: boolean;
}

/**
 * Who is called to this call.
 *
 * The calendar states it twice: once per room block ("CALLED (5): …") and once
 * as a whole-event summary after an <hr> ("CALLED — 12 of 12:"). The summary
 * wins, because a two-room rehearsal has two block lists and the family cares
 * whether their child is called to the *event*.
 *
 * Character names are split on the middle dot the calendar uses. Splitting on
 * commas instead would tear "Colton Sorenson, Director" and half the role
 * names in the show apart.
 */
export function calledFrom(description: string): CalledList {
  const lines = descriptionLines(description);
  const empty: CalledList = { called: [], nobodyCalled: false };
  if (lines.length === 0) return empty;

  const hr = lines.indexOf("---");
  const summary = hr >= 0 ? lines.slice(hr + 1) : [];

  // Preferred: the summary footer's "CALLED — 12 of 12:" and the line under it.
  for (let i = 0; i < summary.length; i++) {
    const header = summary[i].match(/^CALLED\s*[—–-]\s*(\d+)\s*of\s*(\d+)\s*:?\s*(.*)$/i);
    if (!header) continue;
    const inline = header[3].trim();
    const names = splitNames(inline || summary[i + 1] || "");
    return {
      called: names,
      calledCount: Number(header[1]),
      companyCount: Number(header[2]),
      nobodyCalled: Number(header[1]) === 0,
    };
  }

  // Fallback: per-block "CALLED (5): …" lines, merged and de-duplicated.
  const merged: string[] = [];
  let sawNoStudentCall = false;
  for (const line of lines) {
    const block = line.match(/^CALLED\s*(?:\(\d+\))?\s*:\s*(.+)$/i);
    if (!block) continue;
    const value = block[1].trim();
    if (/^no student call$/i.test(value) || /^nobody/i.test(value)) {
      sawNoStudentCall = true;
      continue;
    }
    for (const name of splitNames(value)) {
      if (!merged.includes(name)) merged.push(name);
    }
  }
  if (merged.length > 0) return { called: merged, nobodyCalled: false };
  return { ...empty, nobodyCalled: sawNoStudentCall };
}

function splitNames(value: string): string[] {
  return value
    .split(/\s*[·•]\s*/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !/^nobody\b/i.test(name));
}

/** A one-line "called" summary for the row, or undefined when unknown. */
export function calledNoteFor(description: string): string | undefined {
  const { called, nobodyCalled } = calledFrom(description);
  if (nobodyCalled && called.length === 0) return "No student call";
  if (called.length === 0) return undefined;
  return called.join(" · ");
}

/**
 * What this call actually works — the calendar's Scene and Music lines.
 *
 * A parent reading "Rehearsal — Rm A / Rm B" learns nothing; the same event
 * saying "Act I Sc. 1, 2, 5, 8, 9 · No Place Like London; The Worst Pies in
 * London" tells them whether tonight is their child's material.
 */
export function worksNoteFor(description: string): string | undefined {
  const parts: string[] = [];
  for (const line of descriptionLines(description)) {
    const match = line.match(/^(Scene|Music)\s*:\s*(.+)$/i);
    if (!match) continue;
    const value = match[2].trim();
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Performances are what families buy tickets for and plan around, so they are
 * typed differently from calls. "No rehearsal" markers are neither.
 */
export function eventTypeFor(summary: string): string {
  const s = summary.toLowerCase();
  if (/no rehearsal|no call|off book deadline/.test(s)) return "other";
  if (/opening night|matinee|closing performance|performance/.test(s)) return "performance";
  if (/\bevening\b/.test(s) && /curtain/.test(s)) return "performance";
  if (/tech|cue to cue|dry tech|wet tech/.test(s)) return "tech";
  if (/photo|headshot/.test(s)) return "photo_call";
  if (/fitting|costume measure/.test(s)) return "fitting";
  return "rehearsal";
}

export function cleanTitle(summary: string, prefix?: RegExp): string {
  const stripped = prefix ? summary.replace(prefix, "").trim() : summary.trim();
  return stripped || summary;
}

/**
 * The calendar states the call time inside the title — "(call 12:30, curtain
 * 2:00)". Surface it as a real field so the rail can say "be there by".
 *
 * Read as a wall-clock time on the event's own local date, NOT as an offset
 * from the event start. Deriving it by subtracting (curtain − call) from the
 * start assumes the calendar block begins at curtain, and on these matinees it
 * begins at the CALL — which put "be there by" ninety minutes early, i.e. it
 * would have sent families to an empty theatre at 11am for a 12:30 call.
 *
 * Both times are on a 12-hour clock and every performance is afternoon or
 * evening, so an hour under 8 means PM.
 */
export function callTimeFor(summary: string, startIso: string): string | null {
  const call = summary.match(/call\s*(\d{1,2}):(\d{2})/i);
  if (!call) return null;
  const pm = (h: number) => (h < 8 ? h + 12 : h);
  const hours = pm(Number(call[1]));
  const minutes = Number(call[2]);
  if (hours > 23 || minutes > 59) return null;

  const localDate = formatInTimeZone(new Date(startIso), org.timeZone, "yyyy-MM-dd");
  const stamp = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const callAt = fromZonedTime(`${localDate}T${stamp}:00`, org.timeZone);
  if (Number.isNaN(callAt.getTime())) return null;

  // A call must land on the day of the event and no later than its start.
  const start = new Date(startIso).getTime();
  if (callAt.getTime() > start) return null;
  if (start - callAt.getTime() > 12 * 60 * 60_000) return null;
  return callAt.toISOString();
}

/**
 * The address families should actually drive to.
 *
 * The feed owns WHEN a call is; it has been wrong about WHERE. Correcting the
 * stored row does not survive, because the sync rewrites location every hour —
 * so the correction lives on the feed config and is applied on the way in.
 * First matching rule wins; with no rules the feed's own text passes through.
 */
export function locationFor(location: string, feed: IcalFeed): string {
  for (const rule of feed.locationRewrites ?? []) {
    if (rule.when.test(location)) return rule.use;
  }
  return location;
}

export function rowFor(event: IcalEvent, feed: IcalFeed) {
  return {
    type: eventTypeFor(event.summary),
    title: cleanTitle(event.summary, feed.titlePrefix),
    starts_at: event.start,
    ends_at: event.end,
    call_time: callTimeFor(event.summary, event.start),
    location: locationFor(event.location ?? "", feed),
    called_note: calledNoteFor(event.description ?? "") ?? null,
    works_note: worksNoteFor(event.description ?? "") ?? null,
    production_id: feed.productionId,
    external_source: feed.key,
    external_ref: event.uid,
  };
}

/**
 * Turn a call sheet — "Sweeney Todd · Mrs. Lovett · Toby · Ensemble" — into
 * the role ids the family calendar filters on.
 *
 * called_note and role_ids MUST be derived together. The note is re-read from
 * the feed every hour, so if Tony changes who is called and only the prose
 * moved, families would be filtered against yesterday's cast.
 *
 * Matching is exact, then whole-word prefix ("Anthony" → Anthony Hope) and
 * suffix ("Pirelli" → Adolfo Pirelli); anything sharing no word with its role
 * needs an alias on the feed.
 *
 * Returns NULL — meaning "show this to everyone" — when the note is empty, or
 * when ANY token fails to resolve. A note we only half understand is the one
 * case where guessing costs a child their call, so we stop filtering instead.
 */
/**
 * One token against the role list: exact, then whole-word prefix, then suffix.
 * Shared so the strict call sheet and the free-form one can never disagree
 * about what "Todd" or "Judge" means.
 */
export function roleFor(
  token: string,
  roles: ReadonlyArray<Record<string, unknown>>,
  aliases: Record<string, string> = {}
): Record<string, unknown> | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const aliasKey = Object.keys(aliases).find(
    (key) => key.toLowerCase() === trimmed.toLowerCase()
  );
  const want = (aliasKey ? aliases[aliasKey] : trimmed).toLowerCase();
  return (
    roles.find((role) => {
      const name = String(role.name ?? "").toLowerCase();
      return name === want || name.startsWith(`${want} `) || name.endsWith(` ${want}`);
    }) ?? null
  );
}

export function roleIdsFromCalledNote(
  calledNote: unknown,
  roles: ReadonlyArray<Record<string, unknown>>,
  aliases: Record<string, string> = {}
): string[] | null {
  const note = String(calledNote ?? "").trim();
  if (!note) return null;

  const ids = new Set<string>();
  for (const raw of note.split("·")) {
    const token = raw.trim();
    if (!token) continue;
    const hit = roleFor(token, roles, aliases);
    if (!hit) return null;
    ids.add(String(hit.id));
  }
  return ids.size > 0 ? [...ids] : null;
}

/* ── the free-form call sheet ───────────────────────────────────────────── */

/**
 * The OTHER format this calendar is written in.
 *
 * Two styles live side by side. The first fortnight uses a structured template
 * with Scene:/Music:/CALLED: labels. From 10 Sep onward Tony writes his own
 * shorthand, one room block per line:
 *
 *   ROOM A — 7pm - 8pm with Colton: Pages 23 - 25 - Anthony, Judge, Johanna
 *   9am - 10:30am - Pages 81 - 93: God That's Good - Lovett, Todd with Ryyana - The Underground
 *
 * That line carries more than the template does — a time, a page run, the staff
 * member and the room — so it is the template that should give way, not Tony.
 *
 * Characters, staff, rooms, numbers and prose all sit on one line with no
 * labels, so position cannot tell them apart. Classification is by LOOKUP: a
 * token that resolves to a role is a call, one that resolves to a number is
 * music, a configured staff name or a room is neither, and anything left is
 * the description of the work. Unknown tokens are reported, never guessed at.
 */
export interface BlockSheet {
  /** Canonical role names, in the order the sheet says them. */
  called: string[];
  /** Page runs as written, e.g. "23-25". */
  pages: string[];
  /** What the block is working, in the calendar's own words. */
  prose: string[];
  /** Tokens that matched nothing — surfaced so they cannot hide. */
  unknown: string[];
}

/** A time of day, which is never a page number: 7pm, 10:30am. */
const CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;
/** "Pages 23 - 25", "Page 101 - 116", "Pages 7". */
const PAGE_RUN = /\bpages?\s*(\d+)(?:\s*[-–—]\s*(\d+))?/gi;
/** A room, not a thing being worked. */
const ROOM = /^(?:the\s+underground|studio\s+[a-z0-9]+|r(?:oo)?m\.?\s*[a-z0-9]+)$/i;
/** The leading "ROOM A —" label, if the line carries one. */
const ROOM_LABEL = /^r(?:oo)?m\.?\s*[a-z0-9]+\s*[-–—:]\s*/i;

/**
 * "Full Company" is not a character, so it resolved to nobody and left a third
 * of the run unfiltered — a whole-company call showing to everyone by accident
 * rather than on purpose.
 *
 * Matched as a WHOLE token, never a substring, so the 3 Sep call titled
 * "MARKETPLACE company number" is not mistaken for a company call.
 */
const COMPANY_TOKEN =
  /^(?:the\s+)?(?:(?:full|entire|whole|all)\s+)?(?:company|cast)(?:\s+call)?$/i;

/**
 * The same idea in an event TITLE, where only the unambiguous phrase counts.
 *
 * Titles get a much narrower rule than descriptions, and deliberately never
 * yield individual characters: the 12 Sep call is titled "SWEENEY TODD", which
 * is the name of the show, and reading it as a role would call one boy to a
 * rehearsal meant for everybody.
 */
const COMPANY_TITLE = /\b(?:full|entire|whole)\s+(?:company|cast)\b/i;

export function isCompanyCallTitle(title: string): boolean {
  return COMPANY_TITLE.test(title);
}

/** Everyone, in the show's own billing order. */
export function everyRoleName(roles: ReadonlyArray<Record<string, unknown>>): string[] {
  return roles.map((role) => String(role.name ?? "")).filter(Boolean);
}

export function blockSheetFrom(
  description: string,
  roles: ReadonlyArray<Record<string, unknown>>,
  aliases: Record<string, string> = {},
  staffNames: readonly string[] = [],
  songTitles: readonly string[] = []
): BlockSheet {
  const called: string[] = [];
  const pages: string[] = [];
  const prose: string[] = [];
  const unknown: string[] = [];
  const staff = new Set(staffNames.map((name) => name.toLowerCase()));
  const songs = new Set(songTitles.map((title) => songKey(title)));

  for (const raw of descriptionLines(description)) {
    let line = raw.replace(ROOM_LABEL, "");

    // Page runs come out before anything splits on a dash, so "23 - 25" is
    // never mistaken for a separator between two names.
    for (const match of line.matchAll(PAGE_RUN)) {
      pages.push(match[2] ? `${match[1]}-${match[2]}` : match[1]);
    }
    line = line.replace(PAGE_RUN, " ").replace(CLOCK, " ");

    // "with Ryyana" names who is running the room, not who is called. Stop at
    // the first separator: "with Colton: Pages 23 - 25 - Anthony, Judge" must
    // give up Colton and nothing else.
    line = line.replace(/\bwith\s+([^,;:·\-–—]+)/gi, (segment, who: string) => {
      const bare = who.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      return bare && staff.has(bare.toLowerCase()) ? " " : segment;
    });

    for (const piece of line.split(/[,;:&·]|\s[-–—]\s/)) {
      const token = piece.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
      if (!token || ROOM.test(token)) continue;
      if (staff.has(token.toLowerCase())) continue;

      if (COMPANY_TOKEN.test(token)) {
        for (const name of everyRoleName(roles)) {
          if (!called.includes(name)) called.push(name);
        }
        continue;
      }

      const role = roleFor(token, roles, aliases);
      if (role) {
        const name = String(role.name ?? "");
        if (name && !called.includes(name)) called.push(name);
        continue;
      }
      if (songs.has(songKey(token))) {
        if (!prose.includes(token)) prose.push(token);
        continue;
      }

      if (/\s/.test(token)) {
        /*
         * "Anthony & Johanna Vocals" attaches the work to the last name, so
         * the phrase resolves to nothing while a person inside it is plainly
         * called. Look word by word before giving up.
         *
         * This can over-call — a stray "Judge" in a sentence would add Judge
         * Turpin — and that is the direction to err in. An extra call on a
         * family's page is a question; a missing one is a child who never
         * came.
         */
        const words = token.split(/\s+/);
        const hits = words.filter((word) => roleFor(word, roles, aliases));
        if (hits.length > 0) {
          for (const word of hits) {
            const name = String(roleFor(word, roles, aliases)?.name ?? "");
            if (name && !called.includes(name)) called.push(name);
          }
          const rest = words.filter((word) => !hits.includes(word)).join(" ").trim();
          if (rest) prose.push(rest);
          continue;
        }
        prose.push(token);
        continue;
      }
      // A bare word that resolved to nothing is more likely a name we failed
      // to place than a description, so it gets reported rather than shown.
      unknown.push(token);
    }
  }
  return { called, pages, prose, unknown };
}

/** Loose key for comparing a song title written two different ways. */
function songKey(value: string): string {
  return value
    .replace(/^\s*\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

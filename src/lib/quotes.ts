import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";

/**
 * "Tip of the day" — one line about what theatre does for a young person,
 * shown under the mission at the top of the family dashboard.
 *
 * Two rules govern this list:
 *
 *  1. **Nothing is attributed unless it is genuinely attributable.** A quote
 *     card that puts a famous name under a line that person never said is
 *     worse than no name at all, and families screenshot these. Most entries
 *     below are therefore NOVA PA's own words, with no author — which is
 *     honest, and sounds like us. Tony: add real quotes you love with their
 *     `author` filled in; keep house lines authorless.
 *  2. **It is about the child, not the art.** Parents open this between
 *     school pickup and dinner. The line should tell them what the hours in
 *     Studio A are actually building.
 *
 * Selection is deterministic: everyone in the org sees the same line on the
 * same calendar day, in the org's timezone, and it changes at local midnight.
 * The list is intentionally long enough that a family will not see a repeat
 * within a season.
 */
export type Quote = {
  text: string;
  /** Omitted for NOVA PA house lines — see rule 1 above. */
  author?: string;
};

export const QUOTES: readonly Quote[] = [
  { text: "A child who learns to hold a stage learns to hold a room." },
  { text: "Memorizing lines teaches a brain that hard things become easy with repetition." },
  { text: "Theatre is the only sport where everyone on the team has to make everyone else look good." },
  { text: "The kid who was too shy to order at a restaurant in September takes a bow in December." },
  { text: "Rehearsal is where children practice being wrong in front of other people, safely." },
  { text: "Every ensemble member is doing the hardest job in the show: making the whole thing look effortless." },
  { text: "Learning a character teaches empathy faster than being told to have some." },
  { text: "Backstage, a ten-year-old learns that being on time is a way of respecting other people." },
  { text: "Auditions teach a child that hearing 'no' is survivable — a lesson worth more than the part." },
  { text: "Stage crew learn that the work nobody notices is the work holding everything up." },
  { text: "A script is the only homework kids beg to do again." },
  { text: "Theatre kids learn to read a room, and that skill never leaves them." },
  { text: "The moment a child realizes the audience is laughing *with* them is a moment that rewires confidence." },
  { text: "Blocking teaches spatial awareness. Harmony teaches listening. Curtain call teaches grace." },
  { text: "Understudies learn the hardest professional skill there is: be ready for the call that may never come." },
  { text: "Costume fittings teach kids their body is an instrument, not a verdict." },
  { text: "In an ensemble, the quietest child discovers their voice is load-bearing." },
  { text: "Theatre gives a child a group where 'weird' is a compliment." },
  { text: "A missed cue teaches recovery. Recovery is the whole life skill." },
  { text: "Kids who perform learn to speak up in class without being asked twice." },
  { text: "Opening night teaches a child that nerves and excitement feel identical, and you get to choose the name." },
  { text: "Learning choreography is learning that your body can be taught things your mind can't explain." },
  { text: "Every show teaches a child that a deadline is real, and that they can meet one." },
  { text: "Theatre is a place where a child's imagination is treated as a qualification." },
  { text: "The friendships made over a six-week rehearsal process outlast the ones made over six years of hallways." },
  { text: "A young performer learns to take a note without taking it personally — a skill most adults are still working on." },
  { text: "Standing in the wings teaches patience. Stepping out of them teaches courage." },
  { text: "Kids in theatre learn that preparation is what makes spontaneity possible." },
  { text: "Singing in a group teaches a child to hold their own line while hearing everyone else's." },
  { text: "There is no bench in theatre. Everyone plays, every night." },
  { text: "A child learns more about history from wearing the period than from reading the chapter." },
  { text: "Theatre teaches kids that a mistake is only a mistake if you stop." },
  { text: "The first time a child makes an audience cry, they learn that their voice can move people." },
  { text: "Rehearsal turns 'I can't' into 'I can't yet,' one run-through at a time." },
  { text: "Props tables teach organization better than any planner ever has." },
  { text: "A young actor learns that listening is the acting — the rest is just waiting to talk." },
  { text: "Theatre gives children permission to be big, at an age when everything else asks them to be smaller." },
  { text: "Strike night teaches kids that you leave a space better than you found it." },
  { text: "Kids learn from a director's note that feedback is a gift, not a grade." },
  { text: "A stage teaches posture, projection, and eye contact — three things every job interview will ask for." },
  { text: "The ensemble kid who never misses a rehearsal is learning reliability, and it will define their career." },
  { text: "Theatre is rehearsal for being a person: you try it, you get notes, you try it better." },
  { text: "When the lights come up and a child finds their family in the third row, that's the whole reason we do this." },
  { text: "A show closes and a child learns that endings can be celebrated instead of mourned." },
  { text: "Nothing builds a young person's resilience like eight weeks of work for two hours of performance — and finding it worth it." },
  { text: "Kids learn that applause is earned backstage, weeks before anyone claps." },
  {
    text: "All the world's a stage, and all the men and women merely players.",
    author: "William Shakespeare",
  },
  {
    text: "The play's the thing.",
    author: "William Shakespeare",
  },
];

/**
 * Days since the Unix epoch, counted in the org's timezone — so the line
 * changes at midnight in Virginia, not at 7pm or 8pm when UTC rolls over.
 */
function localDayNumber(now: Date): number {
  const [y, m, d] = formatInTimeZone(now, org.timeZone, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * The quote for a given day. Deterministic: same day → same quote for every
 * family, and the sequence walks the list in order rather than jumping at
 * random, so a family that opens the portal two days running never sees the
 * same line twice.
 */
export function quoteOfTheDay(now: Date = new Date()): Quote {
  const index = ((localDayNumber(now) % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[index];
}

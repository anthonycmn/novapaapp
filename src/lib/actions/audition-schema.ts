import { z } from "zod";
import type { FamilyFormState } from "./family";

/**
 * What the submit action hands back to the form.
 *
 * A successful submit no longer stays on the form with a "Saved ✓" — CJ, 8 Sep
 * 2026: show a loading symbol, then go to a page that says the audition has
 * been submitted, with a confirmation code. The action says where; the form
 * takes the family there once the answer arrives, so the spinner it put up is
 * still on screen for the whole trip.
 *
 * Here rather than in actions/auditions.ts for the same reason the schema
 * below is: a "use server" module may export only async functions.
 */
export type AuditionSubmitState = FamilyFormState & {
  /** Set on success: the page to land on. */
  redirectTo?: string;
};

/**
 * Said once, because it is said twice: the form refuses an empty answer before
 * it posts, and the schema refuses it again if anything gets past the browser.
 */
export const NO_TIER_PICKED =
  "Please tick at least one — every size of part they'd be happy with.";

/**
 * What an audition submission must contain.
 *
 * ITS OWN FILE, and not for tidiness. actions/auditions.ts carries "use server",
 * and Next requires every export from such a module to be an async function —
 * exporting a schema from it fails the build with "Server Actions must be async
 * functions", which is exactly how this ended up here.
 *
 * Worth having separately anyway: this is the rule that decides whether a
 * family can press the button, and CJ asked on 4 Sep 2026 to "make sure they
 * can submit the form if anything labeled optional is not submitted". A rule
 * that important should be readable and testable without a server.
 */
export const profileSchema = z.object({
  studentId: z.string().min(1),
  productionId: z.string().min(1),
  /*
   * A set, not one answer — Yin, a parent, 8 Sep 2026: "many kids are open to
   * multiple types of roles."
   *
   * Still at least one. The question is what we should consider them for, and
   * an empty answer to that is not a preference, it is a form that did not
   * post — quite different from the tick-none-if-you-like question above it,
   * where "none of these in particular" is a real thing to say.
   */
  preferenceTiers: z
    .array(z.enum(["ensemble", "featured", "supporting", "lead"]))
    .min(1, { message: NO_TIER_PICKED }),
  previousRoles: z.string().max(2000),
  hopes: z.string().max(2000),
  wantsSpeaking: z.boolean(),
  wantsSinging: z.boolean(),
  wantsDance: z.boolean(),
  songTitle: z.string().max(200),
  /**
   * A link, not an upload — most families put the song on YouTube or Drive.
   * Anything that is not http(s) is refused rather than stored: a stray
   * "javascript:" in a field the directing team will click is not something to
   * find out about later.
   */
  songUrl: z
    .string()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      message: "That doesn't look like a web link — it should start with https://",
    }),
  /*
   * The videos and the resume are links now rather than uploads (2 Sep 2026),
   * so all three get the same treatment as songUrl: http(s) or nothing. The
   * directing team clicks these, and a field they click is not a field to be
   * relaxed about.
   *
   * Storage URLs from the upload era pass unchanged — they are https too — so
   * nobody loses a self-tape or a resume they already sent.
   */
  auditionVideoUrl: z
    .string()
    .max(1000)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      message: "That doesn't look like a web link — it should start with https://",
    }),
  danceVideoUrl: z
    .string()
    .max(1000)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      message: "That doesn't look like a web link — it should start with https://",
    }),
  resumeUrl: z
    .string()
    .max(1000)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      message: "That doesn't look like a web link — it should start with https://",
    }),
  inPersonWithBackingTrack: z.boolean(),
  notes: z.string().max(2000),
  acknowledged: z.literal(true, {
    errorMap: () => ({
      message: "Please confirm you understand that a preference doesn't guarantee a part",
    }),
  }),
});

/**
 * Sweeney Todd: The Demon Barber of Fleet Street (School Edition)
 * Teen Conservatory, autumn 2026.
 *
 * Transcribed from CJ's master workbook
 * (Sweeney_Todd_2026_MASTER_Rehearsal_Tech_and_Performance_Schedule,
 * Drive id 1x84Xqkg…, the copy Tony named on 16 Aug 2026 — there were four
 * near-identical copies and the others are stale).
 *
 * Two things the workbook is explicit about, worth repeating here because
 * they surprise families:
 *
 *  • The schedule is built in CHARACTER BLOCKS, not scene order. When a
 *    performer is called, every number and scene they own is worked in that
 *    call. So "when is my child's scene rehearsed" has several answers.
 *  • The Judge's solo "Johanna (Mea Culpa)" is CUT in the School Edition. It
 *    is listed below as cut rather than omitted, because a family who knows
 *    the show will look for it.
 *
 * Dates are the workbook's own (M/D, 2026). They describe when material is
 * worked — they are not a call sheet. The calendar is the source of truth for
 * who is called when.
 */

export interface SweeneyScene {
  act: "I" | "II";
  scene: string;
  setting: string;
  /** Musical numbers worked in this scene, in order. */
  numbers: string[];
  /** Characters who appear. "Full Company" and "Ensemble" appear verbatim. */
  characters: string[];
  musicCalls: string;
  blocking: string;
  staging: string;
}

export const SWEENEY_SCENES: SweeneyScene[] = [
  {
    act: "I",
    scene: "Prologue",
    setting: "Graveyard / outside Fleet Street",
    numbers: ["The Ballad of Sweeney Todd"],
    characters: ["Full Company"],
    musicCalls: "8/24, 8/29",
    blocking: "8/27",
    staging: "8/31, 9/10",
  },
  {
    act: "I",
    scene: "Sc. 1",
    setting: "London harbour and Fleet Street",
    numbers: ["No Place Like London", "The Barber and His Wife"],
    characters: ["Anthony", "Sweeney Todd", "Beggar Woman"],
    musicCalls: "8/27",
    blocking: "9/5",
    staging: "—",
  },
  {
    act: "I",
    scene: "Sc. 2",
    setting: "Mrs. Lovett's pie shop",
    numbers: ["The Worst Pies in London", "Poor Thing", "My Friends", "Ballad reprise 1"],
    characters: [
      "Mrs. Lovett",
      "Sweeney Todd",
      "Young Lucy (flashback)",
      "Judge Turpin and Beadle (flashback)",
      "Company on reprise",
    ],
    musicCalls: "8/27, 8/29",
    blocking: "9/5, 9/10",
    staging: "8/29",
  },
  {
    act: "I",
    scene: "Sc. 3",
    setting: "Judge Turpin's house and the street outside",
    numbers: ["Green Finch and Linnet Bird", "Ah, Miss", "Johanna (Anthony)"],
    characters: [
      "Johanna",
      "Anthony",
      "Beggar Woman",
      "Judge Turpin",
      "Beadle",
      "Bird Seller (from Ensemble)",
    ],
    musicCalls: "8/24, 8/29",
    blocking: "8/29, 9/5, 9/12, 9/17",
    staging: "9/5",
  },
  {
    act: "I",
    scene: "Sc. 4",
    setting: "St. Dunstan's Marketplace",
    numbers: ["Pirelli's Miracle Elixir", "The Contest", "Ballad reprise 2"],
    characters: ["Sweeney Todd", "Mrs. Lovett", "Toby", "Pirelli", "Beadle", "Ensemble"],
    musicCalls: "8/29, 9/5",
    blocking: "8/29, 9/12",
    staging: "8/29, 9/3, 9/5, 9/10, 9/12, 9/14, 9/17",
  },
  {
    act: "I",
    scene: "Sc. 5",
    setting: "Tonsorial parlor and pie shop",
    numbers: ["Wait", "Ballad reprise 3"],
    characters: ["Mrs. Lovett", "Sweeney Todd", "Toby", "Ensemble"],
    musicCalls: "8/27, 8/29",
    blocking: "9/10, 9/12",
    staging: "8/29",
  },
  {
    act: "I",
    scene: "Sc. 6",
    setting: "Judge Turpin's study",
    numbers: ["Judge's solo “Johanna (Mea Culpa)” is CUT in the School Edition"],
    characters: ["Judge Turpin", "Beadle"],
    musicCalls: "9/3",
    blocking: "8/29, 9/17",
    staging: "9/5",
  },
  {
    act: "I",
    scene: "Sc. 7",
    setting: "Outside the Judge's house / Fleet Street",
    numbers: ["Kiss Me", "Ladies in Their Sensitivities", "Kiss Me (quartet)"],
    characters: ["Johanna", "Anthony", "Judge Turpin", "Beadle"],
    musicCalls: "8/29, 9/3",
    blocking: "8/29, 9/12, 9/17",
    staging: "9/5",
  },
  {
    act: "I",
    scene: "Sc. 8",
    setting: "Tonsorial parlor",
    numbers: ["Pretty Women", "Epiphany"],
    characters: ["Sweeney Todd", "Judge Turpin", "Anthony", "Mrs. Lovett"],
    musicCalls: "8/27, 9/5",
    blocking: "9/12, 10/3, 10/17",
    staging: "9/12",
  },
  {
    act: "I",
    scene: "Sc. 9",
    setting: "Mrs. Lovett's pie shop",
    numbers: ["A Little Priest"],
    characters: ["Sweeney Todd", "Mrs. Lovett"],
    musicCalls: "8/27",
    blocking: "9/10, 9/12",
    staging: "9/12",
  },
  {
    act: "II",
    scene: "Sc. 1",
    setting: "Pie shop and tonsorial parlor, months later",
    numbers: ["God, That's Good!"],
    characters: ["Toby", "Mrs. Lovett", "Sweeney Todd", "Beggar Woman", "Ensemble"],
    musicCalls: "8/31, 9/14",
    blocking: "9/21",
    staging: "9/21",
  },
  {
    act: "II",
    scene: "Sc. 2",
    setting: "Fleet Street, Johanna's window, the parlor",
    numbers: ["Johanna (Act II sequence / quartet)"],
    characters: ["Anthony", "Sweeney Todd", "Johanna", "Beggar Woman"],
    musicCalls: "8/29, 8/31",
    blocking: "9/26",
    staging: "9/25",
  },
  {
    act: "II",
    scene: "Sc. 3",
    setting: "Parlor and seaside fantasy",
    numbers: ["By the Sea"],
    characters: ["Mrs. Lovett", "Sweeney Todd"],
    musicCalls: "8/31",
    blocking: "9/26",
    staging: "9/26",
  },
  {
    act: "II",
    scene: "Sc. 4",
    setting: "Tonsorial parlor",
    numbers: ["Wigmaker Sequence / The Letter"],
    characters: ["Sweeney Todd", "Anthony", "Ensemble quintet"],
    musicCalls: "8/31",
    blocking: "9/25",
    staging: "—",
  },
  {
    act: "II",
    scene: "Sc. 5",
    setting: "Pie shop, parlor and bakehouse",
    numbers: ["Not While I'm Around", "Parlor Songs"],
    characters: ["Toby", "Mrs. Lovett", "Beadle"],
    musicCalls: "9/5",
    blocking: "9/24, 9/26",
    staging: "9/26",
  },
  {
    act: "II",
    scene: "Sc. 6",
    setting: "Fogg's Asylum",
    numbers: ["Fogg's Passacaglia", "City on Fire!"],
    characters: ["Fogg", "Toby", "Johanna", "Anthony", "Ensemble as lunatics"],
    musicCalls: "9/14",
    blocking: "9/26",
    staging: "9/21, 9/24, 9/26",
  },
  {
    act: "II",
    scene: "Sc. 7",
    setting: "Fleet Street",
    numbers: ["Searching", "Beggar Woman's Lullaby"],
    characters: [
      "Sweeney Todd",
      "Mrs. Lovett",
      "Anthony",
      "Johanna",
      "Beggar Woman",
      "Ensemble",
    ],
    musicCalls: "8/29, 8/31",
    blocking: "9/26",
    staging: "9/25",
  },
  {
    act: "II",
    scene: "Sc. 8",
    setting: "Tonsorial parlor",
    numbers: ["The Judge's Return"],
    characters: ["Sweeney Todd", "Judge Turpin", "Beadle"],
    musicCalls: "9/5",
    blocking: "9/26, 10/3, 10/17",
    staging: "9/26",
  },
  {
    act: "II",
    scene: "Sc. 9",
    setting: "The bakehouse",
    numbers: [
      "Final Sequence",
      "Sweeney's death",
      "The Ballad of Sweeney Todd (finale)",
    ],
    characters: ["Full Company", "Young Lucy at the reveal"],
    musicCalls: "8/29, 8/31, 9/14",
    blocking: "9/26, 10/3, 10/17",
    staging: "—",
  },
];

export interface SweeneyNumber {
  /** Workbook number, or "CUT". */
  no: string;
  title: string;
  sungBy: string;
}

export const SWEENEY_NUMBERS: SweeneyNumber[] = [
  { no: "1", title: "Prelude / The Ballad of Sweeney Todd", sungBy: "Company" },
  { no: "2", title: "No Place Like London", sungBy: "Anthony, Sweeney Todd, Beggar Woman" },
  { no: "3", title: "The Barber and His Wife", sungBy: "Sweeney Todd" },
  { no: "4", title: "The Worst Pies in London", sungBy: "Mrs. Lovett" },
  { no: "5", title: "Poor Thing", sungBy: "Mrs. Lovett" },
  { no: "6", title: "My Friends", sungBy: "Sweeney Todd, Mrs. Lovett" },
  { no: "7", title: "The Ballad of Sweeney Todd (reprise 1)", sungBy: "Company" },
  { no: "8", title: "Green Finch and Linnet Bird", sungBy: "Johanna" },
  { no: "9", title: "Ah, Miss", sungBy: "Anthony, Johanna, Beggar Woman" },
  { no: "10", title: "Johanna (Anthony)", sungBy: "Anthony" },
  { no: "11", title: "Pirelli's Miracle Elixir", sungBy: "Toby, Sweeney Todd, Mrs. Lovett, Ensemble" },
  { no: "12", title: "The Contest", sungBy: "Pirelli, Toby" },
  { no: "13", title: "The Ballad of Sweeney Todd (reprise 2)", sungBy: "Company" },
  { no: "14", title: "Wait", sungBy: "Mrs. Lovett" },
  { no: "15", title: "The Ballad of Sweeney Todd (reprise 3)", sungBy: "Ensemble" },
  { no: "16", title: "Kiss Me (part 1)", sungBy: "Johanna, Anthony" },
  { no: "17", title: "Ladies in Their Sensitivities", sungBy: "Beadle, Judge Turpin" },
  { no: "18", title: "Kiss Me (quartet)", sungBy: "Johanna, Anthony, Beadle, Judge Turpin" },
  { no: "19", title: "Pretty Women", sungBy: "Sweeney Todd, Judge Turpin" },
  { no: "20", title: "Epiphany", sungBy: "Sweeney Todd, Mrs. Lovett" },
  { no: "21", title: "A Little Priest", sungBy: "Sweeney Todd, Mrs. Lovett" },
  { no: "22", title: "God, That's Good!", sungBy: "Toby, Mrs. Lovett, Sweeney Todd, Beggar Woman, Ensemble" },
  { no: "23", title: "Johanna (Act II sequence / quartet)", sungBy: "Anthony, Sweeney Todd, Johanna, Beggar Woman" },
  { no: "24", title: "By the Sea", sungBy: "Mrs. Lovett, Sweeney Todd" },
  { no: "25", title: "Wigmaker Sequence / The Letter", sungBy: "Sweeney Todd, Anthony, Ensemble quintet" },
  { no: "26", title: "Not While I'm Around", sungBy: "Toby, Mrs. Lovett" },
  { no: "27", title: "Parlor Songs", sungBy: "Beadle, Mrs. Lovett, Toby" },
  { no: "28", title: "Fogg's Passacaglia", sungBy: "Ensemble as lunatics" },
  { no: "29", title: "City on Fire!", sungBy: "Ensemble as lunatics, Johanna" },
  { no: "30", title: "Searching", sungBy: "Mrs. Lovett, Sweeney Todd, Anthony, Johanna, Beggar Woman" },
  { no: "31", title: "Beggar Woman's Lullaby", sungBy: "Beggar Woman" },
  { no: "32", title: "The Judge's Return", sungBy: "Sweeney Todd, Judge Turpin" },
  { no: "33", title: "Final Sequence / Sweeney's Death", sungBy: "Sweeney Todd, Mrs. Lovett, Toby, Johanna, Anthony" },
  { no: "34", title: "The Ballad of Sweeney Todd (finale)", sungBy: "Company" },
  {
    no: "CUT",
    title: "Johanna (Mea Culpa) — Judge Turpin",
    sungBy: "Not included in the School Edition; not scheduled",
  },
];

/**
 * MTI rehearsal tracks.
 *
 * The code is licensed material. It is rendered only inside the signed-in
 * portal, from a server component, so it never reaches an anonymous visitor
 * or a public bundle — but it is not a secret from our own families, who need
 * it to practise. If MTI reissues it, this is the one line to change.
 *
 * Tony, 16 Aug 2026: students may use this too, provided they are 13 or over
 * — which is the age at which a student gets their own portal account.
 */
export const SWEENEY_REHEARSAL_TRACKS = {
  code: "SWE4513782",
  streamingUrl: "https://player.mtishows.com/rehearsal",
  macAppUrl: "https://player.mtishows.com/macapp",
  options: [
    {
      platform: "iPhone or iPad",
      steps: [
        "Install “MTI Player” from the App Store.",
        "Open it, leave the username blank, and enter the code in the password line. Tap Login.",
        "Tap Shows, then Sweeney Todd, to download the tracks.",
      ],
      note: "Once downloaded you do not need wifi. Airplane mode in rehearsal avoids interference.",
    },
    {
      platform: "Android",
      steps: [
        "Install “MTI Player” from Google Play.",
        "Enter the code in the Rehearsal Code box and tap Login.",
        "Tap Downloads to save the tracks, then Shows → Sweeney Todd to play them.",
      ],
      note: "The Android app is rehearsal tracks only.",
    },
    {
      platform: "Any web browser",
      steps: [
        "Go to player.mtishows.com/rehearsal.",
        "Enter the code under “Streaming Access” and click Stream Tracks.",
      ],
      note: "Streaming needs a strong connection — download to a phone for the rehearsal room.",
    },
  ],
} as const;

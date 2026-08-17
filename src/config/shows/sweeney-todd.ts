/**
 * Sweeney Todd: The Demon Barber of Fleet Street (School Edition)
 * Teen Conservatory, autumn 2026.
 *
 * WHAT USED TO BE HERE, AND WHERE IT WENT.
 *
 * This file carried the whole scene and musical-number breakdown — 347 lines
 * transcribed from CJ's master workbook — and the parent portal rendered it
 * directly. The staff portal, meanwhile, read the same breakdown from
 * family_hub.show_scenes. Two copies of one thing, agreeing only because
 * somebody had made them agree once.
 *
 * Tony, 17 Aug 2026: "I want the scene map to be bridged from one to the other
 * so it's the same regardless." So the rows moved to the database, both
 * portals read that table, and the arrays are gone from here. A correction
 * made on either side is now the correction families see, because there is no
 * second copy to fall out of step.
 *
 * The rehearsal-track access below stays. It is not show breakdown — it is one
 * MTI licence code and the four ways to redeem it, it changes once a
 * production, and it has no row anywhere to live in.
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

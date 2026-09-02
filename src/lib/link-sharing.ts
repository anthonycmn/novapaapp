/**
 * "Will this link open for the directing team?"
 *
 * Tony, 2 Sep 2026: "if using a google link or dropbox link can a pop up
 * notification remind them how to set the viewing properly — can we state that
 * for videos we preferred unlisted youtube videos."
 *
 * The moment we stopped taking uploads, the commonest failure stopped being a
 * dead upload and became a live link nobody but its owner can open. A Drive
 * file is Restricted by default, a YouTube upload defaults to Private, and both
 * look completely normal to the parent who pasted them — the wall only appears
 * to the person on the other end, at eleven at night, the day before casting.
 *
 * So the reminder is keyed off the link they actually pasted, and says the
 * steps for that specific service rather than a general "check your sharing
 * settings", which nobody has ever acted on.
 *
 * A host we do not recognise gets nothing. A hint for a link we cannot give
 * real instructions for is noise, and the field's own text already says to
 * check it opens for somebody who is not signed in as you.
 */

export type LinkHost =
  | "youtube"
  | "drive"
  | "dropbox"
  | "onedrive"
  | "icloud"
  | "other";

/** Which service a pasted link belongs to. */
export function hostOf(url: string): LinkHost | null {
  const value = url.trim().toLowerCase();
  if (!/^https?:\/\//.test(value)) return null;

  let hostname: string;
  try {
    hostname = new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  if (hostname.endsWith("youtube.com") || hostname === "youtu.be") return "youtube";
  if (hostname.endsWith("drive.google.com") || hostname.endsWith("docs.google.com")) {
    return "drive";
  }
  if (hostname.endsWith("dropbox.com")) return "dropbox";
  if (
    hostname.endsWith("onedrive.live.com") ||
    hostname.endsWith("1drv.ms") ||
    hostname.endsWith("sharepoint.com")
  ) {
    return "onedrive";
  }
  if (hostname.endsWith("icloud.com")) return "icloud";
  return "other";
}

export interface SharingReminder {
  /** The one-line heading of the notice. */
  title: string;
  /** What to do, in the words that service uses on its own buttons. */
  steps: string[];
  /**
   * `warn` is for the settings that are wrong BY DEFAULT — a Drive file nobody
   * has shared, a YouTube upload left Private. `info` is a confirmation that
   * the service is a good choice and only needs checking.
   */
  tone: "warn" | "info";
}

const REMINDERS: Record<LinkHost, SharingReminder | null> = {
  youtube: {
    title: "Set it to Unlisted, not Private",
    tone: "warn",
    steps: [
      "A Private video opens for you and nobody else — the team will see nothing.",
      "In YouTube Studio, open the video, then Visibility → Unlisted → Save.",
      "Unlisted keeps it out of search and off your channel; only somebody with this link can watch it.",
    ],
  },
  drive: {
    title: "Google files are private until you share them",
    tone: "warn",
    steps: [
      "Open the file in Drive and press Share.",
      "Under General access, change Restricted to Anyone with the link.",
      "Leave the role as Viewer, then press Copy link and paste that link here.",
    ],
  },
  dropbox: {
    title: "Check the Dropbox link is a view link",
    tone: "warn",
    steps: [
      "Press Share on the file, then Create link (or Copy link if one exists).",
      "Make sure it says Anyone with this link — can view, not Only people invited.",
      "Paste that copied link here rather than the address bar from your own Dropbox.",
    ],
  },
  onedrive: {
    title: "Check the OneDrive link is open to anyone",
    tone: "warn",
    steps: [
      "Press Share, then the settings cog on the link.",
      "Choose Anyone with the link, and leave it as view-only.",
      "Copy that link and paste it here.",
    ],
  },
  icloud: {
    title: "Check the iCloud link is a public share",
    tone: "warn",
    steps: [
      "Use Share → Copy Link on the file, not the address from your own iCloud page.",
      "Make sure access is set to Anyone with the link.",
    ],
  },
  other: null,
};

/** What to tell somebody about the link they just pasted. Null when nothing. */
export function sharingReminder(url: string): SharingReminder | null {
  const host = hostOf(url);
  return host ? REMINDERS[host] : null;
}

/**
 * The house preference for a video, said before anybody pastes anything.
 *
 * Not a rule — a family with the tape already in Drive should not have to
 * re-upload it to YouTube to audition. But unlisted YouTube is the one that
 * plays inline, on a phone, with no sign-in and no download, so it is the one
 * worth asking for first.
 */
export const VIDEO_PREFERENCE =
  "We prefer an unlisted YouTube link: it plays straight away for the team, on any device, with nobody having to sign in or download anything. Drive, Dropbox and iCloud all work too.";

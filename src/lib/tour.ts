/**
 * The portal tour — what a parent is shown around on their first visit.
 *
 * CJ, 11 Sep 2026: "a series of pop up instructions for important
 * information, including shows, star pages, spirit buttons, family profile,
 * Ask Spot, what's on the dashboard, where to find your calendar… a tutorial
 * for when parents log in for the first time, or if they've already logged in,
 * the next time that they log in."
 *
 * ---------------------------------------------------------------------------
 * A tour points at real things
 * ---------------------------------------------------------------------------
 * Every step names the element it is about, by a `data-tour` attribute that
 * sits on the actual sidebar group, the actual stat row, the actual Ask Spot
 * button. The tour dims the page and cuts a window around that element, so
 * "your calendar is here" is said while pointing at it. A step whose element is
 * not on the page — a panel this family took off their dashboard, a tile with
 * nothing to show — falls back to a plain card in the middle of the screen and
 * still says its piece; it never blocks or skips itself.
 *
 * On a phone the menu is behind the hamburger, so the steps about the menu ask
 * the shell to open the drawer first (`menu: true`) and the spotlight lands on
 * the same rows a laptop would show in the sidebar.
 *
 * ---------------------------------------------------------------------------
 * Once per account, not once per browser
 * ---------------------------------------------------------------------------
 * Whether somebody has been shown around lives in family_hub.portal_tours
 * (0083), keyed by user. A parent who took it on their phone is not walked
 * through it again on the laptop that evening. Bump TOUR_VERSION when the tour
 * changes enough that everyone should see it again; nobody sees the same
 * version twice. It can always be replayed from the menu.
 */

export const TOUR_VERSION = 1;

export type TourOutcome = "finished" | "skipped";

export interface TourStep {
  key: string;
  title: string;
  /** Two or three sentences. This is a signpost, not a manual. */
  body: string;
  /**
   * Candidate `data-tour` values, tried in order; the first one that is on the
   * page and visible gets the spotlight. Empty means a centered card.
   */
  anchors: string[];
  /** On a phone, open the navigation drawer before looking for the anchor. */
  menu?: boolean;
  /** An optional way in, shown as a link on the card. */
  link?: { label: string; href: string };
}

export function tourSteps(opts: {
  firstName: string;
  starPagesOpen: boolean;
  spiritButtonsOpen: boolean;
}): TourStep[] {
  const { firstName, starPagesOpen, spiritButtonsOpen } = opts;
  const storeBody = (() => {
    const buttons = spiritButtonsOpen
      ? "Spirit buttons: pick the show, add a photo of your child, and see the button before you order."
      : "Spirit buttons are opening soon — pick the show, add a photo, see the button before you order.";
    const pages = starPagesOpen
      ? "Star pages: a tribute to your performer printed in the playbill, from the whole family."
      : "Star pages — a tribute to your performer printed in the playbill — open closer to the show.";
    return `${buttons} ${pages} Both are here and under Store in the menu, and Your orders keeps the history.`;
  })();

  return [
    {
      key: "welcome",
      title: firstName ? `Welcome, ${firstName}` : "Welcome",
      body: "This is the NOVA PA Parent Portal — one place for your child's schedule, your family's paperwork, and everything we tell you. Give us a minute and you'll know where it all lives.",
      anchors: [],
    },
    {
      key: "stats",
      title: "Where you stand, at a glance",
      body: "The four numbers at the top of the dashboard: when your next show opens, what is owed, what you haven't read yet, and who is enrolled. Each one is a link to the page behind it.",
      anchors: ["stats"],
    },
    {
      key: "week",
      title: "This week",
      body: "Every rehearsal, class and call your children have this week, all in one place. Tap the chip with your child's name on a call to tell us they're coming — or that they can't — and the chip keeps your answer so you can see you told us.",
      anchors: ["week"],
    },
    {
      key: "calendar",
      title: "Your calendar",
      body: "The full calendar is a tap away from the dashboard and from the menu. It has the month view, flags days where two children clash, and lets you subscribe so rehearsals appear in the calendar already on your phone.",
      anchors: ["full-calendar", "nav-schedule"],
      link: { label: "Open the full calendar", href: "/schedule" },
    },
    {
      key: "store",
      title: "Spirit buttons & star pages",
      body: storeBody,
      anchors: ["store", "nav-group-store"],
    },
    {
      key: "menu",
      title: "Everything else is in the menu",
      body: "The menu is grouped by what you're doing: Dashboard, On stage, Your family, Store, and More. A gold number beside a row means something there is waiting for you — an unsigned form stays marked until it's signed.",
      anchors: ["sidebar"],
      menu: true,
    },
    {
      key: "on-stage",
      title: "Shows and classes",
      body: "Shows is your child's production: its calls, its tickets, and its updates. Classes is the same for a weekly class. Auditions and Casting are where role preferences go in and where your child's role comes out.",
      anchors: ["nav-group-on-stage"],
      menu: true,
      link: { label: "Go to Shows", href: "/shows" },
    },
    {
      key: "family",
      title: "Your family profile",
      body: "Guardians, address and emergency contacts live under Family profile — please keep them current, it's who we call. The Document vault holds waivers, forms and receipts. Report an absence and Pickup & drop-off are how you tell us before the day, and Message the office reaches a named person privately.",
      anchors: ["nav-group-your-family"],
      menu: true,
      link: { label: "Check your family profile", href: "/family" },
    },
    {
      key: "notifications",
      title: "What we've told you",
      body: "Every notice we send you is kept under Notifications, and the bell shows how many are unread. Notification settings, under More, is where you choose what reaches your phone and when it stays quiet.",
      anchors: ["bell", "nav-notifications"],
      link: { label: "Notification settings", href: "/notifications/settings" },
    },
    {
      key: "spot",
      title: "Stuck? Ask Spot",
      body: "Spot is in the corner of every page. Ask it where something is and it points you at the right page — it doesn't know anything about your child, so it can't get that wrong. The same button is where you report something that isn't working; those go straight to CJ.",
      anchors: ["spot"],
    },
    {
      key: "done",
      title: "That's the tour",
      body: "You can take it again any time — it's at the bottom of the menu under Show me around, or ask Spot to show you around. Welcome to the company.",
      anchors: [],
    },
  ];
}

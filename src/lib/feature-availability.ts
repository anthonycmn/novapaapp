/**
 * Which parts of the portal are open to families yet.
 *
 * CJ, 4 Sep 2026: "when they click spirit buttons - it says this feature is not
 * yet available - same for star pages."
 *
 * ONE SWITCH, NOT SEVEN EDITS. Spirit buttons and star pages are reachable from
 * the dashboard, from the shop index, and from their own pages, and each of
 * those has a form behind it with a server action behind that. Turning the
 * feature off by deleting the links would leave the actions live and the deep
 * links working; turning it off page by page would mean finding all of them
 * again on the day it comes back. So both readers and writers ask here.
 *
 * Flipping either of these to true is the whole of switching the feature back
 * on — no markup to restore, because none of it was deleted.
 *
 * Not an environment variable, deliberately: this is a product decision with a
 * date on it, not a deployment detail, and it should be visible in the diff
 * that turns it back on rather than in a dashboard nobody reads.
 */
export const FEATURE_AVAILABILITY = {
  /* CJ, 5 Sep 2026: "Turn spirit buttons on" — opened the same day the cutout
     designer landed (hub 0066). */
  spiritButtons: true,
  starPages: false,
  /* CJ, 4 Sep 2026: "when I click photos tab in the nav menu - it should not be
     available yet." */
  photos: false,
} as const;

export type PortalFeature = keyof typeof FEATURE_AVAILABILITY;

export function isFeatureOpen(feature: PortalFeature): boolean {
  return FEATURE_AVAILABILITY[feature];
}

/** What a family is told, in the same words wherever they meet it. */
export const FEATURE_COPY: Record<
  PortalFeature,
  { title: string; body: string }
> = {
  spiritButtons: {
    title: "Spirit buttons are not yet available",
    body: "We are still getting these ready. When they open you will be able to pick a show, add a photo, and see the button before you order — we will let you know.",
  },
  starPages: {
    title: "Star pages are not yet available",
    body: "We are still getting these ready. When they open you will be able to write a playbill tribute to your performer — we will let you know.",
  },
  photos: {
    title: "Photos are not yet available",
    body: "We are still getting these ready. When they open you will be able to see the galleries from your child's show, and the photos they are in — we will let you know.",
  },
};

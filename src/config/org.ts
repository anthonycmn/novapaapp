/**
 * Organization-level configuration. All external URLs and org identity live
 * here — never hard-code these in components.
 *
 * NOTE: The primary public domain needs confirmation from the org
 * (see NEEDS-FROM-TONY.md #9). Both candidate domains are recorded here.
 */
export const org = {
  name: "Northern Virginia Performing Arts",
  shortName: "NOVA PA",
  programBrand: "Broadway Bound",
  appName: "NOVA PA Family Hub",

  /** Primary public website. */
  websiteUrl: "https://www.northernvirginiaperformingarts.org",
  /** Alternate/secondary brand domain — confirm which is primary. */
  altWebsiteUrl: "https://www.broadwayboundnova.org",

  /** BookTix ticketing storefront. */
  ticketsUrl: "https://novapa.booktix.com",

  /** SmugMug organization gallery root (Phase 6). */
  smugmugUrl: "https://novapa.smugmug.com",

  /** All timestamps are stored UTC and displayed in this zone. */
  timeZone: "America/New_York",

  supportEmail: "info@northernvirginiaperformingarts.org",
} as const;

export type OrgConfig = typeof org;

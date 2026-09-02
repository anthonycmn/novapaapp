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
  /**
   * Tony, 2026-08-15: "Parents will live in a parent portal not an app."
   * This is the product's name everywhere a family sees it — sign-in, tab
   * title, PWA manifest. The install prompt went with the old name: the
   * portal is a website you visit, not an app you're nagged to install
   * (it still works installed for anyone who chooses to, but we don't ask).
   */
  appName: "NOVA PA Parent Portal",

  /**
   * The organization's mission statement, shown at the top of every family's
   * dashboard. The capitalization is deliberate and load-bearing — "impACTing"
   * puts ACT inside the word. Never sentence-case or title-case this string.
   */
  mission: "impACTing Lives One Story At a Time",

  /** Primary public website. */
  websiteUrl: "https://www.northernvirginiaperformingarts.org",
  /** Alternate/secondary brand domain — confirm which is primary. */
  altWebsiteUrl: "https://www.broadwayboundnova.org",

  /** BookTix ticketing storefront. */
  ticketsUrl: "https://novapa.booktix.com",

  /**
   * Where a family reads all of this. The same default the coaching notifier
   * uses, so a link in an email and a link in a notification go to one place.
   */
  portalUrl: "https://portal.novapa.org",

  /** The logo, absolute, because an email cannot resolve a site-relative path. */
  logoUrl: "https://portal.novapa.org/brand/novapa-logo.png",

  /**
   * The phone, as a tel: link. The number itself lives in `tax.phone` and is
   * not repeated here -- one number, one place. Tony, 2 Sep 2026: "make the
   * phone number ... for all".
   */
  get phoneHref(): string {
    return `tel:+1${org.tax.phone.replace(/\D/g, "")}`;
  },

  /**
   * Goes on every outbound email, and it is not a per-message choice.
   * Tony, 2 Sep 2026: "add this as the confidentiality clause - do not make it
   * optional". So it is rendered by the shell rather than passed in, which is
   * the only way a caller cannot forget it.
   */
  confidentialityNotice:
    "CONFIDENTIALITY NOTICE: This email, including any attachments, may contain " +
    "confidential or privileged information intended solely for the use of the " +
    "individual or entity to whom it is addressed. If you are not the intended " +
    "recipient, please notify the sender immediately by reply email, permanently " +
    "delete this message and any attachments, and do not review, copy, distribute, " +
    "or disclose its contents. Unauthorized use or disclosure is prohibited.",

  /** SmugMug organization gallery root (Phase 6). */
  smugmugUrl: "https://novapa.smugmug.com",

  /** All timestamps are stored UTC and displayed in this zone. */
  timeZone: "America/New_York",

  supportEmail: "info@novapa.org",

  /**
   * Details printed on Dependent Care FSA statements. A family's FSA
   * administrator will reject a claim without the provider's taxpayer ID,
   * so these MUST be filled in before the statement is usable
   * (NEEDS-FROM-TONY.md #14). The FSA page shows a visible warning while
   * any of them is still a placeholder rather than printing a form that
   * looks official but will bounce.
   */
  tax: {
    /**
     * The registered entity, not the trading name. NOVAPA operates as
     * "CJ Creative, LLC d/b/a Northern Virginia Performing Arts" on the
     * handbooks and the contractor agreement, and an FSA administrator
     * matches the EIN against the legal name — so this must be the LLC.
     */
    legalName: "CJ Creative, LLC d/b/a Northern Virginia Performing Arts",
    /**
     * Employer Identification Number, formatted 12-3456789.
     * Given by Tony, 17 Aug 2026.
     */
    ein: "47-4903843",
    // Settled 15 Aug 2026: four addresses were in circulation across the
    // portal, the workbook, the website and outbound email. CJ ruled on this
    // one, and it now matches the staff portal's documents and contracts.
    addressLine1: "18945 Conference Center Drive",
    addressLine2: "Plaza C",
    city: "Leesburg",
    state: "VA",
    zip: "20176",
    phone: "(571) 571-2120",
    /**
     * Who signs the statement. Tony, 17 Aug 2026: "Todd signs it" — which
     * matches the title already here, and the INVOICE_TO mailbox on the staff
     * portal. Full name rather than "Todd", because this line is a
     * certification an FSA administrator reads alongside the EIN.
     */
    signatoryName: "Todd Cimino-Johnson",
    signatoryTitle: "Chief Financial Officer",
  },
} as const;

/** True when the org's tax details are complete enough to issue a statement. */
export function taxDetailsComplete(): boolean {
  const { ein, addressLine1, zip, signatoryName } = org.tax;
  return Boolean(ein && addressLine1 && zip && signatoryName);
}

export type OrgConfig = typeof org;

/**
 * The HTML shell every family email is poured into.
 *
 * Written 27 Aug 2026. Before this, the portal could only send plain text:
 * `ResendEmailProvider` posted a `text:` field and nothing else, so there was
 * no "house format" to reuse — `family_hub.email_sends` was empty and no
 * family had ever received mail from this system.
 *
 * Constraints that shaped it, none of them negotiable in email:
 *
 *  - **Tables, not flexbox.** Outlook renders through Word's engine. Grid and
 *    flex collapse; nested tables do not.
 *  - **Inline styles.** Gmail strips <style> blocks on forwarded mail, which
 *    is exactly what a parent does with a rehearsal schedule. The one <style>
 *    block here carries only the dark-mode and small-screen overrides that
 *    cannot be inlined, and the mail is legible with it discarded.
 *  - **No web fonts, no external images.** A blocked remote asset must never
 *    take a call time with it, so the schedule is live text.
 *  - **600px.** Still the width every client agrees on.
 *  - **`bgcolor` beside every `background:`.** Not belt-and-braces nostalgia:
 *    Gmail's compose pipeline strips `background` from table cells outright.
 *    Measured 27 Aug 2026 — a draft went in with `style="background:#1b3563"`
 *    on the masthead and came back with the declaration gone, so the navy bar,
 *    the gold rule and every button fill rendered white. The deprecated
 *    `bgcolor` attribute survived the same round trip untouched. Both are set;
 *    whichever the client honors, the fill is there.
 *
 * Palette matches the portal (src/app/globals.css): navy #1B3563, gold
 * #C8892A as fill and the deepened #8A5A15 wherever gold carries body text,
 * because raw gold on white is ~3:1 and fails AA.
 */
import { org } from "@/config/org";

export interface EmailShellOptions {
  /**
   * The grey line a phone shows under the subject.
   *
   * Deliberately NOT rendered as the usual hidden `display:none` div. Invisible
   * text in an email body is a textbook phishing signal, and it is scored that
   * way: Gmail's draft API refused a message carrying one on 27 Aug 2026 and
   * accepted the identical mail once it was removed. A preheader is a nicety;
   * being classified as phishing is not. The value is kept on the interface
   * because callers compose it usefully, and the first visible line of the mail
   * serves the same purpose for the reader.
   */
  preheader: string;
  /** Pre-rendered HTML for the body. */
  content: string;
  /** Optional footer line above the standard org block. */
  footerNote?: string;
}

const NAVY = "#1b3563";
const GOLD = "#c8892a";
const GOLD_TEXT = "#8a5a15";
const INK = "#141a26";
const MUTED = "#4c5a72";
const PAGE = "#f5f7fa";
const BORDER = "#dfe5ee";

export const emailPalette = { NAVY, GOLD, GOLD_TEXT, INK, MUTED, PAGE, BORDER };

/** Escape text destined for HTML. Every value from the database goes through this. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmailShell({ content, footerNote }: EmailShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(org.shortName)}</title>
<style>
  /* Only what cannot be inlined. The mail reads correctly without it. */
  @media (max-width:620px){
    .shell{width:100% !important}
    .pad{padding-left:20px !important;padding-right:20px !important}
    .stack{display:block !important;width:100% !important}
  }
  @media (prefers-color-scheme:dark){
    .page{background:#0d1219 !important}
    .card{background:#151c27 !important}
    .ink,.ink *{color:#e8ecf3 !important}
    .muted,.muted *{color:#a8b3c5 !important}
    .rule{border-color:#2a3444 !important}
  }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${PAGE};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">

<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">

  <!-- masthead -->
  <tr><td bgcolor="${NAVY}" style="background:${NAVY};border-radius:10px 10px 0 0;padding:22px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font:700 17px/1.3 Georgia,'Times New Roman',serif;color:#ffffff;letter-spacing:.2px">
        ${esc(org.shortName)}
      </td>
      <td align="right" style="font:600 11px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${GOLD};text-transform:uppercase;letter-spacing:1.2px">
        ${esc(org.programBrand)}
      </td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="${GOLD}" style="background:${GOLD};height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>

  <!-- body -->
  <tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;padding:0">
    ${content}
  </td></tr>

  <!-- footer -->
  <tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 10px 10px;padding:0 32px 28px" class="pad">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="rule" style="border-top:1px solid ${BORDER};padding-top:18px">
        ${footerNote ? `<p class="muted" style="margin:0 0 12px;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED}">${footerNote}</p>` : ""}
        <!-- The mission, with the mark beside it rather than above it.
             28px because a signature logo is an ornament next to a line of
             type, not a second masthead — the navy bar at the top is already
             doing that job. valign="middle" and an explicit width/height keep
             Outlook from inventing its own. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">
          <tr>
            <td valign="middle" style="padding-right:8px;line-height:0">
              <img src="${esc(org.logoUrl)}" width="28" height="28" alt=""
                   style="display:block;width:28px;height:28px;border:0;outline:none;text-decoration:none">
            </td>
            <td valign="middle" style="font:400 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
              <strong style="color:${GOLD_TEXT}">${esc(org.mission)}</strong>
            </td>
          </tr>
        </table>
        <p class="muted" style="margin:0 0 8px;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED}">
          ${esc(org.name)} &middot; ${esc(org.address.line1)}, ${esc(org.address.line2)}, ${esc(org.address.city)} ${esc(org.address.state)} ${esc(org.address.zip)}<br>
          <a href="${esc(org.phoneHref)}" style="color:${NAVY}">${esc(org.phone)}</a>
          &middot; <a href="mailto:${esc(org.supportEmail)}" style="color:${NAVY}">${esc(org.supportEmail)}</a><br>
          <a href="${esc(org.portalUrl)}" style="color:${NAVY}">Parent portal</a>
          &middot; <a href="${esc(org.ticketsUrl)}" style="color:${NAVY}">Tickets</a>
        </p>
        <!-- Not optional, and not a parameter: rendered by the shell so that
             no caller can send an email without it. -->
        <p class="muted" style="margin:12px 0 0;padding-top:10px;border-top:1px solid ${BORDER};font:400 10px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED}">
          ${esc(org.confidentialityNotice)}
        </p>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** A section heading in the body. */
export function h2(text: string): string {
  return `<h2 style="margin:0 0 10px;font:700 16px/1.35 Georgia,'Times New Roman',serif;color:${NAVY}">${esc(text)}</h2>`;
}

/** A body paragraph. */
export function p(html: string): string {
  return `<p class="ink" style="margin:0 0 14px;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">${html}</p>`;
}

/** The gold callout band — the portal's .gold-band, re-expressed for email. */
export function callout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">
  <tr><td bgcolor="#fdf6e7" style="background:#fdf6e7;border-left:3px solid ${GOLD};border-radius:0 6px 6px 0;padding:14px 16px">
    <div class="ink" style="font:400 14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">${html}</div>
  </td></tr></table>`;
}

/** A primary button. Bulletproof-ish: styled anchor, no VML, degrades to a link. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">
  <tr><td bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px">
    <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:600 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(label)}</a>
  </td></tr></table>`;
}

/** Body padding wrapper — every content block sits inside one of these. */
export function section(inner: string, opts: { first?: boolean } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:${opts.first ? "28px" : "4px"} 32px 0">${inner}</td></tr></table>`;
}

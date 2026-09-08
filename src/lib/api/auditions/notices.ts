import { org } from "@/config/org";
import {
  button,
  callout,
  esc,
  h2,
  p,
  renderEmailShell,
  section,
} from "@/lib/email/template";

/**
 * What a family is told when their audition form goes through.
 *
 * Pure on purpose, like the coaching notices: a value in, a message out, no
 * network and no `server-only`, so the sentence NOVAPA is answerable for can
 * be tested without a mail provider.
 *
 * CJ, 8 Sep 2026, dictated the substance: "your audition information has been
 * submitted. Thank you. The staff will review it shortly." The confirmation
 * code goes in the mail as well as on the page, because the page is gone the
 * moment they close the tab and the mail is what they will search for in
 * November when they cannot remember whether they submitted.
 */

export interface AuditionReceipt {
  /** The child's display name — preferred name if they have one. */
  studentName: string;
  productionTitle: string;
  confirmationCode: string;
  /** True when this is an edit to a form that had already gone through. */
  isUpdate: boolean;
  /** Where "review or change it" goes. */
  auditionUrl: string;
}

export interface Message {
  subject: string;
  text: string;
  html: string;
}

export function auditionReceiptForFamily(receipt: AuditionReceipt): Message {
  const { studentName, productionTitle, confirmationCode, isUpdate, auditionUrl } = receipt;

  const subject = isUpdate
    ? `Audition updated — ${studentName}, ${productionTitle}`
    : `Audition submitted — ${studentName}, ${productionTitle}`;

  const headline = isUpdate
    ? `${studentName}'s audition information has been updated.`
    : `${studentName}'s audition information has been submitted.`;

  const content = [
    section(
      h2(headline) +
        p("Thank you. The staff will review it shortly.") +
        callout(
          `<strong>Confirmation code</strong><br>` +
            `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;letter-spacing:2px">${esc(confirmationCode)}</span><br>` +
            `<span style="font-size:13px">Keep this with your records. If you ever need to ask about this audition, quote the code.</span>`
        ) +
        p(
          `This is for <strong>${esc(productionTitle)}</strong>. You can come back and change anything until auditions begin — the code stays the same.`
        ) +
        button("Review or change it", auditionUrl),
      { first: true }
    ),
    section(
      p(
        `Sharing a preference helps the team understand your performer, but it never guarantees a specific part or size of role. Every role matters.`
      ) + p(`— ${esc(org.shortName)}`)
    ),
  ].join("");

  const text = [
    headline,
    "",
    "Thank you. The staff will review it shortly.",
    "",
    `Confirmation code: ${confirmationCode}`,
    "Keep this with your records. If you ever need to ask about this audition, quote the code.",
    "",
    `This is for ${productionTitle}. You can come back and change anything until auditions begin — the code stays the same.`,
    auditionUrl,
    "",
    "Sharing a preference helps the team understand your performer, but it never guarantees a specific part or size of role. Every role matters.",
    "",
    `— ${org.shortName}`,
  ].join("\n");

  return {
    subject,
    text,
    html: renderEmailShell({ preheader: `Confirmation code ${confirmationCode}`, content }),
  };
}

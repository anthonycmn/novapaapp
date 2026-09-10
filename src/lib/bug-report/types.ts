import type { BugEnvironment } from "./environment";

/**
 * One thing a person found broken, in their words, with what the browser knew.
 *
 * A record rather than only an email, because the email goes to one person and
 * a pile of them is the only way to see that four families hit the same thing
 * in the same week. hub 0081.
 */
export interface BugReport {
  id: string;
  createdAt: string;
  /** Who hit it. Null once an account is deleted; the report still stands. */
  reporterUserId?: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  /** Path only — a query string can carry a one-time sign-in token. */
  pagePath: string;
  whatHappened: string;
  whatExpected?: string;
  environment: BugEnvironment;
  status: BugReportStatus;
  handledAt?: string;
  /** False when the mail failed. The row is the backstop for that. */
  emailed: boolean;
}

/**
 * Two states, on purpose. A triage vocabulary — triaged, confirmed, won't fix,
 * duplicate — is for a queue several people work; this one is read by CJ.
 */
export type BugReportStatus = "new" | "handled";

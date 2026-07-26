import type { RegistrationSnapshot, RegistrationSource } from "./types";

/**
 * The seam between the app and whatever registration system the org runs.
 *
 * Every adapter answers one question: "what does the registration system
 * currently believe about accounts, participants, and enrollments?" The sync
 * engine (sync.ts) reconciles that answer into app tables; adapters never
 * write to the app database themselves.
 */
export interface RegistrationProvider {
  readonly source: RegistrationSource;
  /** Human-readable name for the admin health view. */
  readonly displayName: string;

  /** Whether this adapter has the credentials/config it needs to run. */
  isConfigured(): boolean;

  /** Pull the current state. Throws on transport/auth failure. */
  fetchSnapshot(): Promise<RegistrationSnapshot>;
}

export class RegistrationUnavailableError extends Error {
  constructor(
    message: string,
    readonly source: RegistrationSource
  ) {
    super(message);
    this.name = "RegistrationUnavailableError";
  }
}

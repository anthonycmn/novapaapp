import { RegistrationUnavailableError, type RegistrationProvider } from "./provider";
import type { RegistrationSnapshot } from "./types";

/**
 * Adapter for the org's own registration system.
 *
 * ⚠️ The response mapping below is a PLACEHOLDER. The real endpoint paths and
 * field names are still to be supplied (NEEDS-FROM-TONY.md #8). Everything
 * that must change when the real schema arrives is confined to this file:
 *
 *   1. ENDPOINTS  — the three paths fetched below
 *   2. mapSnapshot() — field-name translation into our normalized shape
 *
 * Nothing else in the app reads registration data directly, so swapping this
 * in is a one-file change. Until REGISTRATION_API_URL is set, the factory in
 * index.ts uses the mock adapter instead and the admin health view says so.
 */

const ENDPOINTS = {
  accounts: "/api/accounts",
  participants: "/api/participants",
  enrollments: "/api/enrollments",
} as const;

/** Shape we *expect* — adjust to match the real payload. */
interface RawPayload {
  accounts?: unknown[];
  participants?: unknown[];
  enrollments?: unknown[];
}

export class CustomPortalRegistrationProvider implements RegistrationProvider {
  readonly source = "sawyer" as const; // placeholder tag; renamed with real schema
  readonly displayName = "NOVA PA registration portal";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async fetchSnapshot(): Promise<RegistrationSnapshot> {
    if (!this.isConfigured()) {
      throw new RegistrationUnavailableError(
        "REGISTRATION_API_URL / REGISTRATION_API_KEY are not set",
        this.source
      );
    }

    const [accounts, participants, enrollments] = await Promise.all([
      this.get(ENDPOINTS.accounts),
      this.get(ENDPOINTS.participants),
      this.get(ENDPOINTS.enrollments),
    ]);

    return mapSnapshot({ accounts, participants, enrollments });
  }

  private async get(path: string): Promise<unknown[]> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        // Registration data is never cached — a stale roster is a safety issue.
        cache: "no-store",
      });
    } catch (cause) {
      throw new RegistrationUnavailableError(
        `Could not reach the registration system at ${this.baseUrl}: ${String(cause)}`,
        this.source
      );
    }

    if (!response.ok) {
      throw new RegistrationUnavailableError(
        `Registration system returned ${response.status} for ${path}`,
        this.source
      );
    }

    const body = (await response.json()) as unknown;
    // Tolerate both a bare array and { data: [...] } envelopes.
    if (Array.isArray(body)) return body;
    if (body && typeof body === "object" && Array.isArray((body as { data?: unknown[] }).data)) {
      return (body as { data: unknown[] }).data;
    }
    return [];
  }
}

/**
 * Translate the external payload into our normalized snapshot.
 * Unknown/missing fields are dropped rather than guessed — the sync engine
 * reports them as issues instead of writing bad data.
 */
export function mapSnapshot(raw: RawPayload): RegistrationSnapshot {
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const num = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const accounts = (raw.accounts ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const externalId = str(row.id) ?? str(row.account_id);
    const email = str(row.email);
    if (!externalId || !email) return [];
    return [
      {
        externalId,
        source: "sawyer" as const,
        guardianName: str(row.guardian_name) ?? str(row.name) ?? email,
        email: email.toLowerCase(),
        phone: str(row.phone),
      },
    ];
  });

  const participants = (raw.participants ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const externalId = str(row.id) ?? str(row.participant_id);
    const accountExternalId = str(row.account_id);
    const firstName = str(row.first_name);
    const lastName = str(row.last_name);
    if (!externalId || !accountExternalId || !firstName || !lastName) return [];
    return [
      {
        externalId,
        accountExternalId,
        firstName,
        lastName,
        dateOfBirth: str(row.date_of_birth) ?? str(row.dob),
      },
    ];
  });

  const enrollments = (raw.enrollments ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const externalId = str(row.id) ?? str(row.order_id);
    const participantExternalId = str(row.participant_id);
    const accountExternalId = str(row.account_id);
    const offeringName = str(row.offering_name) ?? str(row.program_name);
    if (!externalId || !participantExternalId || !accountExternalId || !offeringName) {
      return [];
    }
    const rawStatus = str(row.status)?.toLowerCase();
    const status =
      rawStatus === "waitlisted" || rawStatus === "waitlist"
        ? ("waitlisted" as const)
        : rawStatus === "cancelled" || rawStatus === "canceled"
          ? ("cancelled" as const)
          : ("enrolled" as const);

    return [
      {
        externalId,
        source: "sawyer" as const,
        participantExternalId,
        accountExternalId,
        offeringName,
        activitySetId: str(row.activity_set_id),
        status,
        balanceCents: num(row.balance_cents) ?? 0,
        amountPaidCents: num(row.amount_paid_cents) ?? 0,
        enrolledAt: str(row.enrolled_at) ?? new Date().toISOString(),
      },
    ];
  });

  return {
    accounts,
    participants,
    enrollments,
    fetchedAt: new Date().toISOString(),
    source: "sawyer",
  };
}

/**
 * Household document vault (#3) and the Dependent Care FSA statement.
 */

export type DocumentCategory =
  | "waiver"
  | "medical"
  | "photo_release"
  | "financial"
  | "school"
  | "other";

export const DOCUMENT_CATEGORIES: Array<{ value: DocumentCategory; label: string }> = [
  { value: "waiver", label: "Waiver / liability" },
  { value: "medical", label: "Medical" },
  { value: "photo_release", label: "Photo release" },
  { value: "financial", label: "Financial / receipts" },
  { value: "school", label: "School forms" },
  { value: "other", label: "Other" },
];

export interface FamilyDocument {
  id: string;
  familyId: string;
  /** Optional: attach to one student rather than the household. */
  studentId?: string;
  name: string;
  category: DocumentCategory;
  fileUrl: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByName: string;
  /** Staff-uploaded documents are visible to the family but not deletable by them. */
  uploadedByStaff: boolean;
}

/* ── Dependent Care FSA ─────────────────────────────────────────────────── */

/**
 * A Dependent Care FSA reimbursement claim needs, per IRS Publication 503:
 * the provider's name, address and taxpayer ID; the dependent's name; the
 * dates care was provided; and the amount paid. A qualifying dependent must
 * be UNDER 13 for the care period.
 */
export interface FsaLineItem {
  description: string;
  startDate: string;
  endDate: string;
  amountCents: number;
}

export interface FsaStatement {
  studentId: string;
  studentName: string;
  studentDateOfBirth: string;
  /** Age at the END of the covered period — the eligibility test. */
  ageAtPeriodEnd: number;
  eligible: boolean;
  /** Why not, when ineligible. */
  ineligibleReason?: string;
  familyName: string;
  guardianName: string;
  periodStart: string;
  periodEnd: string;
  lineItems: FsaLineItem[];
  /**
   * Enrollments deliberately left off: classes, lessons, performances, and
   * anything the registration system did not classify.
   *
   * Reported rather than silently dropped, so a parent who remembers paying for
   * something can see it was excluded on purpose and why.
   */
  excludedCount: number;
  totalCents: number;
  generatedAt: string;
}

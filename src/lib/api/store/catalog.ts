/**
 * Product catalog (#11, extended).
 *
 * The store started as spirit buttons only. Families also buy playbill star
 * pages and private lessons, so a cart item is now a product reference plus
 * a type-specific customization payload rather than a button-shaped record.
 */

export type ProductType =
  | "spirit_button"
  | "star_page"
  | "private_lesson"
  | "merchandise"
  | "donation";

export interface ProductOption {
  /** Stable key stored on the order. */
  value: string;
  label: string;
  /** Added to the product's base price. */
  priceDeltaCents: number;
  description?: string;
}

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  description: string;
  basePriceCents: number;
  /** Scoped to one show when set (star pages, buttons for a production). */
  productionId?: string;
  /** Size/length/tier choices. Empty means a single fixed price. */
  options: ProductOption[];
  optionLabel?: string;
  /** Whether checkout collects a photo. */
  requiresPhoto: boolean;
  /** Whether checkout collects a message/dedication. */
  requiresMessage: boolean;
  messageLabel?: string;
  messageMaxLength?: number;
  /** Lessons: which staff can teach it, for the preference dropdown. */
  staffIds?: string[];
  isActive: boolean;
  /** Sort order in the storefront. */
  sortOrder: number;
}

/* ── customization payloads ─────────────────────────────────────────────── */

export interface ButtonCustomization {
  kind: "spirit_button";
  photoUrl: string;
  photoWidth: number;
  photoHeight: number;
  studentName: string;
  role: string;
  size: "2.25" | "3" | "3.5";
  style: "classic" | "star" | "ribbon";
  templateId: string;
}

export interface StarPageCustomization {
  kind: "star_page";
  /** Whose page this is. */
  studentName: string;
  /** Ad size, matching the chosen product option. */
  pageSize: string;
  photoUrl?: string;
  photoWidth?: number;
  photoHeight?: number;
  /** The congratulatory message printed in the playbill. */
  message: string;
  /** Who it's from — "Love, Mom and Dad". */
  signature: string;
}

export interface LessonCustomization {
  kind: "private_lesson";
  studentName: string;
  /** Product option: number of sessions or length. */
  packageOption: string;
  /** Optional teacher preference. */
  preferredStaffId?: string;
  /** Free text: goals, scheduling constraints. */
  notes: string;
}

export interface SimpleCustomization {
  kind: "simple";
  note?: string;
}

export type Customization =
  | ButtonCustomization
  | StarPageCustomization
  | LessonCustomization
  | SimpleCustomization;

/** Resolve the price of a product with a chosen option. */
export function priceFor(product: Product, optionValue?: string): number {
  const option = product.options.find((candidate) => candidate.value === optionValue);
  return product.basePriceCents + (option?.priceDeltaCents ?? 0);
}

export function describeCustomization(customization: Customization): string {
  switch (customization.kind) {
    case "spirit_button":
      return `${customization.studentName}${customization.role ? ` — ${customization.role}` : ""} · ${customization.size}" ${customization.style}`;
    case "star_page":
      return `${customization.studentName} · ${customization.pageSize}`;
    case "private_lesson":
      return `${customization.studentName} · ${customization.packageOption}`;
    default:
      return customization.note ?? "";
  }
}

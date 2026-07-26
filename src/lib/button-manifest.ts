import type { ButtonOrder } from "@/lib/api/types";
import { assessPhotoQuality } from "@/lib/store-rules";

/**
 * CSV manifest for the button press operator (#11). One row per distinct
 * button design, with the quantity to press and a print-quality flag so the
 * operator can spot a soft photo before wasting a blank.
 */

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const MANIFEST_COLUMNS = [
  "order_reference",
  "placed_by",
  "status",
  "student_name",
  "role",
  "size_inches",
  "style",
  "quantity",
  "photo_pixels",
  "print_dpi",
  "quality",
] as const;

export function buildManifestCsv(orders: ButtonOrder[]): string {
  const rows: string[] = [MANIFEST_COLUMNS.join(",")];

  for (const order of orders) {
    for (const item of order.items) {
      const quality = assessPhotoQuality(item.photoWidth, item.photoHeight, item.size);
      rows.push(
        [
          order.reference,
          order.placedByName,
          order.status,
          item.studentName,
          item.role,
          item.size,
          item.style,
          item.quantity,
          `${item.photoWidth}x${item.photoHeight}`,
          quality.dpi,
          quality.quality,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  return rows.join("\r\n") + "\r\n";
}

/** Total buttons to press across a set of orders. */
export function countButtons(orders: ButtonOrder[]): number {
  return orders.reduce(
    (sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0),
    0
  );
}

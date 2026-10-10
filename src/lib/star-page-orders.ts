import type { ButtonOrder, Production } from "@/lib/api/types";
import type { Product } from "@/lib/api/store/catalog";

/**
 * Star page orders for the admin desk (CJ, 10 Oct 2026: "put star page orders
 * in the parent portal admin too"). The staff portal has the same desk at
 * /star-page-orders; this is the parent portal's copy of it.
 *
 * The store has one checkout, so a star page is a line on a button order,
 * sometimes alongside buttons. The order's productionId comes from a button
 * template, so a star-page-only order has none: the show is found through the
 * line's product instead (one star_page product per show). The page and the
 * playbill count PAID orders by default - checkout reserves the order before
 * Stripe, so a family who walks away leaves an unpaid order behind.
 */

export const PAGE_SIZE_LABEL: Record<string, string> = {
  quarter: "Quarter page",
  half: "Half page",
  full: "Full page",
};

export interface StarPageRow {
  itemId: string;
  orderId: string;
  reference: string;
  showId?: string;
  show: string;
  placedBy: string;
  performer: string;
  sizeLabel: string;
  quantity: number;
  cents: number;
  message: string;
  signature: string;
  printImageUrl?: string;
  photoUrl?: string;
  paid: boolean;
  createdAt: string;
}

/** One row per star page line, newest first. */
export function starPageRows(
  orders: ButtonOrder[],
  products: Pick<Product, "id" | "productionId">[],
  productions: Pick<Production, "id" | "title">[]
): StarPageRow[] {
  const showOfProduct = new Map(products.map((p) => [p.id, p.productionId]));
  const titleById = new Map(productions.map((p) => [p.id, p.title]));

  const rows: StarPageRow[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productType !== "star_page") continue;
      const custom = item.customization?.kind === "star_page" ? item.customization : undefined;
      const showId = (item.productId && showOfProduct.get(item.productId)) || undefined;
      const size = item.optionValue ?? custom?.pageSize ?? "";
      rows.push({
        itemId: item.id,
        orderId: order.id,
        reference: order.reference,
        showId,
        show: (showId && titleById.get(showId)) || "Unknown show",
        placedBy: order.placedByName,
        performer: custom?.studentName?.trim() || "No name given",
        sizeLabel: PAGE_SIZE_LABEL[size] ?? (size || "Star page"),
        quantity: item.quantity,
        cents: item.unitPriceCents * item.quantity,
        message: custom?.message ?? "",
        signature: custom?.signature ?? "",
        printImageUrl: item.printImageUrl,
        photoUrl: custom?.photoUrl ?? item.photoUrl,
        paid: Boolean(order.paidAt),
        createdAt: order.createdAt,
      });
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function slug(text: string, fallback: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

/** "NPA-1042-elsie-park-full.jpg" - the print file, named findably. */
export function starPageFileName(row: StarPageRow): string {
  const size = row.sizeLabel.split(" ")[0].toLowerCase();
  return `${row.reference}-${slug(row.performer, "performer")}-${size}${row.paid ? "" : "-UNPAID"}.jpg`;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const STAR_PAGE_MANIFEST_COLUMNS = [
  "order_reference",
  "show",
  "performer",
  "size",
  "quantity",
  "message",
  "signature",
  "placed_by",
  "paid",
  "print_file",
] as const;

/** The sheet the playbill designer works from: every page, its words exactly as written. */
export function buildStarPageManifestCsv(rows: StarPageRow[]): string {
  const lines = rows.map((row) =>
    [
      row.reference,
      row.show,
      row.performer,
      row.sizeLabel,
      row.quantity,
      row.message,
      row.signature,
      row.placedBy,
      row.paid ? "yes" : "no",
      row.printImageUrl ? starPageFileName(row) : "NO PRINT FILE",
    ]
      .map(csvEscape)
      .join(",")
  );
  return [STAR_PAGE_MANIFEST_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}

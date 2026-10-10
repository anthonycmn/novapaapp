import { describe, expect, it } from "vitest";
import type { ButtonOrder } from "@/lib/api/types";
import {
  buildStarPageManifestCsv,
  starPageFileName,
  starPageRows,
  STAR_PAGE_MANIFEST_COLUMNS,
} from "@/lib/star-page-orders";

const base = {
  familyId: "f1",
  status: "new" as const,
  paymentRef: "cs_test",
  productionId: "",
  statusUpdatedAt: "2026-10-09T15:00:00Z",
};

const orders: ButtonOrder[] = [
  {
    ...base,
    id: "o1",
    reference: "NPA-1050",
    subtotalCents: 15200,
    paidAt: "2026-10-09T15:00:00Z",
    placedByName: "Ann Park",
    createdAt: "2026-10-09T14:00:00Z",
    items: [
      // A mixed order: the button line must not become a star page row.
      {
        id: "b1",
        quantity: 1,
        unitPriceCents: 1200,
        productType: "spirit_button",
        displayName: "Spirit button",
      },
      {
        id: "s1",
        quantity: 1,
        unitPriceCents: 14000,
        productType: "star_page",
        productId: "p-sweeney",
        optionValue: "full",
        displayName: "Star page",
        printImageUrl: "data:image/jpeg;base64,AAAA",
        customization: {
          kind: "star_page",
          studentName: "Elsie Park",
          pageSize: "full",
          message: "Break a leg!\nLove, all of us",
          signature: 'Mom, Dad, "Buddy"',
        },
      },
    ],
  },
  {
    ...base,
    id: "o2",
    reference: "NPA-1051",
    subtotalCents: 5000,
    placedByName: "Bo Lee",
    createdAt: "2026-10-10T14:00:00Z",
    items: [
      {
        id: "s2",
        quantity: 1,
        unitPriceCents: 5000,
        productType: "star_page",
        productId: "p-sweeney",
        optionValue: "quarter",
        displayName: "Star page",
        customization: {
          kind: "star_page",
          studentName: "Sam",
          pageSize: "quarter",
          message: "Go Sam",
          signature: "",
        },
      },
    ],
  },
];

const products = [{ id: "p-sweeney", productionId: "show-1" }];
const productions = [{ id: "show-1", title: "Sweeney Todd - Teen Conservatory" }];

describe("star page orders", () => {
  const rows = starPageRows(orders, products, productions);

  it("lists only star page lines, newest first, with the show found through the product", () => {
    expect(rows.map((r) => r.reference)).toEqual(["NPA-1051", "NPA-1050"]);
    expect(rows.every((r) => r.show === "Sweeney Todd - Teen Conservatory")).toBe(true);
  });

  it("labels size, price and paid state", () => {
    const elsie = rows.find((r) => r.reference === "NPA-1050")!;
    expect(elsie).toMatchObject({ sizeLabel: "Full page", cents: 14000, paid: true });
    expect(rows.find((r) => r.reference === "NPA-1051")!.paid).toBe(false);
  });

  it("names print files findably and marks unpaid ones", () => {
    expect(starPageFileName(rows[1])).toBe("NPA-1050-elsie-park-full.jpg");
    expect(starPageFileName(rows[0])).toBe("NPA-1051-sam-quarter-UNPAID.jpg");
  });

  it("keeps the message and signature exactly as written in the CSV", () => {
    const csv = buildStarPageManifestCsv(rows);
    expect(csv.startsWith(STAR_PAGE_MANIFEST_COLUMNS.join(","))).toBe(true);
    expect(csv).toContain('"Break a leg!\nLove, all of us"');
    expect(csv).toContain('"Mom, Dad, ""Buddy"""');
    expect(csv).toContain("NO PRINT FILE");
  });
});

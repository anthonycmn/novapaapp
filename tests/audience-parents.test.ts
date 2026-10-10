import { describe, expect, it } from "vitest";
import { parentsInAudience, type AudienceTables } from "@/lib/notifications/audience-parents";

/**
 * Who a group send reaches — the rule shared by feed posts, Email families,
 * and the push composer's "families enrolled in…" picker (10 Oct 2026).
 */

const parents = [
  { id: "p-ann", family_id: "fam-a" },
  { id: "p-ann2", family_id: "fam-a" }, // second parent, same family
  { id: "p-bo", family_id: "fam-b" },
  { id: "p-cy", family_id: "fam-c" },
  { id: "p-none", family_id: null },
];

const tables: AudienceTables = {
  students: [
    { id: "s-a1", family_id: "fam-a" },
    { id: "s-b1", family_id: "fam-b" },
    { id: "s-c1", family_id: "fam-c" },
    { id: "s-orphan", family_id: null },
  ],
  enrollments: [
    { student_id: "s-a1", production_id: "frozen-kids", class_id: null },
    { student_id: "s-b1", production_id: null, class_id: "acting-9-12" },
    { student_id: "s-c1", production_id: "sweeney", class_id: null },
    { student_id: "s-orphan", production_id: "frozen-kids", class_id: null },
  ],
  classes: [{ id: "acting-9-12", program_id: "classes" }],
  productions: [
    { id: "frozen-kids", program_id: "bb" },
    { id: "sweeney", program_id: "bb" },
  ],
};

const ids = (list: Array<{ id: string }>) => list.map((p) => p.id).sort();

describe("parentsInAudience", () => {
  it("an empty audience is every parent", () => {
    expect(ids(parentsInAudience({}, parents, tables))).toEqual(ids(parents));
  });

  it("a show reaches both parents of an enrolled family, and nobody else", () => {
    expect(ids(parentsInAudience({ productionIds: ["frozen-kids"] }, parents, tables))).toEqual(["p-ann", "p-ann2"]);
  });

  it("a show and a class together are either, not both", () => {
    expect(
      ids(parentsInAudience({ productionIds: ["frozen-kids"], classIds: ["acting-9-12"] }, parents, tables))
    ).toEqual(["p-ann", "p-ann2", "p-bo"]);
  });

  it("a program reaches every family enrolled in anything under it", () => {
    expect(ids(parentsInAudience({ programIds: ["bb"] }, parents, tables))).toEqual(["p-ann", "p-ann2", "p-cy"]);
    expect(ids(parentsInAudience({ programIds: ["classes"] }, parents, tables))).toEqual(["p-bo"]);
  });

  it("only enrolled rows count — a dropped student is not in the table the caller passes", () => {
    const dropped = { ...tables, enrollments: tables.enrollments.filter((e) => e.student_id !== "s-c1") };
    expect(parentsInAudience({ productionIds: ["sweeney"] }, parents, dropped)).toEqual([]);
  });

  it("a parent with no family, and a student with no family, never match a group", () => {
    const out = ids(parentsInAudience({ productionIds: ["frozen-kids"] }, parents, tables));
    expect(out).not.toContain("p-none");
  });

  it("a named family is reached whether enrolled or not", () => {
    expect(ids(parentsInAudience({ familyIds: ["fam-c"] }, parents, tables))).toEqual(["p-cy"]);
  });
});

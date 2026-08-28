import { describe, expect, it } from "vitest";
import {
  buildPackets,
  greetingName,
  latestPublishPerStudent,
  renderStudentEmail,
  type CastRow,
  type EventRow,
  type RoleRow,
  type WeekMeta,
} from "@/lib/email/weekly-company";
import { htmlToText, looksLikeHtml } from "@/lib/email/queue";

const ROLES: RoleRow[] = [
  { id: "r-sweeney", name: "Sweeney Todd" },
  { id: "r-pirelli", name: "Adolfo Pirelli" },
  { id: "r-fogg", name: "Jonas Fogg" },
  { id: "r-ensemble", name: "Ensemble of London" },
  { id: "r-lucy", name: "Young Lucy" },
];

function cast(over: Partial<CastRow>): CastRow {
  return {
    studentId: "s1", familyId: "f1", firstName: "Ada", lastName: "Lovelace",
    preferredName: null, characterName: "Sweeney Todd", rehearsalTrack: null,
    publishedAt: "2026-08-18T15:57:01Z", ...over,
  };
}

function event(over: Partial<EventRow>): EventRow {
  return {
    id: "e1", title: "Rehearsal", startsAt: "2026-08-31T23:00:00Z",
    endsAt: "2026-09-01T01:00:00Z", location: "Rehearsal Space, South Building — park in the south lot",
    calledNote: null, worksNote: null, roleIds: ["r-ensemble"], ...over,
  };
}

const META: WeekMeta = {
  from: "2026-08-30T12:00:00-04:00",
  to: "2026-09-05T12:00:00-04:00",
  portalUrl: "https://portal.novapa.org",
  productionUrl: "https://portal.novapa.org/productions/sweeney",
};

describe("latestPublishPerStudent", () => {
  it("keeps only the newest publish when batches overlap", () => {
    const rows = [
      cast({ characterName: "Ensemble of London", publishedAt: "2026-08-18T15:57:01Z" }),
      cast({ characterName: "Ensemble of London", publishedAt: "2026-08-27T18:04:42Z" }),
    ];
    expect(latestPublishPerStudent(rows)).toHaveLength(1);
    expect(latestPublishPerStudent(rows)[0].publishedAt).toBe("2026-08-27T18:04:42Z");
  });

  it("keeps every row of a single publish, so one student can hold two roles", () => {
    const rows = [
      cast({ characterName: "Adolfo Pirelli", publishedAt: "2026-08-18T15:57:01Z" }),
      cast({ characterName: "Jonas Fogg", publishedAt: "2026-08-18T15:57:01Z" }),
    ];
    expect(latestPublishPerStudent(rows)).toHaveLength(2);
  });

  it("resolves each student independently", () => {
    const rows = [
      cast({ studentId: "s1", publishedAt: "2026-08-27T18:04:42Z" }),
      cast({ studentId: "s2", publishedAt: "2026-08-18T15:57:01Z" }),
    ];
    expect(latestPublishPerStudent(rows)).toHaveLength(2);
  });
});

describe("greetingName", () => {
  it("uses the preferred name", () => {
    expect(greetingName({ firstName: "Caroline", lastName: "Firestone", preferredName: "Cal" }))
      .toBe("Cal");
  });

  // Both of these appear in the live Sweeney roster.
  it("ignores a preferred name that is really the full name", () => {
    expect(greetingName({ firstName: "Ronan", lastName: "Karhuse", preferredName: "Ronan Karhuse" }))
      .toBe("Ronan");
  });

  it("ignores an empty preferred name", () => {
    expect(greetingName({ firstName: "Hadley", lastName: "Young", preferredName: "" }))
      .toBe("Hadley");
  });
});

describe("buildPackets", () => {
  it("gives a student only the calls their role is in", () => {
    const packets = buildPackets(
      [cast({ characterName: "Ensemble of London" })],
      [
        event({ id: "mine", roleIds: ["r-ensemble", "r-sweeney"] }),
        event({ id: "not-mine", roleIds: ["r-sweeney"] }),
      ],
      ROLES
    );
    expect(packets[0].calls.map((c) => c.id)).toEqual(["mine"]);
  });

  it("unions the calls of a student holding two roles", () => {
    const packets = buildPackets(
      [
        cast({ characterName: "Adolfo Pirelli" }),
        cast({ characterName: "Jonas Fogg" }),
      ],
      [
        event({ id: "pirelli-call", roleIds: ["r-pirelli"] }),
        event({ id: "fogg-call", roleIds: ["r-fogg"] }),
        event({ id: "other", roleIds: ["r-sweeney"] }),
      ],
      ROLES
    );
    expect(packets[0].roles).toEqual(["Adolfo Pirelli", "Jonas Fogg"]);
    expect(packets[0].calls.map((c) => c.id).sort()).toEqual(["fogg-call", "pirelli-call"]);
  });

  it("does not match on a called role nobody is cast in", () => {
    // Young Lucy is called at four Sweeney rehearsals and cast in none.
    const packets = buildPackets(
      [cast({ characterName: "Sweeney Todd" })],
      [event({ id: "lucy-only", roleIds: ["r-lucy"] })],
      ROLES
    );
    expect(packets[0].noCalls).toBe(true);
  });

  it("sorts a student's calls chronologically", () => {
    const packets = buildPackets(
      [cast({ characterName: "Ensemble of London" })],
      [
        event({ id: "late", startsAt: "2026-09-05T13:00:00Z" }),
        event({ id: "early", startsAt: "2026-08-31T23:00:00Z" }),
      ],
      ROLES
    );
    expect(packets[0].calls.map((c) => c.id)).toEqual(["early", "late"]);
  });

  it("flags a student with no calls rather than dropping them", () => {
    const packets = buildPackets([cast({ characterName: "Sweeney Todd" })], [], ROLES);
    expect(packets).toHaveLength(1);
    expect(packets[0].noCalls).toBe(true);
  });
});

describe("renderStudentEmail", () => {
  const packets = buildPackets(
    [cast({ characterName: "Ensemble of London", preferredName: "Cal", firstName: "Caroline" })],
    [event({ worksNote: "Miracle Elixir — crowd work" })],
    ROLES
  );
  const { subject, html } = renderStudentEmail(packets[0], META);

  it("names the child in the subject", () => {
    expect(subject).toContain("Cal");
  });

  it("carries the call time and what the room is working", () => {
    expect(html).toContain("Miracle Elixir");
    expect(html).toMatch(/Monday, August 31/);
  });

  it("covers every point the week's email has to make", () => {
    for (const required of [
      "learn everybody else",   // other people's parts
      "refresh",                 // their own
      "practice tracks",
      "spelled correctly",       // name confirmation
      "September 4",             // tickets
      "please share",            // socials
      "info@novapa.org",
    ]) {
      expect(html.toLowerCase()).toContain(required.toLowerCase());
    }
  });

  it("escapes names rather than interpolating them raw", () => {
    const risky = buildPackets(
      [cast({ firstName: "<script>", lastName: "X", preferredName: null })],
      [], ROLES
    );
    expect(renderStudentEmail(risky[0], META).html).not.toContain("<script>");
  });
});

describe("queue body handling", () => {
  it("detects an HTML body", () => {
    expect(looksLikeHtml("<!doctype html><html>…")).toBe(true);
    expect(looksLikeHtml("Hi there,\n\nRehearsal is at 7.")).toBe(false);
  });

  it("keeps the words when falling back to text", () => {
    const text = htmlToText("<p>Rehearsal is at <strong>7:00 PM</strong></p><p>Bring a pencil</p>");
    expect(text).toContain("Rehearsal is at 7:00 PM");
    expect(text).toContain("Bring a pencil");
    expect(text).not.toContain("<");
  });

  it("drops style blocks rather than printing CSS at the reader", () => {
    expect(htmlToText("<style>.x{color:red}</style><p>Hello</p>")).toBe("Hello");
  });
});

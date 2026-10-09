import "server-only";
import { students as seedStudents } from "@/lib/api/mock/seed-data";
import type { EncoreRepo } from "./repo";
import { FIRST_REWARD_POINTS, balanceOf, pointsFor, seasonStart, spendBetween, tierFor } from "./rules";
import type {
  LedgerEntry,
  ProgramState,
  Redemption,
  RedemptionItem,
  RedeemDetail,
  RedeemResult,
  Reward,
  StudentChoice,
} from "./types";

/**
 * Encore Points in memory, for the mock-mode preview and the tests. Mirrors
 * hub 0098: the same menu, the same caps, the same refusals.
 *
 * Seed: the program is NOT launched; the Martinez and Okafor families are on
 * the preview list, Nguyen is not (so the hidden state can be walked too).
 * Martinez paid for a $795 show and an October class (8,850 points: one
 * reward). Okafor paid for the $795 show only: 7,950, fifty short, which is
 * the moment CJ built the $800 line for.
 */

const REWARDS: Reward[] = [
  { key: "show_night_pack", kind: "show_night_pack", title: "Show-night pack", blurb: "Two concession tickets and a break-a-leg-a-gram for your student.", points: 8000, valueCents: 1200, sort: 10 },
  { key: "spirit_button", kind: "spirit_button", title: "Spirit button", blurb: "One custom spirit button, built in the store and paid with points.", points: 8000, valueCents: 1200, sort: 20 },
  { key: "show_ticket", kind: "show_ticket", title: "Show ticket", blurb: "One ticket to a NOVA PA show, any seat. You get a code to use at checkout.", points: 10000, valueCents: 3000, sort: 30 },
  { key: "tshirt", kind: "tshirt", title: "NOVA PA t-shirt", blurb: "Pick a size; staff hand it to your student at rehearsal.", points: 12000, valueCents: 2500, sort: 40 },
  { key: "star_page_quarter", kind: "star_page", title: "Quarter star page", blurb: "A quarter page in the playbill, built in the store and paid with points.", points: 12500, valueCents: 5000, size: "quarter", sort: 50 },
  { key: "star_page_half", kind: "star_page", title: "Half star page", blurb: "A half page in the playbill, built in the store and paid with points.", points: 22500, valueCents: 9000, size: "half", sort: 60 },
  { key: "star_page_full", kind: "star_page", title: "Full star page", blurb: "A full page in the playbill, built in the store and paid with points.", points: 35000, valueCents: 14000, size: "full", sort: 70 },
  { key: "day_camp_day", kind: "day_camp_day", title: "One day camp day", blurb: "A day camp credit on your student's punch card.", points: 25000, valueCents: 7900, sort: 80 },
  { key: "registration_25", kind: "registration_credit", title: "$25 off a show registration", blurb: "A code for $25 off a show registration. One per student per season.", points: 40000, valueCents: 2500, sort: 90 },
  { key: "registration_50", kind: "registration_credit", title: "$50 off a show registration", blurb: "A code for $50 off a show registration. One per student per season.", points: 80000, valueCents: 5000, sort: 100 },
];

interface MockEncore {
  launched: boolean;
  paused: boolean;
  preview: Set<string>;
  ledger: Map<string, LedgerEntry[]>;
  redemptions: Map<string, Redemption[]>;
}

const g = globalThis as unknown as { __novapaEncore?: MockEncore };

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = (prefix: string, len: number) =>
  prefix + Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

function earn(ref: string, cents: number, at: string, prior: LedgerEntry[]): LedgerEntry {
  const s0 = seasonStart(new Date(at));
  const tier = tierFor(spendBetween(prior, s0, new Date(at)));
  return { id: newId("led"), points: pointsFor(cents, tier), kind: "earn", sourceRef: ref, spendCents: cents, tier, occurredAt: at };
}

function seed(): MockEncore {
  const martinez: LedgerEntry[] = [];
  martinez.push(earn("order:mock-1", 79500, "2026-09-03T15:00:00Z", martinez));
  martinez.push(earn("installment:mock-2", 9000, "2026-10-01T13:00:00Z", martinez));
  const okafor: LedgerEntry[] = [];
  okafor.push(earn("order:mock-3", 79500, "2026-09-12T18:00:00Z", okafor));
  return {
    launched: false,
    paused: false,
    preview: new Set(["fam-martinez", "fam-okafor"]),
    ledger: new Map([
      ["fam-martinez", martinez.reverse()],
      ["fam-okafor", okafor],
    ]),
    redemptions: new Map(),
  };
}

export function mockEncore(): MockEncore {
  return (g.__novapaEncore ??= seed());
}

export function mockEncoreReset(): void {
  g.__novapaEncore = seed();
}

/** Mock only: CJ's switch, so the launched state can be walked. */
export function mockEncoreLaunch(launched = true): void {
  mockEncore().launched = launched;
}

/** Mock only: add points as if a payment cleared. */
export function mockEncoreAdd(familyId: string, points: number, note = "Test points"): void {
  const list = mockEncore().ledger.get(familyId) ?? [];
  list.unshift({ id: newId("led"), points, kind: "adjust", spendCents: 0, occurredAt: new Date().toISOString(), note });
  mockEncore().ledger.set(familyId, list);
}

export class MockEncoreRepo implements EncoreRepo {
  readonly mode = "mock" as const;
  private get s() {
    return mockEncore();
  }

  async program(familyId: string): Promise<ProgramState> {
    const { launched, paused, preview } = this.s;
    return {
      launched,
      paused,
      openForFamily: (launched && !paused) || preview.has(familyId),
      directorCents: 150000,
      producerCents: 300000,
      referralPoints: 15000,
    };
  }

  async rewards(): Promise<Reward[]> {
    return structuredClone(REWARDS);
  }

  async ledger(familyId: string): Promise<LedgerEntry[]> {
    return structuredClone(this.s.ledger.get(familyId) ?? []);
  }

  async redemptions(familyId: string): Promise<Redemption[]> {
    return structuredClone(this.s.redemptions.get(familyId) ?? []);
  }

  async students(familyId: string): Promise<StudentChoice[]> {
    return seedStudents
      .filter((st) => st.familyId === familyId)
      .map((st) => ({
        id: st.id,
        name: `${st.preferredName ?? st.firstName} ${st.lastName}`.trim(),
        tshirtSize: st.tshirtSize,
        onPunchCard: true,
      }));
  }

  async redeem(familyId: string, rewardKey: string, studentId: string | null, detail: RedeemDetail): Promise<RedeemResult> {
    if (!(await this.program(familyId)).openForFamily) throw new Error("Encore Points is not open yet.");
    const reward = REWARDS.find((r) => r.key === rewardKey);
    if (!reward) throw new Error("That reward is not on the menu right now.");
    if (reward.points < FIRST_REWARD_POINTS) throw new Error("Nothing on the menu costs under 8,000 points.");
    const ledger = this.s.ledger.get(familyId) ?? [];
    const balance = balanceOf(ledger);
    if (balance < reward.points) {
      throw new Error(`You need ${(reward.points - balance).toLocaleString("en-US")} more points for this reward.`);
    }
    const students = await this.students(familyId);
    const student = studentId ? students.find((st) => st.id === studentId) : undefined;
    if (studentId && !student) throw new Error("Choose one of your own students.");
    const needsStudent = ["show_night_pack", "tshirt", "day_camp_day", "registration_credit"].includes(reward.kind);
    if (needsStudent && !student) throw new Error("Choose which student this reward is for.");

    const mine = this.s.redemptions.get(familyId) ?? [];
    const id = newId("red");
    const items: RedemptionItem[] = [];
    const codes: RedeemResult["codes"] = [];
    const item = (kind: RedemptionItem["item"], extra: Partial<RedemptionItem> = {}) => {
      const it: RedemptionItem = { id: newId("itm"), item: kind, status: "open", studentId: student?.id, detail: {}, ...extra };
      items.push(it);
      if (it.code && ["concession", "ticket_code", "registration_code"].includes(kind)) codes.push({ item: kind, code: it.code });
    };

    switch (reward.kind) {
      case "show_night_pack":
        item("concession", { code: code("C", 5) });
        item("concession", { code: code("C", 5) });
        item("gram", { detail: { to: student!.name, message: (detail.message ?? "").slice(0, 280), from: (detail.from ?? "").slice(0, 80) } });
        break;
      case "tshirt": {
        const size = (detail.size || student!.tshirtSize || "").trim().toUpperCase();
        if (!size) throw new Error("Choose a t-shirt size.");
        item("tshirt", { detail: { size, student: student!.name } });
        break;
      }
      case "spirit_button":
      case "star_page":
        item("store_voucher", { code: code("V", 8), detail: { product: reward.kind, size: reward.size } });
        break;
      case "show_ticket":
        item("ticket_code", { code: code("TIXE", 6), detail: { amount_cents: 3000 } });
        break;
      case "registration_credit": {
        const s0 = seasonStart(new Date());
        const already = mine.some(
          (r) => r.kind === "registration_credit" && r.status === "active" && r.studentId === student!.id && new Date(r.createdAt) >= s0
        );
        if (already) throw new Error(`${student!.name.split(" ")[0]} already has money off registration from points this season.`);
        item("registration_code", { code: code("ENC", 7), detail: { amount_cents: reward.valueCents } });
        break;
      }
      case "day_camp_day":
        item("day_camp_credit", { status: "done", doneAt: new Date().toISOString(), detail: { camper: student!.name } });
        break;
    }

    mine.unshift({
      id, rewardKey: reward.key, kind: reward.kind, title: reward.title, points: reward.points,
      studentId: student?.id, status: "active", createdAt: new Date().toISOString(), items,
    });
    this.s.redemptions.set(familyId, mine);
    ledger.unshift({ id: newId("led"), points: -reward.points, kind: "redeem", sourceRef: `redeem:${id}`, spendCents: 0, occurredAt: new Date().toISOString(), note: reward.title });
    this.s.ledger.set(familyId, ledger);
    return { id, title: reward.title, points: reward.points, balance: balance - reward.points, codes };
  }

  async useVoucher(familyId: string, itemId: string, orderReference: string): Promise<boolean> {
    for (const r of this.s.redemptions.get(familyId) ?? []) {
      const it = r.items.find((i) => i.id === itemId && i.item === "store_voucher" && i.status === "open");
      if (it) {
        it.status = "done";
        it.doneAt = new Date().toISOString();
        it.detail = { ...it.detail, order: orderReference };
        return true;
      }
    }
    return false;
  }

  async sync(): Promise<Record<string, unknown>> {
    return { earned: 0, mock: true };
  }
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/api/supabase/client";
import type { EncoreRepo } from "./repo";
import type {
  ItemKind,
  LedgerEntry,
  LedgerKind,
  ProgramState,
  Redemption,
  RedeemDetail,
  RedeemResult,
  Reward,
  RewardKind,
  StudentChoice,
  Tier,
} from "./types";

/**
 * Encore Points against family_hub (hub 0098), with the service role. The
 * family id passed in was resolved from the session in service.ts; the
 * database functions trust it only because this is the service role
 * (pe_caller_family).
 */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));

export class SupabaseEncoreRepo implements EncoreRepo {
  readonly mode = "live" as const;

  private get db(): SupabaseClient {
    return getServiceClient();
  }

  private fh() {
    return this.db.schema("family_hub");
  }

  async program(familyId: string): Promise<ProgramState> {
    const [{ data: row }, { data: open }] = await Promise.all([
      this.fh().from("ep_program").select("*").eq("id", 1).maybeSingle(),
      this.fh().rpc("ep_open_for", { p_family: familyId }),
    ]);
    return {
      launched: Boolean(row?.launched_at),
      paused: Boolean(row?.paused_at),
      openForFamily: Boolean(open),
      directorCents: Number(row?.director_cents ?? 150000),
      producerCents: Number(row?.producer_cents ?? 300000),
      referralPoints: Number(row?.referral_points ?? 15000),
    };
  }

  async rewards(): Promise<Reward[]> {
    const { data, error } = await this.fh().from("ep_rewards").select("*").eq("active", true).order("sort");
    if (error) throw new Error(`rewards: ${error.message}`);
    return (data ?? []).map((r: Row) => ({
      key: String(r.key),
      kind: r.kind as RewardKind,
      title: String(r.title),
      blurb: String(r.blurb ?? ""),
      points: Number(r.points),
      valueCents: Number(r.value_cents),
      size: s((r.config as Row | null)?.size),
      sort: Number(r.sort),
    }));
  }

  async ledger(familyId: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.fh()
      .from("ep_ledger").select("*").eq("family_id", familyId).order("occurred_at", { ascending: false });
    if (error) throw new Error(`ledger: ${error.message}`);
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      points: Number(r.points),
      kind: r.kind as LedgerKind,
      sourceRef: s(r.source_ref),
      spendCents: Number(r.spend_cents ?? 0),
      tier: s(r.tier) as Tier | undefined,
      occurredAt: String(r.occurred_at),
      note: s(r.note),
    }));
  }

  async redemptions(familyId: string): Promise<Redemption[]> {
    const { data, error } = await this.fh()
      .from("ep_redemptions").select("*, ep_items(*)").eq("family_id", familyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`redemptions: ${error.message}`);
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      rewardKey: String(r.reward_key),
      kind: r.kind as RewardKind,
      title: String(r.title),
      points: Number(r.points),
      studentId: s(r.student_id),
      status: r.status as Redemption["status"],
      createdAt: String(r.created_at),
      items: ((r.ep_items as Row[] | null) ?? []).map((i) => ({
        id: String(i.id),
        item: i.item as ItemKind,
        code: s(i.code),
        status: i.status as "open" | "done" | "cancelled",
        studentId: s(i.student_id),
        detail: (i.detail as Record<string, unknown>) ?? {},
        doneAt: s(i.done_at),
      })),
    }));
  }

  async students(familyId: string): Promise<StudentChoice[]> {
    const { data, error } = await this.fh()
      .from("students").select("id, first_name, last_name, preferred_name, tshirt_size, camper_id")
      .eq("family_id", familyId).order("first_name");
    if (error) throw new Error(`students: ${error.message}`);
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      name: `${s(r.preferred_name) ?? s(r.first_name) ?? ""} ${s(r.last_name) ?? ""}`.trim(),
      tshirtSize: s(r.tshirt_size),
      onPunchCard: Boolean(r.camper_id),
    }));
  }

  async redeem(familyId: string, rewardKey: string, studentId: string | null, detail: RedeemDetail): Promise<RedeemResult> {
    const { data, error } = await this.fh().rpc("ep_redeem", {
      p_family_id: familyId,
      p_reward_key: rewardKey,
      p_student_id: studentId,
      p_detail: detail,
    });
    if (error) throw new Error(error.message);
    const r = data as Row;
    return {
      id: String(r.id),
      title: String(r.title),
      points: Number(r.points),
      balance: Number(r.balance),
      codes: ((r.codes as Row[] | null) ?? []).map((c) => ({ item: c.item as ItemKind, code: String(c.code) })),
    };
  }

  async useVoucher(familyId: string, itemId: string, orderReference: string): Promise<boolean> {
    const { data, error } = await this.fh().rpc("ep_use_voucher", {
      p_family_id: familyId,
      p_item_id: itemId,
      p_order_reference: orderReference,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async sync(): Promise<Record<string, unknown>> {
    const { data, error } = await this.fh().rpc("ep_sync");
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? {};
  }
}

import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Checkout stopped requiring a mobile number on Sep 13 2026 (CJ: every field
 * between a parent and the pay button is a place to lose them), so the portal
 * has to ask instead. This card renders while no guardian on the family has a
 * phone on file and disappears the moment one does. The field itself has
 * always been on Family › Edit; nothing ever pointed at it.
 */
export async function MobileNumberCard({ familyId }: { familyId: string }) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getServiceClient()
      .from("guardians")
      .select("phone")
      .eq("family_id", familyId);
    if ((data ?? []).some((g) => g.phone && String(g.phone).replace(/\D/g, "").length >= 10)) {
      return null;
    }
  } catch {
    return null;
  }

  return (
    <Card pad={false}>
      <SectionHeader title="Add a mobile number" inCard />
      <div className="p-4">
        <Link
          href="/family/edit"
          className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted"
        >
          <Smartphone aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[13.5px] font-medium">
              We have no phone number for your family
              <ArrowRight aria-hidden size={13} className="text-muted-foreground" />
            </span>
            <span className="block text-[12px] text-muted-foreground">
              A snow day or a cancelled rehearsal should reach you by text, not
              wait in an inbox. Takes ten seconds.
            </span>
          </span>
        </Link>
      </div>
    </Card>
  );
}

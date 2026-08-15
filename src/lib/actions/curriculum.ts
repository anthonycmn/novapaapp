"use server";

import { revalidatePath } from "next/cache";
import { getServiceClient } from "@/lib/api/supabase/client";
import {
  assertUploadAllowed,
  getStorageProvider,
  UploadRejectedError,
} from "@/lib/api/storage";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Curriculum authoring (Tony's flow): a super admin/admin uploads a
 * curriculum PDF (or pastes a link) on a show's dashboard, and it pushes
 * out to that show's page for staff and families immediately. The
 * schedule bridge never overwrites a hub-authored curriculum.
 */
export type CurriculumFormState = { ok: boolean; error?: string };

export async function saveCurriculum(
  _prev: CurriculumFormState,
  formData: FormData
): Promise<CurriculumFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) {
    return { ok: false, error: "Only admins can publish curriculum." };
  }
  const productionId = String(formData.get("productionId") ?? "");
  if (!productionId) return { ok: false, error: "Missing show." };

  const link = String(formData.get("url") ?? "").trim();
  const file = formData.get("file");

  let curriculumUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type || "application/pdf"};base64,${bytes.toString("base64")}`;
    try {
      assertUploadAllowed("curriculum", dataUrl);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof UploadRejectedError ? error.message : "Upload failed.",
      };
    }
    const safeName = (file.name || "curriculum.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    const stored = await getStorageProvider().upload(
      "curriculum",
      `${productionId}/${Date.now()}-${safeName}`,
      dataUrl
    );
    // fh-curriculum is a PUBLIC bucket; families need the public URL form.
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    curriculumUrl = base
      ? `${base}/storage/v1/object/public/fh-curriculum/${stored.path}`
      : stored.url;
  } else if (link) {
    if (!/^https?:\/\//i.test(link)) {
      return { ok: false, error: "Links must start with http:// or https://." };
    }
    curriculumUrl = link;
  } else {
    return { ok: false, error: "Add a file or a link first." };
  }

  const { error } = await getServiceClient()
    .from("productions")
    .update({ curriculum_url: curriculumUrl })
    .eq("id", productionId);
  if (error) return { ok: false, error: `Save failed: ${error.message}` };

  revalidatePath(`/staff/shows/${productionId}`);
  revalidatePath(`/productions/${productionId}`);
  return { ok: true };
}

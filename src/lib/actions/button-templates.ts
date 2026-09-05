"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { assertUploadAllowed } from "@/lib/api/storage";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

/**
 * An admin gives a show its spirit-button artwork (hub 0066).
 *
 * CJ, 5 Sep 2026: "I want to be able to upload a background, and for that to
 * live on a spirit button page." The background is what every family's cutout
 * stands on, so it is admin-only (provider enforces it a second time) and it
 * lands on the template row as a data URI like every other image in the hub.
 *
 * Not logged to family_hub.activity_log: that log is the play-by-play of what
 * FAMILIES do, and this is office work.
 */

const templateSchema = z.object({
  templateId: z.string().optional(),
  productionId: z.string().min(1),
  name: z.string().min(1, "Name the template").max(80),
  seasonName: z.string().max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick an accent color"),
  /** New background (data URL); empty string = keep what's there. */
  backgroundDataUrl: z.string(),
  /** "true" removes the background entirely. */
  removeBackground: z.boolean(),
});

export async function saveButtonTemplateAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) {
    return { ok: false, errors: { _form: "Admin only" } };
  }

  const parsed = templateSchema.safeParse({
    templateId: String(formData.get("templateId") ?? "") || undefined,
    productionId: String(formData.get("productionId") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    seasonName: String(formData.get("seasonName") ?? "").trim(),
    accentColor: String(formData.get("accentColor") ?? "").trim(),
    backgroundDataUrl: String(formData.get("backgroundDataUrl") ?? ""),
    removeBackground: formData.get("removeBackground") === "true",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }
  const input = parsed.data;

  if (input.backgroundDataUrl) {
    try {
      assertUploadAllowed("button-photos", input.backgroundDataUrl);
    } catch (error) {
      return {
        ok: false,
        errors: {
          backgroundDataUrl: error instanceof Error ? error.message : "Bad image",
        },
      };
    }
  }

  const provider = getProvider();
  const existing = input.templateId
    ? (await provider.getButtonTemplates(input.productionId)).find(
        (template) => template.id === input.templateId
      )
    : undefined;

  try {
    await provider.upsertButtonTemplate(user.id, {
      id: input.templateId,
      productionId: input.productionId,
      name: input.name,
      seasonName: input.seasonName,
      accentColor: input.accentColor,
      frameImageUrl: existing?.frameImageUrl,
      logoUrl: existing?.logoUrl,
      backgroundImageUrl: input.removeBackground
        ? undefined
        : input.backgroundDataUrl || existing?.backgroundImageUrl,
      isActive: true,
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  revalidatePath("/admin/store/templates");
  revalidatePath("/store/buttons");
  return { ok: true };
}

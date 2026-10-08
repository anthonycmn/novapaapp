import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getPerformance } from "@/lib/performance";
import type { FileKind } from "@/lib/performance/types";

/**
 * Sign a one-shot upload for a backing track or sheet music (hub 0097).
 *
 * A 25 MB track cannot pass through a serverless function (6 MB body cap),
 * so the browser writes it straight to storage. Ownership is settled here,
 * before anything is signed, and the path is composed here, never taken from
 * the client: acts/<actId>/<kind>-<time>.<ext>. The attach action checks the
 * same prefix on the way back.
 *
 * In mock mode there is no bucket; the answer says so and the browser sends
 * the file as a data URL instead.
 */

const LIMITS: Record<FileKind, { types: Record<string, string>; maxBytes: number; label: string }> = {
  track: {
    types: {
      "audio/mpeg": ".mp3",
      "audio/mp3": ".mp3",
      "audio/mp4": ".m4a",
      "audio/x-m4a": ".m4a",
      "audio/m4a": ".m4a",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav",
      "audio/wave": ".wav",
    },
    maxBytes: 25 * 1024 * 1024,
    label: "backing track",
  },
  sheet_music: { types: { "application/pdf": ".pdf" }, maxBytes: 20 * 1024 * 1024, label: "sheet music PDF" },
  headshot: { types: { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }, maxBytes: 8 * 1024 * 1024, label: "headshot" },
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.familyId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { actId?: string; kind?: string; performerId?: string; contentType?: string; sizeBytes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const kind = body.kind as FileKind;
  const limits = LIMITS[kind];
  if (!limits || !body.actId) return NextResponse.json({ error: "Unknown upload." }, { status: 400 });
  const ext = limits.types[String(body.contentType)];
  if (!ext) return NextResponse.json({ error: `A ${limits.label} must be ${[...new Set(Object.values(limits.types))].join(", ")}.` }, { status: 400 });
  const size = Number(body.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Missing file size." }, { status: 400 });
  if (size > limits.maxBytes) {
    return NextResponse.json(
      { error: `That ${limits.label} is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is ${limits.maxBytes / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }
  try {
    const signed = await getPerformance().signFileUpload(user, body.actId, kind, ext, body.performerId);
    if (!signed) return NextResponse.json({ mock: true });
    return NextResponse.json(signed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare the upload." }, { status: 403 });
  }
}

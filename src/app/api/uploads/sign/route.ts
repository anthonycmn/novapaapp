import { NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import {
  getStorageProvider,
  UPLOAD_LIMITS,
  type StorageBucket,
} from "@/lib/api/storage";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Mint a one-shot URL the browser can upload a file to directly.
 *
 * The file never touches this function — only its name, type and size do, so
 * the request is a few hundred bytes whether the video is 8 MB or 400 MB. That
 * is the entire point: this app runs on serverless functions with a 6 MB
 * request-body cap, and base64 adds a third on top, so anything over about
 * four megabytes cannot reach the server at all. Handing back a signed URL
 * takes the function out of the path.
 *
 * Authorization happens HERE, before anything is signed. A signed URL is a
 * bearer capability: whoever holds it can write that exact path. So the rules
 * are checked first and the path is composed by this route rather than taken
 * from the client — otherwise a family could ask for a URL that writes over
 * another child's file.
 */

/** Which buckets a family may upload into, and what they are for. */
const FAMILY_BUCKETS: StorageBucket[] = [
  "audition-video",
  "resumes",
  "headshots",
  "audition-audio",
  "family-documents",
];

/**
 * Buckets scoped to a household rather than to one child.
 *
 * The vault holds a household's paperwork — an insurance card, a custody order
 * — and a document may be about no child in particular, so there is no student
 * to hang the path off. The family comes from the session, never from the
 * request: it is the one piece of scope a caller must not be able to choose.
 */
const FAMILY_SCOPED: StorageBucket[] = ["family-documents"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    bucket?: string;
    studentId?: string;
    contentType?: string;
    sizeBytes?: number;
    fileName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const bucket = body.bucket as StorageBucket | undefined;
  if (!bucket || !FAMILY_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });
  }

  const limits = UPLOAD_LIMITS[bucket];

  /*
   * The same limits the server enforces on a direct upload, applied before
   * signing. A signed URL cannot be taken back, so a file that would be
   * rejected has to be refused now rather than after it has been written.
   */
  if (!body.contentType || !limits.contentTypes.includes(body.contentType)) {
    return NextResponse.json(
      {
        error: `A ${limits.label} must be one of: ${limits.contentTypes.join(", ")}.`,
      },
      { status: 400 }
    );
  }
  const sizeBytes = Number(body.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (sizeBytes > limits.maxBytes) {
    return NextResponse.json(
      {
        error: `That ${limits.label} is ${(sizeBytes / 1024 / 1024).toFixed(0)} MB — the limit is ${limits.maxBytes / 1024 / 1024} MB.`,
      },
      { status: 413 }
    );
  }

  /*
   * Whose file is this? The answer is the folder it gets written to, so it is
   * settled before anything is signed.
   *
   * For a household bucket the scope is the caller's own family, taken off the
   * session. For the per-student buckets the actor has to be able to reach that
   * student: getStudent enforces the family rule and throws otherwise, which is
   * exactly the check that stops one family writing into another's folder.
   */
  let scope: string;
  if (FAMILY_SCOPED.includes(bucket)) {
    if (!user.familyId) {
      return NextResponse.json({ error: "No household on this account" }, { status: 403 });
    }
    scope = user.familyId;
  } else {
    const studentId = String(body.studentId ?? "");
    if (!studentId) {
      return NextResponse.json({ error: "Missing student" }, { status: 400 });
    }
    try {
      const student = await getProvider().getStudent(user.id, studentId);
      if (!student) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: "Not your student" }, { status: 403 });
    }
    scope = studentId;
  }

  /*
   * The path is composed here, never accepted from the client. It is scoped to
   * the household or student and stamped with the time so a re-record does not
   * have to reuse a name, and the original extension is kept only so a download
   * lands with something a computer can open.
   *
   * That scope prefix is load-bearing twice: once here, and again when the form
   * comes back and resolveUpload() checks the returned path still starts with
   * it.
   */
  const extension = safeExtension(body.fileName, body.contentType);
  const path = `${scope}/${bucket}-${Date.now()}${extension}`;

  try {
    const signed = await getStorageProvider().createSignedUpload(bucket, path);
    return NextResponse.json(signed);
  } catch (error) {
    console.error("[uploads] could not sign:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare the upload" },
      { status: 500 }
    );
  }
}

/**
 * A short, safe extension. Taken from the content type where we know it, and
 * from the file name only as a last resort — a name off a phone is arbitrary
 * text and has no business shaping a storage path.
 */
function safeExtension(fileName: unknown, contentType: string): string {
  const byType: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
    "video/mpeg": ".mpeg",
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  if (byType[contentType]) return byType[contentType];
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(String(fileName ?? ""));
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * Platform adapter: HEIC, the format an iPhone hands over.
 *
 * Every picker in the app accepts it (see image-picker.ts for why). What no
 * picker can rely on is the BROWSER opening it: Safari decodes HEIC natively,
 * and nothing else does — so on Android, on Windows, in Chrome on a Mac, the
 * same photo failed with "this browser can't open HEIC photos" and the parent
 * was sent off to change a camera setting.
 *
 * This module is the conversion, done here instead. libheif, compiled to
 * WebAssembly, turns the HEIC into a JPEG in the browser. It is ~3 MB of code
 * so it is loaded on demand and only when a HEIC actually turns up; a session
 * that never sees one never pays for it. Callers try the browser first and
 * fall back to this, so an iPhone still takes the fast path.
 *
 * What is STORED is always the JPEG. A waiver photographed as HEIC would open
 * on the parent's phone and refuse on the office laptop, and a document nobody
 * can open is a document that was never uploaded.
 */

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

/**
 * Whether a file is (or claims to be) HEIC. Phones sometimes hand over an
 * empty type, so the extension speaks when the browser does not.
 */
export function isHeicFile(file: Blob, name = ""): boolean {
  if (HEIC_TYPES.has((file.type || "").toLowerCase())) return true;
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return ext === "heic" || ext === "heif";
}

/** Default JPEG quality for a converted photo: visually lossless at print size. */
const CONVERT_QUALITY = 0.92;

/** A HEIC blob as a JPEG blob. Throws with a sentence a form can show as-is. */
export async function heicToJpegBlob(blob: Blob, quality = CONVERT_QUALITY): Promise<Blob> {
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob, type: "image/jpeg", quality });
  } catch {
    throw new Error(
      "That HEIC photo could not be opened. Try sending it to yourself first and uploading the copy, or export it as JPEG or PNG."
    );
  }
}

/** A HEIC File as a JPEG File, renamed to match so the stored path says what it is. */
export async function heicToJpegFile(file: File, quality = CONVERT_QUALITY): Promise<File> {
  const jpeg = await heicToJpegBlob(file, quality);
  const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([jpeg], name, { type: "image/jpeg", lastModified: file.lastModified });
}

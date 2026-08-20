/**
 * Platform adapter: reading an image the user picked (web implementation).
 * A native wrapper swaps this for the camera/photo-library plugin while
 * keeping the same return shape.
 */

export interface PickedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  type: string;
}

/**
 * What a parent may CHOOSE. It is not what we send.
 *
 * HEIC is on this list because it is what an iPhone hands over unless somebody
 * has been into Settings and picked "Most Compatible", and telling half the
 * families their own camera roll is the wrong format is not an option. Storage
 * accepts none of it, so everything is re-encoded to JPEG below and it is the
 * JPEG that goes up.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** The largest file we will take off a camera roll before re-encoding. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * The long edge we keep. Headshots are cropped out of this and printed at
 * 2400px wide (see headshot-cropper), so it has to stay comfortably above that
 * for a crop of part of the frame to still hold up in the programme.
 */
export const MAX_EDGE = 3200;

/**
 * How big the encoded data URL may get.
 *
 * This is the whole reason the re-encode exists. These photos travel to the
 * server inside a form post to a serverless function, and the request-body cap
 * on this host is 6 MB — base64 adds a third on top, so a raw 5 MB phone photo
 * is already over the line and is dropped at the edge, before any code of ours
 * runs and before anything can explain itself. 3.5 MB of data URL leaves room
 * for the rest of the form and lands well inside the cap.
 */
export const MAX_ENCODED_BYTES = 3 * 1024 * 1024;

/** The request-body cap on this host. Nothing larger reaches our code at all. */
export const FUNCTION_BODY_CAP_BYTES = 6 * 1024 * 1024;

/** What base64 does to a payload on the way out: four characters per three bytes. */
export const BASE64_OVERHEAD = 4 / 3;

/**
 * What a face-matching upload gets instead of the defaults.
 *
 * That form posts up to MAX_REFERENCE_PHOTOS (4) photos in ONE request, so the
 * single-photo budget above would blow the 6 MB cap four times over — which is
 * exactly the error a parent hit adding three photos. Matching does not need
 * print resolution either, so these are both far smaller.
 */
export const REFERENCE_PHOTO_BUDGET: ImageBudget = {
  maxEdge: 1600,
  maxBytes: 700 * 1024,
};

/** Quality ladder, walked down until the encoded photo fits the budget. */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55];

export interface ImageBudget {
  /** Longest edge to keep, in pixels. */
  maxEdge?: number;
  /** Largest the encoded data URL may be, in bytes. */
  maxBytes?: number;
}

export class ImageRejectedError extends Error {}

/** Scale a frame down so its long edge fits, never up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Bytes a data URL actually weighs, without allocating the buffer. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageRejectedError("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function decode(dataUrl: string, isHeic: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new ImageRejectedError(
          isHeic
            ? "This browser can't open HEIC photos. On an iPhone, Settings ▸ Camera ▸ Formats ▸ Most Compatible will save new photos as JPEG, or send the photo to yourself first and choose the copy."
            : "That file doesn't look like an image."
        )
      );
    image.src = dataUrl;
  });
}

/**
 * Reads a File the parent picked and returns a JPEG small enough to post.
 *
 * Type and size are enforced here (the "every uploaded file is type/size-
 * restricted" rule) and the server checks again, but the re-encode is what
 * makes the upload possible at all: it is the difference between a 9 MB HEIC
 * off a phone, which cannot reach the server and fails with nothing useful on
 * screen, and a 1 MB JPEG, which simply works. Resolution is returned so
 * callers can still warn about low-res prints.
 */
export async function readImageFile(
  file: File,
  budget: ImageBudget = {}
): Promise<PickedImage> {
  // Some Android pickers and share sheets hand over an empty type. Fall back to
  // the extension rather than refusing a photo that is probably fine.
  const declaredType = file.type || guessTypeFromName(file.name);
  if (!ACCEPTED_IMAGE_TYPES.includes(declaredType)) {
    throw new ImageRejectedError("Please choose a JPEG, PNG, HEIC, or WebP photo.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please choose one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
    );
  }

  const sourceDataUrl = await readAsDataUrl(file);
  const isHeic = declaredType === "image/heic" || declaredType === "image/heif";
  const image = await decode(sourceDataUrl, isHeic);

  const encoded = encodeToBudget(
    image,
    budget.maxEdge ?? MAX_EDGE,
    budget.maxBytes ?? MAX_ENCODED_BYTES
  );
  if (!encoded) {
    throw new ImageRejectedError(
      "That photo is too large to upload even after shrinking. Please choose another."
    );
  }
  return encoded;
}

function guessTypeFromName(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "";
}

/**
 * Draw, encode, and if it is still too heavy try again — first with less
 * quality, then at half the size. A photo that will not fit at the bottom of
 * the ladder is refused rather than sent to fail at the edge.
 */
function encodeToBudget(
  image: HTMLImageElement,
  startEdge: number,
  maxBytes: number
): PickedImage | null {
  const source = { width: image.naturalWidth, height: image.naturalHeight };

  for (const maxEdge of [startEdge, Math.round(startEdge / 2), Math.round(startEdge / 4)]) {
    const size = fitWithin(source.width, source.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no transparency; a PNG logo would otherwise go black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const bytes = dataUrlBytes(dataUrl);
      if (bytes <= maxBytes) {
        return {
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          bytes,
          type: "image/jpeg",
        };
      }
    }
  }
  return null;
}

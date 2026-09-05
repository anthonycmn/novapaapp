/**
 * Cutting the performer out of a photo, in the parent's own browser.
 *
 * CJ, 5 Sep 2026: "parents upload a headshot of their child and the system
 * cuts out the headshot and puts it onto the spirit button." The cutting is
 * MediaPipe's selfie-segmentation model — a 250 KB network that runs locally
 * via wasm, so the photo never leaves the device for a third-party API and
 * there is no per-image bill. Model and wasm runtime are served from our own
 * public/ (see scripts/copy-mediapipe-assets.mjs), not a CDN.
 *
 * The model returns a confidence per pixel, not a hard edge. The alpha ramp
 * below (FEATHER_LOW→FEATHER_HIGH) turns that into a feathered edge on
 * purpose: a soft transition survives printing at 3" far better than a hard
 * threshold, which reads as a sticker. Wispy hair will still soften — that is
 * the honest limit of on-device segmentation — and the parent sees the exact
 * result before anything is ordered.
 *
 * Everything throws CutoutUnavailableError on any failure (wasm blocked, old
 * browser, no person found), and the form falls back to the plain photo —
 * a family must always be able to order a button.
 */

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

export class CutoutUnavailableError extends Error {}

/**
 * Long edge of the working canvas. The performer occupies about 2.2" of a 3"
 * print at 300 DPI (~660 px), so 1200 px keeps a comfortable margin above
 * print resolution while holding the cutout PNG to roughly a megabyte —
 * it travels back to the server inside a 6 MB form post next to the print
 * file (see image-picker's MAX_ENCODED_BYTES rationale).
 */
const WORK_MAX_EDGE = 1200;

/** Confidence below LOW is background, above HIGH is person, between feathers. */
const FEATHER_LOW = 0.35;
const FEATHER_HIGH = 0.75;

/** Alpha (0–255) above which a pixel counts toward the subject's bounding box. */
const BBOX_ALPHA = 40;

/** Margin kept around the subject when cropping, as a fraction of its size. */
const CROP_MARGIN = 0.05;

/**
 * Below this share of person-pixels the "cutout" is almost certainly noise —
 * a photo of a stage, a pet, an empty room — and the plain photo is more
 * honest than a shredded silhouette.
 */
const MIN_COVERAGE = 0.04;

export interface CutoutResult {
  /** Transparent PNG of the subject, cropped to its bounding box. */
  dataUrl: string;
  width: number;
  height: number;
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/**
 * One segmenter per page, created on first use. The wasm runtime is ~11 MB,
 * so nothing loads until a parent actually picks a photo.
 */
function getSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = {
      baseOptions: { modelAssetPath: "/models/selfie_segmenter.tflite" },
      runningMode: "IMAGE" as const,
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    };
    try {
      return await ImageSegmenter.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "GPU" },
      });
    } catch {
      // No usable WebGL (some Android WebViews, remote desktops) — CPU is
      // slower but this model is small enough not to care.
      return ImageSegmenter.createFromOptions(fileset, options);
    }
  })();
  // A failed load must not poison every later attempt with a stale rejection.
  segmenterPromise.catch(() => {
    segmenterPromise = null;
  });
  return segmenterPromise;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new CutoutUnavailableError("Could not read that photo."));
    image.src = dataUrl;
  });
}

/** 0 below `low`, 1 above `high`, smooth in between. */
function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * Cut the person out of a photo. Returns a transparent PNG cropped to the
 * subject. Throws CutoutUnavailableError when it can't or shouldn't.
 */
export async function cutOutPerson(photoDataUrl: string): Promise<CutoutResult> {
  let segmenter: ImageSegmenter;
  try {
    segmenter = await getSegmenter();
  } catch {
    throw new CutoutUnavailableError(
      "The photo cutter could not load in this browser."
    );
  }

  const image = await loadImage(photoDataUrl);
  const scale = Math.min(1, WORK_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new CutoutUnavailableError("No canvas available.");
  context.drawImage(image, 0, 0, width, height);

  const result = segmenter.segment(canvas);
  try {
    const mask = result.confidenceMasks?.[0];
    if (!mask) throw new CutoutUnavailableError("The photo cutter returned nothing.");
    const confidences = mask.getAsFloat32Array();
    const maskWidth = mask.width;
    const maskHeight = mask.height;

    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;

    let personPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      // The mask normally matches the input size; index defensively so a
      // model that answers at its own resolution still maps correctly.
      const maskY = maskHeight === height ? y : Math.floor((y * maskHeight) / height);
      for (let x = 0; x < width; x++) {
        const maskX = maskWidth === width ? x : Math.floor((x * maskWidth) / width);
        const confidence = confidences[maskY * maskWidth + maskX];
        const alpha = Math.round(smoothstep(FEATHER_LOW, FEATHER_HIGH, confidence) * 255);
        pixels[(y * width + x) * 4 + 3] = alpha;
        if (alpha > BBOX_ALPHA) {
          personPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || personPixels / (width * height) < MIN_COVERAGE) {
      throw new CutoutUnavailableError(
        "We couldn't find a person in that photo, so it will be used as-is."
      );
    }

    context.putImageData(frame, 0, 0);

    const marginX = Math.round((maxX - minX) * CROP_MARGIN);
    const marginY = Math.round((maxY - minY) * CROP_MARGIN);
    const cropX = Math.max(0, minX - marginX);
    const cropY = Math.max(0, minY - marginY);
    const cropWidth = Math.min(width, maxX + marginX) - cropX;
    const cropHeight = Math.min(height, maxY + marginY) - cropY;

    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) throw new CutoutUnavailableError("No canvas available.");
    croppedContext.drawImage(
      canvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return {
      dataUrl: cropped.toDataURL("image/png"),
      width: cropWidth,
      height: cropHeight,
    };
  } finally {
    result.close();
  }
}

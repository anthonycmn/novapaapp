/**
 * The one drawing of a spirit button.
 *
 * CJ, 5 Sep 2026: the parent must see "what their spirit button is going to
 * look like before it even gets printed", and the office sends that same
 * image to the button producer. The only way those two promises hold together
 * is a single renderer: this module draws the button once, at whatever pixel
 * size it's asked for. The form shows the drawing scaled down; the submit
 * posts the drawing at press resolution. There is no second layout to drift.
 *
 * Layout mirrors the proportions ButtonPreview established (banner at the
 * bottom, show pill on top, accent-derived text colors) so pre-cutout designs
 * and the new ones read as the same product.
 */

import type { ButtonSize } from "@/lib/api/types";
import { darken, readableTextOn } from "@/lib/color";

export const PRINT_DPI = 300;

/**
 * Full-bleed artwork diameter per face size, in inches — the circle the
 * producer's die actually cuts, larger than the face because the edge wraps
 * around the back. These are the standard Tecre/ABM wrap allowances; if the
 * producer's spec sheet says different numbers, this table is the only thing
 * to change.
 */
export const CUT_DIAMETER_IN: Record<ButtonSize, number> = {
  "2.25": 2.633,
  "3": 3.313,
  "3.5": 3.813,
};

export const FACE_DIAMETER_IN: Record<ButtonSize, number> = {
  "2.25": 2.25,
  "3": 3,
  "3.5": 3.5,
};

export interface ButtonArtworkSpec {
  /** Show background (data URL). Absent = accent radial gradient. */
  backgroundUrl?: string;
  accentColor: string;
  /** The performer image (data URL); a transparent cutout or a plain photo. */
  photoUrl?: string;
  /** True when photoUrl has a transparent background and should stand ON the
   *  background; false draws the legacy photo-well circle. */
  photoIsCutout: boolean;
  studentName: string;
  role: string;
  showTitle: string;
  size: ButtonSize;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(dataUrl);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read an image for the button."));
      image.src = dataUrl;
    });
    // The cache is keyed by the full data URL, so it never serves stale art;
    // it only spares re-decoding the same image on every keystroke.
    if (imageCache.size > 8) imageCache.clear();
    imageCache.set(dataUrl, cached);
  }
  return cached;
}

/** Draw `image` covering a circle centred at (cx, cy) with radius r. */
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cx: number,
  cy: number,
  r: number
) {
  const scale = Math.max((r * 2) / image.naturalWidth, (r * 2) / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, cx - width / 2, cy - height / 2, width, height);
}

/** Shrink the font until the text fits, then draw it centred at (cx, y). */
function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  px: number,
  weight: number
) {
  const family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  let size = px;
  context.font = `${weight} ${size}px ${family}`;
  while (size > px * 0.55 && context.measureText(text).width > maxWidth) {
    size -= Math.max(1, px * 0.05);
    context.font = `${weight} ${size}px ${family}`;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, cx, y, maxWidth);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * Draw the button at `diameterPx` (the full-bleed cut circle). Returns the
 * square canvas; corners outside the circle are white.
 */
export async function renderButtonArtwork(
  spec: ButtonArtworkSpec,
  diameterPx: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = diameterPx;
  canvas.height = diameterPx;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser would not give us a canvas to draw on.");

  const c = diameterPx / 2;
  const cutR = diameterPx / 2;
  // The face is what shows on the front; everything meaningful stays inside it.
  const faceR = cutR * (FACE_DIAMETER_IN[spec.size] / CUT_DIAMETER_IN[spec.size]);
  const accent = spec.accentColor || "#8e1f2f";
  const onAccent = readableTextOn(accent);
  // Font sizes follow ButtonPreview's print CSS (0.16in name / 0.12in role /
  // 0.11in title on the face), scaled to this canvas's pixels-per-inch.
  const ppi = (faceR * 2) / FACE_DIAMETER_IN[spec.size];

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, diameterPx, diameterPx);

  /* ---- background, filling the whole cut circle (full bleed) ---- */
  context.save();
  context.beginPath();
  context.arc(c, c, cutR, 0, Math.PI * 2);
  context.clip();

  if (spec.backgroundUrl) {
    drawCover(context, await loadImage(spec.backgroundUrl), c, c, cutR);
  } else {
    // The accent gradient the buttons launched with, so template-less shows
    // still look deliberate.
    const gradient = context.createRadialGradient(
      c * 0.6,
      c * 0.5,
      cutR * 0.1,
      c,
      c,
      cutR
    );
    gradient.addColorStop(0, accent);
    gradient.addColorStop(0.6, accent);
    gradient.addColorStop(1, darken(accent, 0.35));
    context.fillStyle = gradient;
    context.fillRect(0, 0, diameterPx, diameterPx);
  }

  /* ---- the performer ---- */
  const bannerHeight = spec.role ? faceR * 2 * 0.2 : faceR * 2 * 0.14;
  const bannerBottom = c + faceR * 0.86;
  const bannerTop = bannerBottom - bannerHeight;

  if (spec.photoUrl && spec.photoIsCutout) {
    const photo = await loadImage(spec.photoUrl);
    // Bottom-anchored so the performer stands on the banner like a portrait
    // bust; tucked slightly behind it so a cropped chin never floats.
    const maxHeight = bannerTop - (c - faceR * 0.62);
    const maxWidth = faceR * 2 * 0.8;
    const scale = Math.min(maxHeight / photo.naturalHeight, maxWidth / photo.naturalWidth);
    const width = photo.naturalWidth * scale;
    const height = photo.naturalHeight * scale;
    context.drawImage(
      photo,
      c - width / 2,
      bannerTop + bannerHeight * 0.25 - height,
      width,
      height
    );
  } else if (spec.photoUrl) {
    // Legacy look: the photo fills a white well inset from the face.
    const wellR = faceR * 0.93;
    context.save();
    context.beginPath();
    context.arc(c, c, wellR, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#ffffff";
    context.fillRect(c - wellR, c - wellR, wellR * 2, wellR * 2);
    const photo = await loadImage(spec.photoUrl);
    // objectPosition "center 35%" from the CSS preview: bias toward the face.
    const scale = Math.max(
      (wellR * 2) / photo.naturalWidth,
      (wellR * 2) / photo.naturalHeight
    );
    const width = photo.naturalWidth * scale;
    const height = photo.naturalHeight * scale;
    context.drawImage(
      photo,
      c - width / 2,
      c - wellR - (height - wellR * 2) * 0.35,
      width,
      height
    );
    context.restore();
  }

  /* ---- name + role banner ---- */
  if (spec.studentName) {
    const bannerWidth = faceR * 2 * 0.86;
    context.fillStyle = accent;
    roundedRect(context, c - bannerWidth / 2, bannerTop, bannerWidth, bannerHeight, ppi * 0.045);
    context.fill();

    context.fillStyle = onAccent;
    const namePx = ppi * 0.16;
    const rolePx = ppi * 0.12;
    if (spec.role) {
      fitText(context, spec.studentName, c, bannerTop + bannerHeight * 0.32, bannerWidth * 0.92, namePx, 700);
      fitText(context, spec.role, c, bannerTop + bannerHeight * 0.72, bannerWidth * 0.92, rolePx, 500);
    } else {
      fitText(context, spec.studentName, c, bannerTop + bannerHeight * 0.52, bannerWidth * 0.92, namePx, 700);
    }
  }

  /* ---- show title pill along the top ---- */
  if (spec.showTitle) {
    const titlePx = ppi * 0.11;
    const pillWidth = faceR * 2 * 0.76;
    const pillHeight = titlePx * 1.7;
    const pillTop = c - faceR * 0.86;
    context.fillStyle = accent;
    roundedRect(context, c - pillWidth / 2, pillTop, pillWidth, pillHeight, pillHeight / 2);
    context.fill();
    context.fillStyle = onAccent;
    fitText(context, spec.showTitle, c, pillTop + pillHeight * 0.54, pillWidth * 0.9, titlePx, 600);
  }

  context.restore();
  return canvas;
}

/**
 * The file that goes to the button producer: the full-bleed circle at
 * 300 DPI, flattened to JPEG (the artwork has no transparency left, and
 * JPEG keeps the form post a third the weight of PNG).
 */
export async function renderPrintFile(spec: ButtonArtworkSpec): Promise<string> {
  const diameterPx = Math.round(CUT_DIAMETER_IN[spec.size] * PRINT_DPI);
  const canvas = await renderButtonArtwork(spec, diameterPx);
  return canvas.toDataURL("image/jpeg", 0.92);
}

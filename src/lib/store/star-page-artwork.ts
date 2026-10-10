/**
 * The one drawing of a playbill star page.
 *
 * CJ, 8 Oct 2026: "I will upload the graphic and then they can upload the
 * photo and text and it will show them what it will look like. I want them to
 * be available for purchase."
 *
 * CJ, 10 Oct 2026: one graphic per page size, each with its photo spaces
 * already drawn on it (one on the quarter and half pages, two on the full),
 * and "allow parents the agency to choose color fonts and different texts."
 * So the photos go exactly into the black spaces the graphic has, found by
 * lib/store/star-page-layout, and the family's words - in their font and
 * their color - go in the open stretch of graphic left over.
 *
 * Same promise as the spirit button renderer (lib/store/button-artwork): the
 * parent's preview and the file the playbill designer receives are the SAME
 * drawing at two sizes. The form shows it scaled down; add-to-cart posts it at
 * 300 DPI. There is no second layout to drift.
 *
 * A graphic with no photo space in it (an older single graphic) still draws
 * the original layout: the graphic edge to edge, the photo in a white-bordered
 * frame, the words on a soft white panel.
 */

import { BUTTON_FONTS, DEFAULT_BUTTON_FONT } from "@/lib/store/button-artwork";
import { findPhotoFrames, textRegion, type Rect } from "@/lib/store/star-page-layout";

export const STAR_PAGE_DPI = 300;

/**
 * Trim width of each ad, in inches, for a half-letter (5.5" × 8.5") playbill.
 * The height follows the show's own graphic for that size, so the page is
 * never stretched; these heights are only used when there is no graphic.
 * If the printer's spec sheet says different numbers, this table is the only
 * thing to change - preview, print file and the admin sample all read it.
 */
export const STAR_PAGE_SIZE_IN: Record<string, { width: number; height: number }> = {
  quarter: { width: 2.5, height: 4 },
  half: { width: 5, height: 4 },
  full: { width: 5, height: 8 },
};

export const STAR_PAGE_SIZES = ["quarter", "half", "full"] as const;

export function starPageSize(option: string, artworkAspect?: number) {
  const base = STAR_PAGE_SIZE_IN[option] ?? STAR_PAGE_SIZE_IN.full;
  if (!artworkAspect) return base;
  return { width: base.width, height: Math.round((base.width / artworkAspect) * 100) / 100 };
}

/** Lettering a family may choose - the spirit buttons' web-safe list. */
export const STAR_PAGE_FONTS = BUTTON_FONTS;
export const DEFAULT_STAR_PAGE_FONT =
  BUTTON_FONTS.find((font) => font.label === "Serif")?.value ?? DEFAULT_BUTTON_FONT;

/** Text colors offered as swatches; the form also has a free color picker. */
export const STAR_PAGE_COLORS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Cream", value: "#f3ead8" },
  { label: "White", value: "#ffffff" },
  { label: "Gold", value: "#e2b857" },
  { label: "Red", value: "#e0313b" },
  { label: "Pink", value: "#f39bc0" },
  { label: "Sky", value: "#8fd3ff" },
  { label: "Black", value: "#111111" },
];
export const DEFAULT_STAR_PAGE_COLOR = STAR_PAGE_COLORS[0].value;

export interface StarPageSpec {
  /** The show's graphic for this page size (data URL), uploaded by the office. */
  artworkUrl?: string;
  /** The family's photos (data URLs), one per photo space, in reading order. */
  photoUrls: (string | undefined)[];
  /** The headline - the performer's name, or whatever the family writes. */
  studentName: string;
  /** Printed exactly as written - line breaks honored, nothing reformatted. */
  message: string;
  signature: string;
  /** quarter | half | full */
  pageSize: string;
  /** A STAR_PAGE_FONTS value. */
  fontFamily?: string;
  /** #rrggbb */
  textColor?: string;
}

/** A graphic's layout, as fractions of its width and height. */
export interface StarPageLayout {
  aspect: number;
  frames: Rect[];
  text?: Rect;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(dataUrl);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read an image for the star page."));
      image.src = dataUrl;
    });
    if (imageCache.size > 12) imageCache.clear();
    imageCache.set(dataUrl, cached);
  }
  return cached;
}

const layoutCache = new Map<string, Promise<StarPageLayout>>();

/**
 * Where the photo spaces and the words go on one graphic. Read once per
 * graphic from a copy at most 800 px long - plenty to find a box to the pixel
 * at print size once scaled back up, and quick on a phone.
 */
export function starPageLayout(artworkUrl: string): Promise<StarPageLayout> {
  let cached = layoutCache.get(artworkUrl);
  if (!cached) {
    cached = (async () => {
      const image = await loadImage(artworkUrl);
      const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const aspect = image.naturalWidth / image.naturalHeight;
      if (!context) return { aspect, frames: [] };
      context.drawImage(image, 0, 0, width, height);
      const frames = findPhotoFrames(context.getImageData(0, 0, width, height));
      const fraction = (r: Rect): Rect => ({
        x: r.x / width,
        y: r.y / height,
        width: r.width / width,
        height: r.height / height,
      });
      return {
        aspect,
        frames: frames.map(fraction),
        text: frames.length ? fraction(textRegion(width, height, frames)) : undefined,
      };
    })();
    if (layoutCache.size > 12) layoutCache.clear();
    layoutCache.set(artworkUrl, cached);
  }
  return cached;
}

/** Draw `image` covering the rectangle, centered, cropped not stretched. */
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(
    image,
    x + (width - drawnWidth) / 2,
    y + (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight
  );
  context.restore();
}

/** Draw `image` whole inside the rectangle (letterboxed), returning where it landed. */
function drawContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const left = x + (width - drawnWidth) / 2;
  const top = y + (height - drawnHeight) / 2;
  return { left, top, drawnWidth, drawnHeight, draw: () => context.drawImage(image, left, top, drawnWidth, drawnHeight) };
}

function roundRect(
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
 * Wrap the message into lines that fit `maxWidth`, keeping the parent's own
 * line breaks (blank lines included). A single word wider than the box is
 * left whole; the font shrinks until it fits instead.
 */
function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line && context.measureText(candidate.trimEnd()).width > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Perceived lightness of #rrggbb, 0 (black) to 1 (white). */
function lightness(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 1;
  const n = parseInt(match[1], 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

/**
 * Lay the headline, message and signature into a box: the largest font that
 * fits wins, so a short note prints big and a long one still fits.
 */
function drawTextBlock(
  context: CanvasRenderingContext2D,
  spec: StarPageSpec,
  box: { x: number; y: number; width: number; height: number },
  basePx: number,
  ink: { color: string; muted: string; shadow?: string }
) {
  const family = spec.fontFamily || DEFAULT_STAR_PAGE_FONT;
  const { x, y, width, height } = box;
  const cx = x + width / 2;
  const name = spec.studentName.trim() || "Your performer";
  const message = spec.message || "Your message will appear here, exactly as you write it.";
  const signature = spec.signature.trim();

  for (let scale = 1; scale >= 0.3; scale -= 0.05) {
    const namePx = basePx * 1.5 * scale;
    const bodyPx = basePx * scale;
    const lineHeight = bodyPx * 1.3;

    context.font = `700 ${namePx}px ${family}`;
    const nameFits = context.measureText(name).width <= width || scale <= 0.3;
    context.font = `400 ${bodyPx}px ${family}`;
    const lines = wrapLines(context, message, width);
    const widest = Math.max(0, ...lines.map((line) => context.measureText(line).width));
    const total =
      namePx * 1.35 + lines.length * lineHeight + (signature ? lineHeight * 1.5 : 0);

    if ((total <= height && widest <= width && nameFits) || scale <= 0.3) {
      let cursor = y + Math.max(0, (height - total) / 2);
      context.save();
      if (ink.shadow) {
        context.shadowColor = ink.shadow;
        context.shadowBlur = bodyPx * 0.35;
        context.shadowOffsetY = bodyPx * 0.06;
      }
      context.fillStyle = ink.color;
      context.textAlign = "center";
      context.textBaseline = "top";

      context.font = `700 ${namePx}px ${family}`;
      context.fillText(name, cx, cursor, width);
      cursor += namePx * 1.35;

      context.font = `400 ${bodyPx}px ${family}`;
      context.fillStyle = spec.message ? ink.color : ink.muted;
      for (const line of lines) {
        context.fillText(line, cx, cursor, width);
        cursor += lineHeight;
      }

      if (signature) {
        cursor += lineHeight * 0.5;
        context.font = `italic 600 ${bodyPx}px ${family}`;
        context.fillStyle = ink.color;
        context.fillText(signature, cx, cursor, width);
      }
      context.restore();
      return;
    }
  }
}

/** A photo space still waiting for its photo: say which one. */
function drawEmptyFrame(
  context: CanvasRenderingContext2D,
  frame: { x: number; y: number; width: number; height: number },
  label: string
) {
  const px = Math.min(frame.width, frame.height) * 0.09;
  context.save();
  context.fillStyle = "rgba(255,255,255,0.55)";
  context.font = `500 ${px}px ${DEFAULT_BUTTON_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, frame.x + frame.width / 2, frame.y + frame.height / 2, frame.width * 0.9);
  context.restore();
}

/**
 * Draw the star page at `pxPerInch`. Returns the canvas; the caller scales it
 * for the screen or encodes it for the printer.
 */
export async function renderStarPage(
  spec: StarPageSpec,
  pxPerInch: number
): Promise<HTMLCanvasElement> {
  const layout = spec.artworkUrl ? await starPageLayout(spec.artworkUrl) : undefined;
  const size = starPageSize(spec.pageSize, layout?.aspect);
  const width = Math.round(size.width * pxPerInch);
  const height = Math.round(size.height * pxPerInch);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the star page.");

  // The show's graphic, edge to edge.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  if (spec.artworkUrl) {
    drawCover(context, await loadImage(spec.artworkUrl), 0, 0, width, height);
  }

  if (layout && layout.frames.length > 0 && layout.text) {
    await drawIntoFrames(context, spec, layout, width, height);
  } else {
    await drawClassic(context, spec, width, height);
  }
  return canvas;
}

/** The graphic has photo spaces: fill them, and set the words in the open space. */
async function drawIntoFrames(
  context: CanvasRenderingContext2D,
  spec: StarPageSpec,
  layout: StarPageLayout,
  width: number,
  height: number
) {
  const toPx = (r: Rect) => ({
    x: r.x * width,
    y: r.y * height,
    width: r.width * width,
    height: r.height * height,
  });

  for (const [index, fraction] of layout.frames.entries()) {
    const frame = toPx(fraction);
    const photo = spec.photoUrls[index];
    if (photo) {
      drawCover(context, await loadImage(photo), frame.x, frame.y, frame.width, frame.height);
    } else {
      drawEmptyFrame(
        context,
        frame,
        layout.frames.length > 1 ? `Photo ${index + 1}` : "Your photo"
      );
    }
  }

  const color = spec.textColor || DEFAULT_STAR_PAGE_COLOR;
  const light = lightness(color) > 0.5;
  const box = toPx(layout.text!);
  drawTextBlock(context, spec, box, Math.min(width, height) * 0.06, {
    color,
    muted: light ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
    // A soft shadow behind light lettering keeps it readable over busy art.
    shadow: light ? "rgba(0,0,0,0.65)" : undefined,
  });
}

/** No photo space in the graphic: the original star page layout. */
async function drawClassic(
  context: CanvasRenderingContext2D,
  spec: StarPageSpec,
  width: number,
  height: number
) {
  const landscape = width > height;
  const short = Math.min(width, height);
  const margin = short * 0.07;
  const gap = short * 0.04;
  /* A band at the top and bottom stays clear, so the show's own title and
     logo in the graphic are never covered by the family's content. */
  const top = height * 0.12;
  const bottom = height * 0.1;
  const inner = height - top - bottom;

  const photoBox = landscape
    ? { x: margin, y: top, w: (width - margin * 2 - gap) * 0.45, h: inner }
    : { x: margin, y: top, w: width - margin * 2, h: (inner - gap) * 0.52 };
  const panel = landscape
    ? {
        x: photoBox.x + photoBox.w + gap,
        y: top,
        w: width - margin * 2 - gap - photoBox.w,
        h: inner,
      }
    : {
        x: margin,
        y: photoBox.y + photoBox.h + gap,
        w: width - margin * 2,
        h: inner - gap - photoBox.h,
      };

  const border = short * 0.012;
  const photoUrl = spec.photoUrls[0];
  if (photoUrl) {
    const placed = drawContain(
      context,
      await loadImage(photoUrl),
      photoBox.x + border,
      photoBox.y + border,
      photoBox.w - border * 2,
      photoBox.h - border * 2
    );
    context.save();
    context.shadowColor = "rgba(0,0,0,0.25)";
    context.shadowBlur = short * 0.02;
    context.fillStyle = "#ffffff";
    context.fillRect(
      placed.left - border,
      placed.top - border,
      placed.drawnWidth + border * 2,
      placed.drawnHeight + border * 2
    );
    context.restore();
    placed.draw();
  } else {
    context.save();
    context.fillStyle = "rgba(255,255,255,0.75)";
    context.strokeStyle = "rgba(0,0,0,0.3)";
    context.lineWidth = Math.max(1, short * 0.004);
    context.setLineDash([short * 0.02, short * 0.015]);
    roundRect(context, photoBox.x, photoBox.y, photoBox.w, photoBox.h, short * 0.02);
    context.fill();
    context.stroke();
    context.restore();
    context.fillStyle = "#6b6b6b";
    context.font = `500 ${short * 0.045}px ${DEFAULT_BUTTON_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Your photo", photoBox.x + photoBox.w / 2, photoBox.y + photoBox.h / 2);
  }

  // A soft white panel so the words read on any artwork.
  context.save();
  context.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(context, panel.x, panel.y, panel.w, panel.h, short * 0.025);
  context.fill();
  context.restore();

  /* On the white panel a light color would vanish, so the chosen color is
     used only when it is dark enough to read there. */
  const chosen = spec.textColor || DEFAULT_STAR_PAGE_COLOR;
  const pad = short * 0.04;
  drawTextBlock(
    context,
    spec,
    { x: panel.x + pad, y: panel.y + pad, width: panel.w - pad * 2, height: panel.h - pad * 2 },
    short * 0.05,
    { color: lightness(chosen) < 0.6 ? chosen : "#1a1a1a", muted: "#8a8a8a" }
  );
}

/** The file the playbill designer receives: 300 DPI JPEG, drawn as previewed. */
export async function renderStarPagePrintFile(spec: StarPageSpec): Promise<string> {
  const canvas = await renderStarPage(spec, STAR_PAGE_DPI);
  return canvas.toDataURL("image/jpeg", 0.9);
}

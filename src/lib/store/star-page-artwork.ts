/**
 * The one drawing of a playbill star page.
 *
 * CJ, 8 Oct 2026: "I will upload the graphic and then they can upload the
 * photo and text and it will show them what it will look like. I want them to
 * be available for purchase."
 *
 * Same promise as the spirit button renderer (lib/store/button-artwork): the
 * parent's preview and the file the playbill designer receives are the SAME
 * drawing at two sizes. The form shows it scaled down; add-to-cart posts it at
 * 300 DPI. There is no second layout to drift.
 *
 * Layout: the show's graphic fills the page edge to edge (cropped to fit, never
 * stretched); the family's photo sits in a white-bordered frame; the name,
 * message and signature sit on a soft white panel so they read on any artwork.
 * Portrait sizes stack photo over text; the landscape half page sets them side
 * by side.
 */

import { DEFAULT_BUTTON_FONT } from "@/lib/store/button-artwork";

export const STAR_PAGE_DPI = 300;

/**
 * Trim size of each ad, in inches, for a half-letter (5.5" × 8.5") playbill.
 * If the printer's spec sheet says different numbers, this table is the only
 * thing to change - preview, print file and the admin sample all read it.
 */
export const STAR_PAGE_SIZE_IN: Record<string, { width: number; height: number }> = {
  quarter: { width: 2.5, height: 4 },
  half: { width: 5, height: 4 },
  full: { width: 5, height: 8 },
};

export function starPageSize(option: string) {
  return STAR_PAGE_SIZE_IN[option] ?? STAR_PAGE_SIZE_IN.full;
}

export interface StarPageSpec {
  /** The show's graphic (data URL), uploaded by the office. */
  artworkUrl?: string;
  /** The family's photo (data URL). */
  photoUrl?: string;
  studentName: string;
  /** Printed exactly as written - line breaks honored, nothing reformatted. */
  message: string;
  signature: string;
  /** quarter | half | full */
  pageSize: string;
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
    if (imageCache.size > 8) imageCache.clear();
    imageCache.set(dataUrl, cached);
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

/**
 * Lay the name, message and signature into a box: the largest font that fits
 * wins, so a short note prints big and a long one still fits.
 */
function drawTextBlock(
  context: CanvasRenderingContext2D,
  spec: StarPageSpec,
  x: number,
  y: number,
  width: number,
  height: number,
  basePx: number
) {
  const family = DEFAULT_BUTTON_FONT;
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
      context.fillStyle = "#1a1a1a";
      context.textAlign = "center";
      context.textBaseline = "top";

      context.font = `700 ${namePx}px ${family}`;
      context.fillText(name, cx, cursor, width);
      cursor += namePx * 1.35;

      context.font = `400 ${bodyPx}px ${family}`;
      context.fillStyle = spec.message ? "#2b2b2b" : "#8a8a8a";
      for (const line of lines) {
        context.fillText(line, cx, cursor, width);
        cursor += lineHeight;
      }

      if (signature) {
        cursor += lineHeight * 0.5;
        context.font = `italic 600 ${bodyPx}px ${family}`;
        context.fillStyle = "#1a1a1a";
        context.fillText(signature, cx, cursor, width);
      }
      return;
    }
  }
}

/**
 * Draw the star page at `pxPerInch`. Returns the canvas; the caller scales it
 * for the screen or encodes it for the printer.
 */
export async function renderStarPage(
  spec: StarPageSpec,
  pxPerInch: number
): Promise<HTMLCanvasElement> {
  const size = starPageSize(spec.pageSize);
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

  const landscape = width > height;
  const short = Math.min(width, height);
  const margin = short * 0.07;
  const gap = short * 0.04;
  /* A band at the top and bottom stays clear, so the show's own title and
     logo in the graphic are never covered by the family's content. */
  const top = height * 0.12;
  const bottom = height * 0.1;
  const inner = height - top - bottom;

  // Photo box and text panel.
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
  if (spec.photoUrl) {
    const placed = drawContain(
      context,
      await loadImage(spec.photoUrl),
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

  const pad = short * 0.04;
  drawTextBlock(
    context,
    spec,
    panel.x + pad,
    panel.y + pad,
    panel.w - pad * 2,
    panel.h - pad * 2,
    short * 0.05
  );

  return canvas;
}

/** The file the playbill designer receives: 300 DPI JPEG, drawn as previewed. */
export async function renderStarPagePrintFile(spec: StarPageSpec): Promise<string> {
  const canvas = await renderStarPage(spec, STAR_PAGE_DPI);
  return canvas.toDataURL("image/jpeg", 0.9);
}

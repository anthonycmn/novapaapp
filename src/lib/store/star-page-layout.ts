/**
 * Where a star page's photos and words go, read off the show's own graphic.
 *
 * CJ, 10 Oct 2026: the office designs one graphic per page size (quarter,
 * half, full) with the photo spaces already drawn on it - a cream-bordered
 * black box, one on the quarter and half pages and two on the full page -
 * and "when they upload the photo(s) put it in the black space."
 *
 * So the layout is not a fixed template: it is found in the artwork. A photo
 * space is a solid near-black, neutral (not dark red) rectangle with a light
 * border around it. The family's words go in the biggest stretch of graphic
 * left over: below the photo spaces on the portrait pages, beside them on the
 * landscape half page.
 *
 * Pure functions over raw RGBA so the same code runs in the browser renderer
 * and in the tests. A graphic with no photo space found falls back to the
 * original layout (lib/store/star-page-artwork), so an older single graphic
 * still draws.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel - an ImageData's data. */
  data: Uint8ClampedArray | Uint8Array;
}

function lum(data: Pixels["data"], i: number) {
  return (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
}

/** The black fill of a photo space: dark, and grey rather than red. */
function isFrameFill(data: Pixels["data"], i: number) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const l = lum(data, i);
  return l >= 8 && l <= 48 && spread <= 14;
}

/** The light mat around a photo space. */
function isLight(data: Pixels["data"], i: number) {
  return lum(data, i) >= 165;
}

/**
 * Every photo space in the graphic, in reading order (left to right, then top
 * to bottom), in the graphic's own pixel coordinates.
 */
export function findPhotoFrames(pixels: Pixels): Rect[] {
  const { width, height, data } = pixels;
  const seen = new Uint8Array(width * height);
  const minArea = width * height * 0.02;
  const frames: Rect[] = [];
  const stack: number[] = [];

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !isFrameFill(data, start * 4)) continue;

    // Flood fill one dark region, tracking its bounding box.
    let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && !seen[n] && isFrameFill(data, n * 4)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }

    const rect = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    const fill = count / (rect.width * rect.height);
    if (count < minArea || fill < 0.85) continue;
    if (!hasLightBorder(pixels, rect)) continue;
    frames.push(rect);
  }

  return frames.sort((a, b) =>
    Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2 ? a.x - b.x : a.y - b.y
  );
}

/**
 * The mat check that tells a photo space from a patch of dark background:
 * just outside the box, at least most of the samples are light.
 */
function hasLightBorder(pixels: Pixels, rect: Rect): boolean {
  const { width, height, data } = pixels;
  const offset = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  const samples = 24;
  let light = 0;
  let total = 0;
  const probe = (x: number, y: number) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    total++;
    if (isLight(data, (py * width + px) * 4)) light++;
  };
  for (let s = 0; s < samples; s++) {
    const t = (s + 0.5) / samples;
    probe(rect.x + rect.width * t, rect.y - offset);
    probe(rect.x + rect.width * t, rect.y + rect.height - 1 + offset);
    probe(rect.x - offset, rect.y + rect.height * t);
    probe(rect.x + rect.width - 1 + offset, rect.y + rect.height * t);
  }
  return total > 0 && light / total >= 0.7;
}

/**
 * The biggest open stretch of graphic for the words, beside or below the
 * photo spaces. The top 30% is never offered beside them: that is where the
 * show's title sits on every graphic so far, and the words must not cover it.
 */
export function textRegion(width: number, height: number, frames: Rect[]): Rect {
  const margin = Math.min(width, height) * 0.05;
  const left = Math.min(...frames.map((f) => f.x));
  const top = Math.min(...frames.map((f) => f.y));
  const right = Math.max(...frames.map((f) => f.x + f.width));
  const bottom = Math.max(...frames.map((f) => f.y + f.height));
  const titleBand = height * 0.3;

  const candidates: Rect[] = [
    // Below the photos, full width.
    { x: margin, y: bottom + margin, width: width - margin * 2, height: height - bottom - margin * 2 },
    // Right of the photos.
    {
      x: right + margin,
      y: Math.max(top, titleBand),
      width: width - right - margin * 2,
      height: height - Math.max(top, titleBand) - margin,
    },
    // Left of the photos.
    {
      x: margin,
      y: Math.max(top, titleBand),
      width: left - margin * 2,
      height: height - Math.max(top, titleBand) - margin,
    },
  ].filter((r) => r.width > 0 && r.height > 0);

  if (candidates.length === 0) {
    return { x: margin, y: height - height * 0.2, width: width - margin * 2, height: height * 0.2 - margin };
  }
  return candidates.reduce((best, r) => (r.width * r.height > best.width * best.height ? r : best));
}

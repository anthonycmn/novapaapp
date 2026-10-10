import { describe, expect, it } from "vitest";
import { findPhotoFrames, textRegion, type Rect } from "@/lib/store/star-page-layout";

/** A graphic like CJ's: dark red background, cream-matted black photo spaces. */
function graphic(width: number, height: number, frames: Rect[], extras: (x: number, y: number) => number[] | null = () => null) {
  const data = new Uint8ClampedArray(width * height * 4);
  const mat = 6;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb = extras(x, y) ?? [120, 10, 14];
      for (const f of frames) {
        const inMat = x >= f.x - mat && x < f.x + f.width + mat && y >= f.y - mat && y < f.y + f.height + mat;
        const inFrame = x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height;
        if (inMat) rgb = [235, 227, 211];
        if (inFrame) rgb = [24, 21, 23];
      }
      const i = (y * width + x) * 4;
      data.set([rgb[0], rgb[1], rgb[2], 255], i);
    }
  }
  return { width, height, data };
}

describe("star page layout", () => {
  it("finds two photo spaces on a full page, left to right, with the words below", () => {
    const frames = [
      { x: 20, y: 60, width: 80, height: 115 },
      { x: 120, y: 60, width: 80, height: 115 },
    ];
    const found = findPhotoFrames(graphic(220, 330, frames));
    expect(found).toEqual(frames);
    const region = textRegion(220, 330, found);
    expect(region.y).toBeGreaterThan(175);
    expect(region.width).toBeGreaterThan(180);
  });

  it("puts the words beside the photo on a landscape half page, below the title band", () => {
    const frames = [{ x: 15, y: 30, width: 120, height: 150 }];
    const found = findPhotoFrames(graphic(300, 220, frames));
    expect(found).toEqual(frames);
    const region = textRegion(300, 220, found);
    expect(region.x).toBeGreaterThan(135);
    expect(region.y).toBeGreaterThanOrEqual(220 * 0.3);
  });

  it("ignores dark background that has no light mat around it", () => {
    // A black band across the bottom, like the fade on CJ's portrait graphics.
    const found = findPhotoFrames(
      graphic(200, 300, [], (_x, y) => (y > 220 ? [22, 20, 21] : null))
    );
    expect(found).toEqual([]);
  });

  it("ignores dark red, which is background, not a photo space", () => {
    const found = findPhotoFrames(
      graphic(200, 300, [], (x, y) => (x > 40 && x < 160 && y > 40 && y < 200 ? [45, 8, 10] : null))
    );
    expect(found).toEqual([]);
  });
});

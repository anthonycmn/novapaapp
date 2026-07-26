import { BUTTON_MIN_PIXELS, type ButtonSize } from "@/lib/api/types";

/**
 * Print-quality rules for uploaded photos (#11).
 * A button is a circle, so the limiting dimension is the SHORTER side.
 */

export type PhotoQuality = "good" | "marginal" | "low";

export interface QualityAssessment {
  quality: PhotoQuality;
  /** Effective DPI at the chosen physical size. */
  dpi: number;
  message?: string;
}

export function assessPhotoQuality(
  width: number,
  height: number,
  size: ButtonSize
): QualityAssessment {
  const shortEdge = Math.min(width, height);
  const required = BUTTON_MIN_PIXELS[size];
  const dpi = Math.round(shortEdge / Number(size));

  if (shortEdge >= required) {
    return { quality: "good", dpi };
  }
  // Below ~200 DPI is visibly soft; below 150 is unacceptable.
  if (dpi >= 200) {
    return {
      quality: "marginal",
      dpi,
      message: `This photo is a little small for a ${size}" button (about ${dpi} DPI). It will print, but may look slightly soft.`,
    };
  }
  return {
    quality: "low",
    dpi,
    message: `This photo is too small for a ${size}" button (about ${dpi} DPI — we recommend ${required}px on the short side). It will look blurry when pressed. Try a larger photo, or choose a smaller button.`,
  };
}

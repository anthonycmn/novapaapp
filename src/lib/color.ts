/**
 * Contrast helpers for colours that aren't known at build time.
 *
 * Design tokens are checked statically by tests/contrast.test.ts, but each
 * production picks its own spirit-button accent colour at runtime. Fixed
 * white text on an arbitrary accent fails WCAG AA for anything mid-tone —
 * the Frozen Jr. blue (#4f8fd6) gives 3.37:1 against white — so the
 * foreground has to be chosen from the background.
 */

const NEAR_BLACK = "#111111";
const WHITE = "#ffffff";

function toChannels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toChannels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whichever of white / near-black reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(NEAR_BLACK, background)
    ? WHITE
    : NEAR_BLACK;
}

/**
 * Darken a colour by `amount` (0–1) in sRGB. Used to deepen a light accent
 * so white text can stay white where the design calls for it.
 */
export function darken(hex: string, amount: number): string {
  const channels = toChannels(hex).map((channel) =>
    Math.max(0, Math.round(channel * (1 - amount)))
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

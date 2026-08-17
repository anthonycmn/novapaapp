import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WCAG 2.1 AA contrast, computed from the actual design tokens in
 * globals.css rather than asserted by hand. If someone changes a colour and
 * breaks contrast, this fails.
 *
 * Thresholds (WCAG 1.4.3 / 1.4.11):
 *   4.5:1 — normal body text
 *   3:1   — large text (>=24px, or >=18.66px bold) and UI component borders
 */

const CSS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8"
);

/**
 * Pull colour tokens out of a `:root { }` / `.dark { }` block.
 *
 * Handles both `#hex` and `rgb(r g b / a)`. The translucent form matters: the
 * gold wash behind a tip is 12% gold, and a contrast check that skipped it
 * would silently stop testing the one token most likely to go pale-on-pale.
 * Alpha is composited over the block's own --card, which is what those washes
 * actually sit on.
 */
function readTokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!block) throw new Error(`No ${selector} block found in globals.css`);

  const tokens: Record<string, string> = {};
  const translucent: Array<[string, [number, number, number], number]> = [];

  for (const match of block[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    tokens[match[1]] = match[2];
  }
  for (const match of block[1].matchAll(
    /--([\w-]+):\s*rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\);/g
  )) {
    translucent.push([
      match[1],
      [Number(match[2]), Number(match[3]), Number(match[4])],
      Number(match[5]),
    ]);
  }

  const backdrop = tokens.card ?? tokens.background;
  if (translucent.length > 0 && !backdrop) {
    throw new Error(`${selector} has translucent tokens but no --card to composite over`);
  }
  for (const [name, [r, g, b], alpha] of translucent) {
    tokens[name] = flatten([r, g, b], alpha, backdrop!);
  }
  return tokens;
}

/** Composite a translucent colour over an opaque one, as the browser would. */
function flatten(
  [r, g, b]: [number, number, number],
  alpha: number,
  over: string
): string {
  const base = toRgb(over);
  const mix = [r, g, b].map((channel, index) =>
    Math.round(channel * alpha + base[index] * (1 - alpha))
  );
  return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const light = readTokens(":root");
const dark = readTokens(".dark");

/** Foreground/background pairs the UI actually renders. */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ["body text", "foreground", "background"],
  ["card text", "card-foreground", "card"],
  ["muted text on page", "muted-foreground", "background"],
  ["muted text on muted", "muted-foreground", "muted"],
  ["primary button", "primary-foreground", "primary"],
  ["secondary button", "secondary-foreground", "secondary"],
  ["accent callout", "accent-foreground", "accent"],
  ["tip of the day", "tip-foreground", "tip"],
  // "Your next call" — the loud yellow band. It carries an 11px uppercase
  // label, so it is body text by WCAG's reckoning and gets the full 4.5:1.
  ["your next call", "tip-foreground", "tip-strong"],
  ["destructive button", "destructive-foreground", "destructive"],
];

/** Non-text UI that must clear 3:1 (WCAG 1.4.11). */
const UI_PAIRS: Array<[string, string, string]> = [
  ["focus ring on page", "ring", "background"],
  ["focus ring on card", "ring", "card"],
  ["primary fill on page", "primary", "background"],
];

describe("WCAG AA contrast — light theme", () => {
  it.each(TEXT_PAIRS)("%s clears 4.5:1", (_name, fg, bg) => {
    expect(light[fg], `missing --${fg}`).toBeDefined();
    expect(light[bg], `missing --${bg}`).toBeDefined();
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("%s clears 3:1", (_name, fg, bg) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("WCAG AA contrast — dark theme", () => {
  it.each(TEXT_PAIRS)("%s clears 4.5:1", (_name, fg, bg) => {
    expect(dark[fg], `missing --${fg}`).toBeDefined();
    expect(dark[bg], `missing --${bg}`).toBeDefined();
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("%s clears 3:1", (_name, fg, bg) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("both themes define the same tokens", () => {
  it("has no token present in one theme but missing from the other", () => {
    const lightKeys = Object.keys(light).sort();
    const darkKeys = Object.keys(dark).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});

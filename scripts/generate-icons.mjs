/**
 * Builds the PWA icons from the NOVA PA logo (public/brand/novapa-logo.png),
 * composited onto the brand navy so the maskable icon has no transparent
 * edges. Uses `sharp`, which ships with Next.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BRAND_NAVY = { r: 0x08, g: 0x11, b: 0x1f, alpha: 1 };
const SOURCE = join(process.cwd(), "public", "brand", "novapa-logo.png");
const OUT_DIR = join(process.cwd(), "public", "icons");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "sharp is not available. Install it (`npm i -D sharp`) or export the icons by hand.\n" +
      "The app still runs without this step; only the PWA icons are affected."
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

/**
 * @param size   output square size
 * @param inset  fraction of the canvas left as padding around the mark.
 *               Maskable icons get a bigger inset so the safe zone (the
 *               centre 80%) still contains the whole logo after a launcher
 *               crops it to a circle or squircle.
 */
async function build(name, size, inset) {
  const logoSize = Math.round(size * (1 - inset * 2));
  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_NAVY },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(OUT_DIR, name));

  console.log(`wrote icons/${name} (${size}x${size})`);
}

await build("icon-192.png", 192, 0.12);
await build("icon-512.png", 512, 0.12);
await build("icon-maskable-512.png", 512, 0.2);
await build("apple-touch-icon.png", 180, 0.12);

/**
 * Builds the PWA icons and the browser favicon from the NOVA PA logo
 * (public/brand/novapa-logo.png), composited onto the brand navy so the
 * maskable icon has no transparent edges. Uses `sharp`, which ships with Next.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRAND_NAVY = { r: 0x08, g: 0x11, b: 0x1f, alpha: 1 };
const SOURCE = join(process.cwd(), "public", "brand", "novapa-logo.png");
const OUT_DIR = join(process.cwd(), "public", "icons");
// Next's file convention: src/app/favicon.ico is served at /favicon.ico and
// gets its own <link rel="icon"> — which is what stops browsers probing for
// the file and logging a 404 on every page.
const FAVICON = join(process.cwd(), "src", "app", "favicon.ico");

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

/** The same navy square as the PWA icons, at one favicon size, as a PNG. */
async function faviconPng(size) {
  const logoSize = Math.round(size * (1 - 0.08 * 2));
  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_NAVY },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

/**
 * Pack PNGs into an .ico. Windows Vista and every browser since accept PNG
 * payloads inside an ICO container, so this is just a 6-byte header, a
 * 16-byte directory entry per size, then the PNGs themselves. sharp has no
 * ICO encoder, and this is small enough not to be worth a dependency.
 */
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for truecolor
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const FAVICON_SIZES = [16, 32, 48];
const pngs = await Promise.all(
  FAVICON_SIZES.map(async (size) => ({ size, data: await faviconPng(size) }))
);
writeFileSync(FAVICON, packIco(pngs));
console.log(`wrote src/app/favicon.ico (${FAVICON_SIZES.join(", ")}px)`);

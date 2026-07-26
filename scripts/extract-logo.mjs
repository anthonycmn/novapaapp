/**
 * One-off: pulls the NOVA PA logo out of the marketing site's inline
 * base64 <img> tags and writes it to public/brand/.
 *
 * Usage: node scripts/extract-logo.mjs "<path to site index.html>"
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/extract-logo.mjs "<path to index.html>"');
  process.exit(1);
}

const html = readFileSync(source, "utf8");
const matches = [...html.matchAll(/<img[^>]*src="data:image\/(png|svg\+xml|jpeg);base64,([^"]+)"[^>]*>/g)];

if (matches.length === 0) {
  console.error("No inline base64 images found.");
  process.exit(1);
}

const outDir = join(process.cwd(), "public", "brand");
mkdirSync(outDir, { recursive: true });

matches.slice(0, 5).forEach((match, index) => {
  const ext = match[1] === "svg+xml" ? "svg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  const name = `logo-${index}.${ext}`;
  writeFileSync(join(outDir, name), buffer);
  // Alt text helps identify which one is the real logo.
  const alt = /alt="([^"]*)"/.exec(match[0])?.[1] ?? "";
  console.log(`${name}  ${buffer.length} bytes  alt="${alt}"`);
});

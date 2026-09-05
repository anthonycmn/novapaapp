/**
 * Copy the MediaPipe vision wasm runtime out of node_modules into public/,
 * where the spirit-button cutout (lib/store/segmentation.ts) loads it from.
 *
 * Copied at build time rather than committed: the files are ~33 MB of binary
 * that must exactly match the installed @mediapipe/tasks-vision version, and
 * a build-time copy can never drift the way a committed snapshot can. The
 * destination is gitignored. Runs as predev/prebuild, so both `next dev` and
 * the Netlify build have the files before Next looks at public/.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const destination = join(root, "public", "mediapipe", "wasm");

if (!existsSync(source)) {
  console.error("copy-mediapipe-assets: @mediapipe/tasks-vision is not installed.");
  process.exit(1);
}

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`copy-mediapipe-assets: wasm runtime → public/mediapipe/wasm`);

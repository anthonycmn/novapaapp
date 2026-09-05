import { NextResponse } from "next/server";

/**
 * Digital Asset Links: the handshake that lets the Play Store app open
 * portal.novapa.org full-screen, with no browser chrome (Tier 2, 5 Sep
 * 2026 — "do tier 2 now").
 *
 * Android verifies this file when the TWA app launches. It must list the
 * SHA-256 fingerprint of the certificate the installed APK is signed
 * with — which, under Play App Signing, is GOOGLE'S certificate, and it
 * only exists once the app has been created in the Play Console (Test and
 * release → Setup → App signing). Chicken and egg, resolved by env:
 *
 *   ANDROID_CERT_FINGERPRINTS =
 *     AA:BB:...  or several, comma-separated (Play's app-signing cert,
 *     plus the upload cert so a locally-installed build verifies too).
 *
 * Until the env var is set this serves an empty relation list — valid
 * JSON, verifying nothing, breaking nothing. The browser tab and the
 * installed-PWA path never consult this file.
 */
const PACKAGE_NAME = "org.novapa.portal";

export async function GET() {
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(statements, {
    headers: {
      // Play verifies at install/launch; an hour of cache is plenty fresh
      // and spares the function invocations.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

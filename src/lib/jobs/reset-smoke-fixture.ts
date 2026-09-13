/**
 * The test parent the sign-in check (lib/jobs/reset-smoke) signs in as. Kept
 * in a file that imports nothing, because lib/activity has to know the name
 * to keep the fixture out of the family play-by-play, and the job itself
 * pulls in the whole provider layer.
 *
 * Created by scripts/create-smoke-parent.mjs: an auth user, a "Smoke Test"
 * family, a profile and a guardian row — the three rows a real login needs
 * ([[portal-login-needs-three-rows]]) — and no children, no enrollments, no
 * email that would ever be sent to it.
 */
export const SMOKE_PARENT_EMAIL = "portal-test@novapa.org";
export const SMOKE_FAMILY_NAME = "Smoke Test Family";

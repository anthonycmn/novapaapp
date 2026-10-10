import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { broadcastPushToAllParents, cleanAudience, pushAudienceOptions, pushReach } from "@/lib/push/broadcast";

/**
 * Push to every parent — the staff portal's door into the same send the
 * hub's /admin/push uses (CJ, 9 Oct 2026: "I want to push the notification
 * from the staff portal to the parent portal").
 *
 * GET answers the reach numbers for the composer — for every parent, or for
 * the families enrolled in ?audience={"productionIds":[…],"classIds":[…],
 * "programIds":[…]} — plus, with ?options=1, the shows, classes, and
 * programs there are to pick from (CJ, 10 Oct 2026). POST sends, to the
 * same audience shape in its body. Admins only, judged by the caller's
 * family_hub profile role, same as /admin/push.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

async function admin(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  return user && hasRoleAtLeast(user, "admin") ? user : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  if (!(await admin(request))) {
    return NextResponse.json({ error: "Only an admin can send to every family." }, { status: 403, headers: corsHeaders() });
  }
  const params = request.nextUrl.searchParams;
  let audience = {};
  try {
    audience = cleanAudience(JSON.parse(params.get("audience") || "{}"));
  } catch {
    return NextResponse.json({ error: "Bad audience" }, { status: 400, headers: corsHeaders() });
  }
  const [reach, options] = await Promise.all([
    pushReach(audience),
    params.get("options") === "1" ? pushAudienceOptions() : Promise.resolve(undefined),
  ]);
  return NextResponse.json({ reach, ...(options !== undefined ? { options } : {}) }, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const user = await admin(request);
  if (!user) {
    return NextResponse.json({ error: "Only an admin can send to every family." }, { status: 403, headers: corsHeaders() });
  }

  let input: { title?: unknown; body?: unknown; url?: unknown; urgent?: unknown; audience?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: corsHeaders() });
  }

  const result = await broadcastPushToAllParents(user, {
    title: typeof input.title === "string" ? input.title : "",
    body: typeof input.body === "string" ? input.body : "",
    url: typeof input.url === "string" ? input.url : "",
    urgent: input.urgent === true,
    audience: cleanAudience(input.audience),
  });
  if (!result.ok) {
    const error = result.message ?? Object.values(result.errors ?? {})[0] ?? "Not sent.";
    return NextResponse.json({ error, errors: result.errors }, { status: 400, headers: corsHeaders() });
  }
  return NextResponse.json(result, { headers: corsHeaders() });
}

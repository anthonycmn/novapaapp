import { NextResponse } from "next/server";
import { mockReset, mockSetSignupClose, mockState } from "@/lib/performance/repo-mock";

/**
 * Mock mode only: move an event's sign-up deadline, or reset the demo
 * events, so "the deadline passed" can be walked in the preview without
 * waiting. Answers 404 in live mode, always.
 *
 *   /api/performance/mock?close=<eventId>          closes it now
 *   /api/performance/mock?open=<eventId>           reopens it for 10 days
 *   /api/performance/mock?reset=1
 *   /api/performance/mock?event=<eventId>&reqVideo=off|optional|required
 */
export async function GET(request: Request) {
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase") {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("reset")) {
    mockReset();
    return NextResponse.json({ ok: true, reset: true });
  }
  const reqVideo = url.searchParams.get("reqVideo");
  if (reqVideo && ["off", "optional", "required"].includes(reqVideo)) {
    const e = mockState().events.find((x) => x.id === url.searchParams.get("event"));
    if (!e) return NextResponse.json({ ok: false }, { status: 404 });
    e.reqVideo = reqVideo as typeof e.reqVideo;
    return NextResponse.json({ ok: true, reqVideo });
  }
  const close = url.searchParams.get("close");
  const open = url.searchParams.get("open");
  const id = close ?? open;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const when = close ? new Date(Date.now() - 60_000) : new Date(Date.now() + 10 * 86400_000);
  return NextResponse.json({ ok: mockSetSignupClose(id, when.toISOString()), signupClosesAt: when.toISOString() });
}

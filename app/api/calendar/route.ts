import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildIcs } from "@/lib/calendar-ics";
import { listMyCalendar } from "@/services/researcher-journey";

// The signed-in researcher's calendar as a downloadable .ics file. Session-authenticated like any
// page; no calendar provider is involved.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your calendar." }, { status: 401 });
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const items = await listMyCalendar();
  const body = buildIcs(items.map((i) => ({ uid: i.uid, title: i.title, startsAt: i.startsAt, endsAt: i.endsAt, url: new URL(i.href, origin).toString(), description: i.detail })));
  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="unpatched-calendar.ics"',
      "cache-control": "private, no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { listLessons } from "@/lib/db/queries";
import { getRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the dashboard while any lesson is still processing. */
export async function GET() {
  if (!(await getRole())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json({ lessons: listLessons() });
}

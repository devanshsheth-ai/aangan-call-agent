import { NextRequest, NextResponse } from "next/server";
import { liveDeps } from "@/lib/deps";
import { handleEvent } from "@/lib/pipeline";
import { parseVaaniEvent, tokenOk } from "@/lib/vaani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const authed = (req: NextRequest) => tokenOk(req.nextUrl.searchParams.get("token"), process.env.VAANI_WEBHOOK_SECRET);

/** Lets you confirm the URL and token from a browser. Does nothing else. */
export async function GET(req: NextRequest) {
  return authed(req) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 401 });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body is not JSON" }, { status: 400 });
  }

  const event = parseVaaniEvent(payload);
  try {
    const result = await handleEvent(event, liveDeps());
    console.log("vaani webhook", event.kind, result.status, result.classification ?? "", result.errors?.length ?? 0);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // A 500 makes Vaani retry, and the pipeline is idempotent, so a retry is safe.
    console.error("vaani webhook failed", event.kind, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "processing failed" }, { status: 500 });
  }
}

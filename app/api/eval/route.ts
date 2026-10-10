import { NextRequest, NextResponse } from "next/server";
import { classifyCall } from "@/lib/classify";
import { auditAgentTurns } from "@/lib/guard";
import { parseTranscript, tokenOk } from "@/lib/vaani";
import type { Turn } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dry run: classify one transcript and return the result. It never touches the database, email or HubSpot,
 * so it is safe to run against real transcripts. Body: JSON {"transcript": "...", "summary": "..."} or plain text.
 */
export async function POST(req: NextRequest) {
  if (!tokenOk(req.nextUrl.searchParams.get("token"), process.env.VAANI_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  let text = raw;
  let summary = "";
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      text = String(j.transcript ?? "");
      summary = typeof j.summary === "string" ? j.summary : "";
    }
  } catch {
    // plain text body
  }
  if (!text.trim()) return NextResponse.json({ ok: false, error: "empty transcript" }, { status: 400 });

  let transcript: Turn[] = parseTranscript(text);
  if (!transcript.length) transcript = [{ role: "TRANSCRIPT", text }];

  try {
    const { result, costInr } = await classifyCall({ summary, collected: {}, transcript, callTime: new Date().toISOString() });
    return NextResponse.json({ ok: true, ...result, price_flag_lines: auditAgentTurns(transcript), cost_llm_inr: costInr });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "classification failed" }, { status: 502 });
  }
}

import crypto from "node:crypto";
import type { NormalisedCall, Turn, VaaniEvent } from "./types";

/** Constant-time compare that does not leak length. */
export function safeEqual(a: string, b: string): boolean {
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

/** Vaani AI webhooks are unsigned, so the secret travels in the URL: ?token=<VAANI_WEBHOOK_SECRET>. */
export function tokenOk(token: string | null, secret: string | undefined): boolean {
  return !!token && !!secret && safeEqual(token, secret);
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asString = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** "[13:33:14] AGENT: hi\n\n[13:33:19] USER: hello" -> turns. Continuation lines join the previous turn. */
export function parseTranscript(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split(/\r?\n+/)) {
    const m = line.match(/^\s*(?:\[[^\]]*\]\s*)?(AGENT|USER|CALLER|CUSTOMER|BOT|ASSISTANT)\s*:\s*(.*)$/i);
    if (m) turns.push({ role: /^(USER|CALLER|CUSTOMER)$/i.test(m[1]) ? "CALLER" : "AGENT", text: m[2].trim() });
    else if (line.trim() && turns.length) turns[turns.length - 1].text += " " + line.trim();
  }
  return turns;
}

export function transcriptText(turns: Turn[]): string {
  return turns.map((t) => (t.role === "TRANSCRIPT" ? t.text : `${t.role}: ${t.text}`)).join("\n");
}

const SLOT_KEYS =["booked_slot", "appointment_time", "consultation_slot", "slot", "appointment"];

/** Reads an ISO date-time the Vaani post-call extraction may have produced. Anything else is ignored. */
function slotFromEntities(entities: Record<string, unknown>): string | null {
  for (const k of SLOT_KEYS) {
    const v = asString(entities[k]);
    if (v && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  }
  return null;
}

/**
 * Vaani AI event shapes (docs.vaanivoice.ai/guides/webhook-setup):
 *  call_started        flat: { event, room_name, status, phone_number }
 *  call_ended          flat: { event, room_name, call_duration (SECONDS), end_reason }
 *  call_failed         flat: { event, room_name, status, error }
 *  call_postprocessing { event, call_id, timestamp, data: { room_name, call_duration (MILLISECONDS, sometimes
 *                        missing), summary, entities, dispositions, recording_url, transcript (string) } }
 */
export function parseVaaniEvent(payload: unknown): VaaniEvent {
  const p = asObject(payload);
  const event = String(p.event ?? p.type ?? "");
  const d = Object.keys(asObject(p.data)).length ? asObject(p.data) : p;
  const callId = asString(d.room_name) ?? asString(d.call_id) ?? asString(p.room_name) ?? asString(p.call_id);

  if (event === "call_started" && callId) {
    return { kind: "started", callId, callerNumber: asString(d.phone_number) ?? asString(p.phone_number) };
  }
  if (event === "call_ended" && callId) {
    return { kind: "ended", callId, durationSec: Math.round(asNumber(d.call_duration)) };
  }
  if ((event === "call_failed" || event === "call_rejected" || event === "call_no_answer") && callId) {
    return { kind: "failed", callId, reason: asString(d.error) ?? asString(d.status) ?? event };
  }
  if (event === "call_postprocessing") {
    const entities = asObject(d.entities);
    const dispositions = asObject(d.dispositions);
    const transcript = typeof d.transcript === "string" ? parseTranscript(d.transcript) : [];
    return {
      kind: "postprocessing",
      call: {
        // Never drop a finished call just because its id is missing.
        callId: callId ?? `unknown-${crypto.randomUUID()}`,
        callerNumber: asString(d.phone_number) ?? asString(entities.phone) ?? asString(entities.phone_number),
        endedAt: asString(p.timestamp) ? new Date(String(p.timestamp)).toISOString() : null,
        durationSec: Math.round(asNumber(d.call_duration) / 1000),
        endReason: asString(d.end_reason),
        summary: asString(d.summary) ?? "",
        collected: { ...entities, ...(Object.keys(dispositions).length ? { dispositions } : {}) },
        transcript,
        recordingUrl: asString(d.recording_url),
        bookedSlot: slotFromEntities(entities),
      },
    };
  }
  return { kind: "ignored", event: event || "unknown" };
}

/** Studio hours are 10am to 7pm IST. */
export function isAfterHours(iso: string | Date | null): boolean {
  const d = iso ? new Date(iso) : new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(d)
  );
  return hour < 10 || hour >= 19;
}

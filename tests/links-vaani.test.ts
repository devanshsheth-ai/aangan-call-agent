import test from "node:test";
import assert from "node:assert/strict";
import { sign, verify } from "../lib/links";
import { coerceClassification } from "../lib/classify";
import { isAfterHours, parseTranscript, parseVaaniEvent, tokenOk } from "../lib/vaani";

test("signed links verify only for the same id and action", () => {
  const s = sign("abc", "claim", "secret");
  assert.equal(verify("abc", "claim", s, "secret"), true);
  assert.equal(verify("abc", "reschedule", s, "secret"), false);
  assert.equal(verify("abd", "claim", s, "secret"), false);
  assert.equal(verify("abc", "claim", s, "other"), false);
  assert.equal(verify("abc", "claim", null, "secret"), false);
  assert.equal(verify("abc", "claim", "", "secret"), false);
});

test("webhook token check", () => {
  assert.equal(tokenOk("s3cret", "s3cret"), true);
  assert.equal(tokenOk("wrong", "s3cret"), false);
  assert.equal(tokenOk(null, "s3cret"), false);
  assert.equal(tokenOk("anything", undefined), false);
  assert.equal(tokenOk("", ""), false);
});

test("transcript parser handles timestamps, USER/AGENT and wrapped lines", () => {
  const t = parseTranscript("[13:33:14] AGENT: Namaste, Aangan Studio.\n\n[13:33:19] USER: Hi, I need a 3BHK done\nin Baner.\n[13:33:30] AGENT: Sure.");
  assert.deepEqual(t, [
    { role: "AGENT", text: "Namaste, Aangan Studio." },
    { role: "CALLER", text: "Hi, I need a 3BHK done in Baner." },
    { role: "AGENT", text: "Sure." },
  ]);
  assert.deepEqual(parseTranscript("no speaker labels here"), []);
});

test("call_started", () => {
  assert.deepEqual(parseVaaniEvent({ event: "call_started", room_name: "r1", status: "started", phone_number: "+919800000000" }), {
    kind: "started", callId: "r1", callerNumber: "+919800000000",
  });
});

test("call_ended reads seconds, call_failed reads the error", () => {
  assert.deepEqual(parseVaaniEvent({ event: "call_ended", room_name: "r1", call_duration: 95.4, end_reason: "hangup" }), {
    kind: "ended", callId: "r1", durationSec: 95,
  });
  assert.deepEqual(parseVaaniEvent({ event: "call_failed", room_name: "r1", error: "no answer" }), {
    kind: "failed", callId: "r1", reason: "no answer",
  });
});

test("call_postprocessing converts milliseconds, parses the transcript and keeps entities", () => {
  const ev = parseVaaniEvent({
    event: "call_postprocessing",
    call_id: "c9",
    timestamp: "2026-10-10T08:30:00Z",
    data: {
      room_name: "r1",
      call_duration: 120000,
      end_reason: "hangup",
      summary: "Wants 3BHK interiors",
      entities: { name: "Priya", booked_slot: "2026-10-14T11:00:00+05:30" },
      dispositions: { outcome: "booked" },
      recording_url: "https://example.test/rec.mp3",
      transcript: "[10:00:00] AGENT: Hello\n[10:00:03] USER: Hi",
    },
  });
  assert.equal(ev.kind, "postprocessing");
  if (ev.kind !== "postprocessing") return;
  assert.equal(ev.call.callId, "r1");
  assert.equal(ev.call.durationSec, 120);
  assert.equal(ev.call.transcript.length, 2);
  assert.equal(ev.call.bookedSlot, "2026-10-14T05:30:00.000Z");
  assert.deepEqual(ev.call.collected, { name: "Priya", booked_slot: "2026-10-14T11:00:00+05:30", dispositions: { outcome: "booked" } });
});

test("a postprocessing event without an id is still kept", () => {
  const ev = parseVaaniEvent({ event: "call_postprocessing", data: { transcript: "AGENT: hi" } });
  assert.equal(ev.kind, "postprocessing");
  if (ev.kind === "postprocessing") assert.match(ev.call.callId, /^unknown-/);
});

test("unknown and malformed payloads are ignored, not thrown", () => {
  assert.equal(parseVaaniEvent({ event: "call_something_new" }).kind, "ignored");
  assert.equal(parseVaaniEvent(null).kind, "ignored");
  assert.equal(parseVaaniEvent("nope").kind, "ignored");
  assert.equal(parseVaaniEvent({ event: "call_started" }).kind, "ignored");
});

test("after-hours is outside 10:00 to 19:00 IST", () => {
  assert.equal(isAfterHours("2026-10-10T04:29:00Z"), true); // 09:59 IST
  assert.equal(isAfterHours("2026-10-10T04:30:00Z"), false); // 10:00 IST
  assert.equal(isAfterHours("2026-10-10T13:29:00Z"), false); // 18:59 IST
  assert.equal(isAfterHours("2026-10-10T13:30:00Z"), true); // 19:00 IST
  assert.equal(isAfterHours("2026-10-09T19:00:00Z"), true); // 00:30 IST
});

test("model output is coerced to safe values", () => {
  const junk = coerceClassification({ classification: "maybe", segment: "villa", lead: { size_sqft: "1,400" }, booked_slot: "tomorrow" }, null);
  assert.equal(junk.classification, "unclear");
  assert.equal(junk.segment, "unknown");
  assert.equal(junk.lead.size_sqft, null);
  assert.equal(junk.booked_slot, null);
  assert.equal(coerceClassification("not an object", null).classification, "unclear");
  assert.equal(coerceClassification(null, null).classification, "unclear");
});

test("booked_slot must be near the call date", () => {
  const callTime = "2026-10-10T08:00:00Z";
  const ok = coerceClassification({ classification: "qualified", booked_slot: "2026-10-14T11:00:00+05:30" }, callTime);
  assert.equal(ok.booked_slot, "2026-10-14T05:30:00.000Z");
  assert.equal(coerceClassification({ classification: "qualified", booked_slot: "2025-01-01T11:00:00+05:30" }, callTime).booked_slot, null);
  assert.equal(coerceClassification({ classification: "qualified", booked_slot: "2027-01-01T11:00:00+05:30" }, callTime).booked_slot, null);
});

test("a valid model answer passes through", () => {
  const r = coerceClassification(
    { classification: "qualified", fit_reason: "Criterion 2 met: Baner", asked_pricing: true, segment: "home", lead: { name: "Priya", size_sqft: 1400.4 }, handoff_note: "Wants 3BHK" },
    null
  );
  assert.equal(r.classification, "qualified");
  assert.equal(r.asked_pricing, true);
  assert.equal(r.lead.size_sqft, 1400);
  assert.equal(r.lead.name, "Priya");
});

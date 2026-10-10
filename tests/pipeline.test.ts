import test from "node:test";
import assert from "node:assert/strict";
import { handleEvent } from "../lib/pipeline";
import { callFixture, designer, makeDeps, memoryStore, qualified } from "./helpers";
import type { Classification } from "../lib/types";

const post = (over = {}) => ({ kind: "postprocessing" as const, call: callFixture(over) });
const asia = designer("d-home", "Anika", ["home"]);

test("call_started records the caller and flags after-hours", async () => {
  const { deps, store } = makeDeps({ now: new Date("2026-10-10T14:00:00Z") }); // 19:30 IST
  await handleEvent({ kind: "started", callId: "room-1", callerNumber: "+919800000001" }, deps);
  const row = store.rows.get("room-1")!;
  assert.equal(row.caller_number, "+919800000001");
  assert.equal(row.after_hours, true);
});

test("qualified call: designer gets the email, HubSpot gets a deal, the row is complete", async () => {
  const { deps, store, sent, deals } = makeDeps({ store: memoryStore([asia]) });
  await handleEvent({ kind: "started", callId: "room-1", callerNumber: "+919800000001" }, deps);
  const out = await handleEvent(post(), deps);

  assert.equal(out.status, "processed");
  assert.equal(out.designer, "Anika");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "d-home@aangan.test");
  assert.match(sent[0].text, /api\/lead\/claim\?id=row-1/);
  assert.match(sent[0].text, /api\/lead\/reschedule\?id=row-1/);
  assert.match(sent[0].text, /cal\.test\/aangan/);
  assert.match(sent[0].text, /Asked about pricing/);
  assert.equal(deals.length, 1);

  const row = store.rows.get("room-1")!;
  assert.equal(row.classification, "qualified");
  assert.equal(row.designer_id, "d-home");
  assert.equal(row.hubspot_deal_id, "deal-1");
  assert.equal(row.cost_llm_inr, 0.12);
  assert.equal(row.cost_voice_inr, 12); // 2 minutes at 6/min
  assert.equal(row.output_errors, null);
});

test("the same webhook delivered twice is processed once", async () => {
  const { deps, sent, deals, state } = makeDeps({ store: memoryStore([asia]) });
  const first = await handleEvent(post(), deps);
  const second = await handleEvent(post(), deps);
  assert.equal(first.status, "processed");
  assert.equal(second.status, "duplicate");
  assert.equal(state.classifyCalls, 1);
  assert.equal(sent.length, 1);
  assert.equal(deals.length, 1);
});

test("two deliveries arriving at the same moment are processed once", async () => {
  const { deps, sent, state } = makeDeps({ store: memoryStore([asia]) });
  const [a, b] = await Promise.all([handleEvent(post(), deps), handleEvent(post(), deps)]);
  assert.deepEqual([a.status, b.status].sort(), ["in_progress", "processed"]);
  assert.equal(state.classifyCalls, 1);
  assert.equal(sent.length, 1);
});

test("a claim abandoned by a crashed run is picked up after the stale window", async () => {
  const store = memoryStore([asia]);
  await store.upsertCall("room-1", {});
  store.rows.get("room-1")!.processing_started_at = "2026-10-10T08:00:00.000Z"; // 31 minutes before "now"
  const { deps, state } = makeDeps({ store });
  assert.equal((await handleEvent(post(), deps)).status, "processed");
  assert.equal(state.classifyCalls, 1);
});

test("a fresh claim by another run is left alone", async () => {
  const store = memoryStore([asia]);
  await store.upsertCall("room-1", {});
  store.rows.get("room-1")!.processing_started_at = "2026-10-10T08:30:30.000Z"; // 30 seconds before "now"
  const { deps, state } = makeDeps({ store });
  assert.equal((await handleEvent(post(), deps)).status, "in_progress");
  assert.equal(state.classifyCalls, 0);
});

test("AI failure never loses the lead: raw transcript goes to the front desk and the call is logged", async () => {
  const { deps, store, sent } = makeDeps({ classifyError: new Error("Gemini 503") });
  const out = await handleEvent(post(), deps);
  assert.equal(out.status, "ai_failed");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "desk@aangan.test");
  assert.match(sent[0].text, /I need full interiors for my 3BHK in Baner/);
  const row = store.rows.get("room-1")!;
  assert.equal(row.classification, "unclear");
  assert.match(row.fit_reason, /Gemini 503/);
  assert.ok(row.transcript.length === 2);
});

test("HubSpot down: the designer still gets the email and the failure is recorded", async () => {
  const { deps, store, sent } = makeDeps({ store: memoryStore([asia]), hubspot: "fail" });
  await handleEvent(post(), deps);
  assert.equal(sent.length, 1);
  const row = store.rows.get("room-1")!;
  assert.equal(row.classification, "qualified");
  assert.match(row.output_errors[0], /^hubspot: HubSpot 401/);
  assert.equal(row.hubspot_deal_id, null);
});

test("HubSpot not configured is skipped quietly", async () => {
  const { deps, store, sent } = makeDeps({ store: memoryStore([asia]), hubspot: "off" });
  await handleEvent(post(), deps);
  assert.equal(sent.length, 1);
  assert.equal(store.rows.get("room-1")!.output_errors, null);
});

test("designer email failing falls back to the front desk", async () => {
  const { deps, store, sent, deals } = makeDeps({ store: memoryStore([asia]), failEmailTo: "d-home@aangan.test" });
  await handleEvent(post(), deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "desk@aangan.test");
  assert.match(sent[0].subject, /designer email failed/);
  assert.equal(deals.length, 1);
  assert.match(store.rows.get("room-1")!.output_errors[0], /designer_email/);
});

test("no designers set up: the lead goes to the front desk", async () => {
  const { deps, sent } = makeDeps();
  await handleEvent(post(), deps);
  assert.equal(sent[0].to, "desk@aangan.test");
});

test("routing prefers the segment match, then the lighter workload", async () => {
  const office = designer("d-off", "Omkar", ["office"]);
  const busy = designer("d-busy", "Bela", ["home"]);
  const free = designer("d-free", "Chirag", ["home", "office"]);
  const { deps, store } = makeDeps({ store: memoryStore([office, busy, free], { "d-busy": 4, "d-free": 1 }) });
  await handleEvent(post(), deps);
  assert.equal(store.rows.get("room-1")!.designer_id, "d-free");
});

test("complaints go to the front desk only", async () => {
  const complaint: Classification = { ...qualified, classification: "complaint", asked_pricing: false, fit_reason: "Existing client, delayed handover", handoff_note: "Angry about delay." };
  const { deps, sent, deals } = makeDeps({ store: memoryStore([asia]), result: complaint });
  await handleEvent(post(), deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "desk@aangan.test");
  assert.match(sent[0].subject, /Complaint/);
  assert.equal(deals.length, 0);
});

test("not_fit and unclear calls are logged only", async () => {
  for (const c of ["not_fit", "unclear"] as const) {
    const { deps, sent, deals, store } = makeDeps({ store: memoryStore([asia]), result: { ...qualified, classification: c, asked_pricing: false } });
    await handleEvent(post(), deps);
    assert.equal(sent.length, 0);
    assert.equal(deals.length, 0);
    assert.equal(store.rows.get("room-1")!.classification, c);
  }
});

test("a call with no transcript is logged as unclear without calling the AI", async () => {
  const { deps, store, state } = makeDeps();
  const out = await handleEvent(post({ transcript: [], summary: "" }), deps);
  assert.equal(out.status, "no_transcript");
  assert.equal(state.classifyCalls, 0);
  assert.equal(store.rows.get("room-1")!.classification, "unclear");
});

test("a price slip by the voice agent is flagged on the row and in the designer email", async () => {
  const { deps, store, sent } = makeDeps({ store: memoryStore([asia]) });
  await handleEvent(
    post({
      transcript: [
        { role: "CALLER", text: "What is the rate?" },
        { role: "AGENT", text: "It is usually 1,800 per sq ft." },
      ],
    }),
    deps
  );
  const row = store.rows.get("room-1")!;
  assert.equal(row.agent_price_flag, true);
  assert.equal(row.price_flag_lines.length, 1);
  assert.match(sent[0].text, /may have mentioned a price/);
});

test("a clean call has no price flag", async () => {
  const { deps, store, sent } = makeDeps({ store: memoryStore([asia]) });
  await handleEvent(post(), deps);
  assert.equal(store.rows.get("room-1")!.agent_price_flag, false);
  assert.doesNotMatch(sent[0].text, /may have mentioned a price/);
});

test("booked slot: Vaani's extracted slot wins, and only qualified calls keep one", async () => {
  const vaaniSlot = "2026-10-14T05:30:00.000Z";
  const aiSlot = "2026-10-15T05:30:00.000Z";
  const a = makeDeps({ store: memoryStore([asia]), result: { ...qualified, booked_slot: aiSlot } });
  await handleEvent(post({ bookedSlot: vaaniSlot }), a.deps);
  assert.equal(a.store.rows.get("room-1")!.booked_slot, vaaniSlot);

  const b = makeDeps({ store: memoryStore([asia]), result: { ...qualified, booked_slot: aiSlot } });
  await handleEvent(post(), b.deps);
  assert.equal(b.store.rows.get("room-1")!.booked_slot, aiSlot);

  const c = makeDeps({ result: { ...qualified, classification: "not_fit", booked_slot: aiSlot } });
  await handleEvent(post({ bookedSlot: vaaniSlot }), c.deps);
  assert.equal(c.store.rows.get("room-1")!.booked_slot, null);
});

test("missing duration is derived from the call start", async () => {
  const { deps, store } = makeDeps({ result: { ...qualified, classification: "not_fit" } });
  await handleEvent({ kind: "started", callId: "room-1", callerNumber: null }, { ...deps, now: () => new Date("2026-10-10T08:28:00.000Z") });
  await handleEvent(post({ durationSec: 0 }), deps);
  assert.equal(store.rows.get("room-1")!.duration_sec, 120);
});

test("events that arrive out of order still land on one row", async () => {
  const { deps, store } = makeDeps({ result: { ...qualified, classification: "not_fit" } });
  await handleEvent(post(), deps);
  await handleEvent({ kind: "started", callId: "room-1", callerNumber: "+919800000001" }, deps);
  await handleEvent({ kind: "ended", callId: "room-1", durationSec: 120 }, deps);
  assert.equal(store.rows.size, 1);
  assert.equal(store.rows.get("room-1")!.classification, "not_fit");
});

test("a failed call is logged and not classified by the AI", async () => {
  const { deps, store, state } = makeDeps();
  await handleEvent({ kind: "failed", callId: "room-9", reason: "no answer" }, deps);
  assert.equal(state.classifyCalls, 0);
  assert.match(store.rows.get("room-9")!.fit_reason, /no answer/);
});

test("database down at intake: the transcript is still emailed and the error is raised so Vaani retries", async () => {
  const store = memoryStore();
  store.failUpsert = true;
  const { deps, sent } = makeDeps({ store });
  await assert.rejects(() => handleEvent(post(), deps), /database is down/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "desk@aangan.test");
  assert.match(sent[0].text, /I need full interiors/);
});

test("lead details are HTML-escaped in the email", async () => {
  const evil = { ...qualified, lead: { ...qualified.lead, name: "<script>alert(1)</script>" }, handoff_note: "<img src=x onerror=alert(1)>" };
  const { deps, sent } = makeDeps({ store: memoryStore([asia]), result: evil });
  await handleEvent(post(), deps);
  assert.doesNotMatch(sent[0].html, /<script>|<img/);
});

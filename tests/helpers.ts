import type { Mail } from "../lib/email";
import type { Deps } from "../lib/pipeline";
import type { CallPatch, CallRecord, Store } from "../lib/store";
import type { Classification, Designer, NormalisedCall } from "../lib/types";

export type Row = Record<string, any>;

/** In-memory stand-in for the Neon store with the same claim semantics. */
export function memoryStore(designers: Designer[] = [], counts: Record<string, number> = {}) {
  const rows = new Map<string, Row>();
  let seq = 0;
  const ensure = (id: string): Row => {
    if (!rows.has(id)) rows.set(id, { id: `row-${++seq}`, vaani_call_id: id, caller_number: null, started_at: null, classification: null, processing_started_at: null });
    return rows.get(id)!;
  };
  const view = (r: Row): CallRecord => ({
    id: r.id, vaani_call_id: r.vaani_call_id, caller_number: r.caller_number, started_at: r.started_at,
    classification: r.classification, processing_started_at: r.processing_started_at,
  });
  const store: Store & { rows: Map<string, Row>; failUpsert?: boolean } = {
    rows,
    async recordCallStarted(id, num, at, afterHours) {
      const r = ensure(id);
      r.started_at ??= at;
      r.after_hours ??= afterHours;
      r.caller_number ??= num;
      r.status ??= "started";
    },
    async upsertCall(id, patch: CallPatch) {
      if (store.failUpsert) throw new Error("database is down");
      const r = ensure(id);
      Object.assign(r, patch);
      return view(r);
    },
    async claimForProcessing(id, nowIso, staleBeforeIso) {
      const r = rows.get(id);
      if (!r || r.classification !== null) return false;
      if (r.processing_started_at && r.processing_started_at >= staleBeforeIso) return false;
      r.processing_started_at = nowIso;
      return true;
    },
    async updateCall(id, patch) {
      Object.assign(rows.get(id)!, patch);
    },
    async activeDesigners() {
      return designers;
    },
    async assignmentCounts() {
      return counts;
    },
  };
  return store;
}

export const qualified: Classification = {
  classification: "qualified",
  fit_reason: "All five criteria met",
  asked_pricing: true,
  segment: "home",
  lead: { name: "Priya Kulkarni", area: "Baner", property_type: "3BHK", size_sqft: 1400, scope: "Full interiors", budget_band: null, timeline: "3 months", source: null },
  booked_slot: null,
  handoff_note: "Wants full interiors for a 3BHK in Baner.\nAsked about pricing; told designer will cover it.",
};

export const callFixture = (over: Partial<NormalisedCall> = {}): NormalisedCall => ({
  callId: "room-1",
  callerNumber: "+919800000001",
  endedAt: "2026-10-10T08:30:00.000Z",
  durationSec: 120,
  endReason: "hangup",
  summary: "Wants 3BHK interiors in Baner",
  collected: {},
  transcript: [
    { role: "AGENT", text: "Namaste, Aangan Studio, this is Vaani." },
    { role: "CALLER", text: "I need full interiors for my 3BHK in Baner." },
  ],
  recordingUrl: "https://example.test/rec.mp3",
  bookedSlot: null,
  ...over,
});

export function makeDeps(opts: {
  store?: ReturnType<typeof memoryStore>;
  result?: Classification;
  classifyError?: Error;
  hubspot?: "ok" | "fail" | "off";
  failEmailTo?: string;
  now?: Date;
} = {}) {
  const store = opts.store ?? memoryStore();
  const sent: Mail[] = [];
  const deals: unknown[] = [];
  const state = { classifyCalls: 0 };
  const deps: Deps = {
    store,
    classify: async () => {
      state.classifyCalls++;
      if (opts.classifyError) throw opts.classifyError;
      return { result: opts.result ?? qualified, costInr: 0.12 };
    },
    sendEmail: async (m) => {
      if (opts.failEmailTo && m.to === opts.failEmailTo) throw new Error("Resend 422: bad address");
      sent.push(m);
      return `msg-${sent.length}`;
    },
    createDeal:
      opts.hubspot === "off"
        ? undefined
        : async (d) => {
            if (opts.hubspot === "fail") throw new Error("HubSpot 401");
            deals.push(d);
            return "deal-1";
          },
    actionUrl: (id, action, by) => `https://app.test/api/lead/${action}?id=${id}${by ? `&by=${encodeURIComponent(by)}` : ""}`,
    frontDeskEmail: "desk@aangan.test",
    bookingUrl: "https://cal.test/aangan",
    voiceRateInrPerMin: 6,
    now: () => opts.now ?? new Date("2026-10-10T08:31:00.000Z"),
  };
  return { deps, store, sent, deals, state };
}

export const designer = (id: string, name: string, specialties: string[], email: string | null = `${id}@aangan.test`): Designer => ({ id, name, email, specialties });

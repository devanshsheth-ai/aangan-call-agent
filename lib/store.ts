import { query } from "./db";
import { buildUpdate, buildUpsert } from "./sql";
import type { Designer } from "./types";

export type CallPatch = Record<string, unknown>;

export type CallRecord = {
  id: string;
  vaani_call_id: string;
  caller_number: string | null;
  started_at: string | null;
  classification: string | null;
  processing_started_at: string | null;
};

/** Everything the pipeline needs from storage. Tests swap in an in-memory version. */
export interface Store {
  recordCallStarted(callId: string, callerNumber: string | null, startedAt: string, afterHours: boolean): Promise<void>;
  upsertCall(callId: string, patch: CallPatch): Promise<CallRecord>;
  /** True only for the one caller that wins the right to process this call. */
  claimForProcessing(callId: string, nowIso: string, staleBeforeIso: string): Promise<boolean>;
  updateCall(callId: string, patch: CallPatch): Promise<void>;
  activeDesigners(): Promise<Designer[]>;
  assignmentCounts(sinceIso: string): Promise<Record<string, number>>;
}

const COLUMNS = "id, vaani_call_id, caller_number, started_at, classification, processing_started_at";

export const dbStore: Store = {
  async recordCallStarted(callId, callerNumber, startedAt, afterHours) {
    await query("insert into calls (vaani_call_id, status) values ($1, 'started') on conflict (vaani_call_id) do nothing", [callId]);
    // Fill gaps only, so a redelivered call_started never overwrites what is already known.
    await query(
      `update calls set
         after_hours = case when started_at is null then $3::boolean else after_hours end,
         started_at = coalesce(started_at, $2::timestamptz),
         caller_number = coalesce(caller_number, $4::text)
       where vaani_call_id = $1`,
      [callId, startedAt, afterHours, callerNumber]
    );
  },

  async upsertCall(callId, patch) {
    const q = buildUpsert(callId, patch, COLUMNS);
    const rows = await query<CallRecord>(q.text, q.params);
    return rows[0];
  },

  async claimForProcessing(callId, nowIso, staleBeforeIso) {
    const rows = await query(
      `update calls set processing_started_at = $2::timestamptz
       where vaani_call_id = $1 and classification is null
         and (processing_started_at is null or processing_started_at < $3::timestamptz)
       returning id`,
      [callId, nowIso, staleBeforeIso]
    );
    return rows.length > 0;
  },

  async updateCall(callId, patch) {
    const q = buildUpdate(callId, patch);
    if (q) await query(q.text, q.params);
  },

  async activeDesigners() {
    const rows = await query<Designer>("select id, name, email, specialties from designers where active = true");
    return rows.map((d) => ({ ...d, specialties: d.specialties ?? [] }));
  },

  async assignmentCounts(sinceIso) {
    const rows = await query<{ designer_id: string; n: number }>(
      "select designer_id, count(*)::int as n from calls where designer_id is not null and created_at >= $1::timestamptz group by designer_id",
      [sinceIso]
    );
    return Object.fromEntries(rows.map((r) => [r.designer_id, r.n]));
  },
};

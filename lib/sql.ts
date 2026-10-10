const COLUMN = /^[a-z][a-z0-9_]*$/;
const JSONB = new Set(["collected", "transcript", "lead", "price_flag_lines", "output_errors"]);

export type Built = { cols: string[]; placeholders: string[]; params: unknown[] };

function param(col: string, v: unknown): unknown {
  if (v === undefined) return null;
  if (JSONB.has(col) && v !== null) return JSON.stringify(v);
  return v;
}

function cast(col: string): string {
  return JSONB.has(col) ? "::jsonb" : "";
}

function entries(patch: Record<string, unknown>): [string, unknown][] {
  const list = Object.entries(patch).filter(([, v]) => v !== undefined);
  for (const [k] of list) if (!COLUMN.test(k)) throw new Error(`Bad column name: ${k}`);
  return list;
}

/** INSERT ... ON CONFLICT (vaani_call_id) DO UPDATE for a partial set of columns. $1 is the call id. */
export function buildUpsert(callId: string, patch: Record<string, unknown>, returning: string): { text: string; params: unknown[] } {
  const list = entries(patch);
  const cols = ["vaani_call_id", ...list.map(([k]) => k)];
  const values = ["$1", ...list.map(([k], i) => `$${i + 2}${cast(k)}`)];
  const sets = list.length ? list.map(([k]) => `${k} = excluded.${k}`) : ["vaani_call_id = excluded.vaani_call_id"];
  return {
    text: `insert into calls (${cols.join(", ")}) values (${values.join(", ")}) on conflict (vaani_call_id) do update set ${sets.join(", ")} returning ${returning}`,
    params: [callId, ...list.map(([k, v]) => param(k, v))],
  };
}

/** UPDATE ... WHERE vaani_call_id = $1 for a partial set of columns. Returns null when there is nothing to set. */
export function buildUpdate(callId: string, patch: Record<string, unknown>): { text: string; params: unknown[] } | null {
  const list = entries(patch);
  if (!list.length) return null;
  return {
    text: `update calls set ${list.map(([k], i) => `${k} = $${i + 2}${cast(k)}`).join(", ")} where vaani_call_id = $1`,
    params: [callId, ...list.map(([k, v]) => param(k, v))],
  };
}

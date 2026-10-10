// Exercises the real Neon store end to end (insert, claim, double-claim, update, cleanup).
// It writes one throwaway row and deletes it.   Run: npm run smoke:store
import assert from "node:assert/strict";
import { query } from "../lib/db";
import { dbStore as s } from "../lib/store";

const id = `smoke-${Date.now()}`;
const step = (m: string) => console.log(`  ok    ${m}`);

try {
  await s.recordCallStarted(id, "+919000000000", new Date().toISOString(), false);
  step("call_started row created");

  const row = await s.upsertCall(id, { status: "completed", summary: "smoke test" });
  assert.equal(row.caller_number, "+919000000000");
  assert.ok(row.started_at, "started_at should survive the upsert");
  step("post-call upsert merged into the same row");

  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  assert.equal(await s.claimForProcessing(id, now, stale), true);
  assert.equal(await s.claimForProcessing(id, now, stale), false);
  step("first claim wins, second claim loses (idempotency works)");

  await s.updateCall(id, { classification: "unclear", fit_reason: "smoke test" });
  assert.equal(await s.claimForProcessing(id, now, new Date(Date.now() + 60_000).toISOString()), false);
  step("a classified call can never be claimed again");

  const designers = await s.activeDesigners();
  step(`${designers.length} active designer(s) readable`);
  await s.assignmentCounts(new Date(Date.now() - 7 * 864e5).toISOString());
  step("assignment counts readable");

  await query("select * from daily_metrics limit 1");
  step("daily_metrics view readable");
} catch (e) {
  console.error(`\n  FAIL  ${e instanceof Error ? e.message : e}`);
  console.error("        If this says a table or column is missing, run db/migrations/001_init.sql in the Neon SQL Editor.");
  process.exitCode = 1;
} finally {
  try {
    await query("delete from calls where vaani_call_id = $1", [id]);
  } catch {
    console.error(`  note  could not delete the test row ${id} (or never connected)`);
  }
}
if (!process.exitCode) console.log("\nStore works.\n");

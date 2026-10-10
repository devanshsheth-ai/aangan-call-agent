import test from "node:test";
import assert from "node:assert/strict";
import { buildUpdate, buildUpsert } from "../lib/sql";

test("upsert numbers placeholders, casts jsonb and stringifies objects", () => {
  const q = buildUpsert("room-1", { status: "completed", lead: { name: "Priya" }, summary: undefined }, "id");
  assert.match(q.text, /insert into calls \(vaani_call_id, status, lead\) values \(\$1, \$2, \$3::jsonb\)/);
  assert.match(q.text, /on conflict \(vaani_call_id\) do update set status = excluded\.status, lead = excluded\.lead returning id/);
  assert.deepEqual(q.params, ["room-1", "completed", '{"name":"Priya"}']);
});

test("an empty patch still upserts", () => {
  const q = buildUpsert("room-1", {}, "id");
  assert.match(q.text, /do update set vaani_call_id = excluded\.vaani_call_id/);
  assert.deepEqual(q.params, ["room-1"]);
});

test("update builds a where on the call id and skips undefined", () => {
  const q = buildUpdate("room-1", { classification: "qualified", output_errors: null, fit_reason: undefined })!;
  assert.equal(q.text, "update calls set classification = $2, output_errors = $3::jsonb where vaani_call_id = $1");
  assert.deepEqual(q.params, ["room-1", "qualified", null]);
  assert.equal(buildUpdate("room-1", {}), null);
});

test("column names are validated so a patch key can never inject SQL", () => {
  assert.throws(() => buildUpdate("x", { "a = 1; drop table calls; --": 1 }), /Bad column name/);
  assert.throws(() => buildUpsert("x", { 'Robert"); drop': 1 }, "id"), /Bad column name/);
});

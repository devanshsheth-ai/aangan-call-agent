// Runs the ten real transcripts through the dry-run /api/eval route and writes docs/eval-results.md.
// Nothing is saved, emailed or sent to HubSpot.
//   npm run eval                                 (app running locally on :3000)
//   npm run eval -- --url https://your-app.vercel.app
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const base = (urlIdx >= 0 ? args[urlIdx + 1] : process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.VAANI_WEBHOOK_SECRET;
if (!secret) {
  console.error("VAANI_WEBHOOK_SECRET is not set in .env.local");
  process.exit(1);
}

type Expected = Record<string, { classification: string; asked_pricing?: boolean; why: string }>;
const expected: Expected = JSON.parse(fs.readFileSync("eval/expected.json", "utf8"));
const dir = "eval/transcripts";
const files = fs.readdirSync(dir);

function loadTranscript(id: string): string | null {
  const f = files.find((n) => n.toUpperCase().startsWith(id) && !n.toLowerCase().startsWith("readme"));
  if (!f) return null;
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  if (f.toLowerCase().endsWith(".json")) {
    try {
      const j = JSON.parse(raw);
      return typeof j === "string" ? j : String(j.transcript ?? raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const rows: string[] = [];
let pass = 0, fail = 0, missing = 0, first = true;

for (const [id, want] of Object.entries(expected)) {
  const transcript = loadTranscript(id);
  if (!transcript) {
    missing++;
    rows.push(`| ${id} | ${want.classification} | missing file | | | MISSING |`);
    console.log(`${id}  MISSING  (put ${id}.txt in eval/transcripts)`);
    continue;
  }
  if (!first) await sleep(4000); // stay under the free-tier rate limit
  first = false;

  let got = "error", reason = "", asked: boolean | undefined, leak = false;
  try {
    const res = await fetch(`${base}/api/eval?token=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const j: any = await res.json();
    if (!res.ok || !j.ok) reason = `HTTP ${res.status}: ${j.error ?? "failed"}`;
    else {
      got = j.classification;
      reason = j.fit_reason;
      asked = j.asked_pricing;
      leak = /₹|\bper\s*sq\.?\s*ft|\bestimate/i.test(`${j.handoff_note} ${j.fit_reason}`);
    }
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
  }

  const classOk = got === want.classification;
  const askedOk = want.asked_pricing === undefined || asked === want.asked_pricing;
  const ok = classOk && askedOk && !leak;
  ok ? pass++ : fail++;
  rows.push(`| ${id} | ${want.classification}${want.asked_pricing ? " + asked pricing" : ""} | ${got}${asked ? " + asked pricing" : ""} | ${cell(reason)} | ${leak ? "PRICE IN OUTPUT" : "clean"} | ${ok ? "pass" : "FAIL"} |`);
  console.log(`${id}  ${ok ? "pass" : "FAIL"}  expected ${want.classification}, got ${got}${leak ? "  (price leaked into output!)" : ""}`);
}

const out = `# Eval results

Ten real September transcripts, run through the same classifier as the live webhook (dry run: nothing saved or sent).
Run at ${new Date().toISOString()} against ${base}.

**${pass} of ${Object.keys(expected).length} match** (${fail} wrong, ${missing} missing).

| ID | Expected | Got | Reason the AI gave | Price check | Result |
|----|----------|-----|--------------------|-------------|--------|
${rows.join("\n")}
`;
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/eval-results.md", out);
console.log(`\n${pass} pass, ${fail} fail, ${missing} missing. Table written to docs/eval-results.md`);
process.exit(fail || missing ? 1 : 0);

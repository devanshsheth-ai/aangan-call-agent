// Checks your .env.local and tries each service with the keys you gave it.
// Prints pass/fail only. It never prints a key.   Run: npm run doctor   (add -- --send-test to send one email)
const sendTest = process.argv.includes("--send-test");
let failed = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  note  ${m}`);
const bad = (m) => { failed++; console.log(`  FAIL  ${m}`); };
const section = (t) => console.log(`\n${t}`);
const get = (k) => (process.env[k] ?? "").trim();
const timeout = () => AbortSignal.timeout(12_000);

async function call(label, url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: timeout() });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* not json */ }
    return { res, json, text };
  } catch (e) {
    bad(`${label}: could not reach it (${e.cause?.code ?? e.message})`);
    return null;
  }
}

section("1. Settings in .env.local");
const required = ["VAANI_WEBHOOK_SECRET", "GEMINI_API_KEY", "GEMINI_MODEL", "DATABASE_URL",
  "RESEND_API_KEY", "EMAIL_FROM", "FRONT_DESK_EMAIL", "APP_URL", "LINK_SECRET", "DASHBOARD_PASSWORD"];
for (const k of required) get(k) ? ok(`${k} is set`) : bad(`${k} is missing`);
for (const k of ["HUBSPOT_PRIVATE_APP_TOKEN", "CALCOM_BOOKING_URL"]) if (!get(k)) warn(`${k} is empty (optional: that output will be skipped)`);
for (const k of ["VAANI_WEBHOOK_SECRET", "LINK_SECRET"]) if (get(k) && get(k).length < 24) bad(`${k} is too short; use a long random value (24+ characters)`);
if (get("VAANI_WEBHOOK_SECRET") && get("VAANI_WEBHOOK_SECRET") === get("LINK_SECRET")) bad("VAANI_WEBHOOK_SECRET and LINK_SECRET must be different values");
if (get("APP_URL") && !/^https?:\/\/[^/]+$/.test(get("APP_URL"))) bad("APP_URL should look like https://your-app.vercel.app with no trailing slash or path");
if (get("EMAIL_FROM") && !/^[^<>]*<[^<>@\s]+@[^<>\s]+>$|^[^<>@\s]+@[^<>\s]+$/.test(get("EMAIL_FROM"))) bad("EMAIL_FROM should be an email, or Name <email>");
if (!get("VAANI_RATE_INR_PER_MIN")) warn("VAANI_RATE_INR_PER_MIN is empty, so voice cost will show as 0. Put your Vaani per-minute rate in rupees.");
if (!get("GEMINI_INR_PER_M_INPUT")) warn("GEMINI_INR_PER_M_INPUT / _OUTPUT are empty, so AI cost will show as 0 (fine on the free tier).");

section("2. Neon database");
if (get("DATABASE_URL")) {
  if (!/^postgres(ql)?:\/\//.test(get("DATABASE_URL"))) bad("DATABASE_URL should start with postgresql://  (copy the connection string from Neon > Connect)");
  else {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const q = neon(get("DATABASE_URL"));
      await q.query("select 1");
      ok("connected");
      try {
        await q.query("select 1 from calls limit 1");
        ok("the calls table exists");
        const d = await q.query("select email from designers where active = true");
        if (!d.length) warn("no designers yet. Qualified leads will go to the front desk until you insert some (see the bottom of db/migrations/001_init.sql).");
        else if (d.some((x) => !x.email)) warn("some designers have no email, so their leads go to the front desk");
        else ok(`${d.length} active designer(s)`);
      } catch (e) {
        if (e?.code === "42P01" || /does not exist/i.test(e?.message ?? "")) bad("connected, but the tables are missing. Run db/migrations/001_init.sql in the Neon SQL Editor.");
        else bad(`query failed: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    } catch (e) {
      bad(`could not connect: ${String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 140)}`);
    }
  }
}

section("3. Gemini");
if (get("GEMINI_API_KEY") && get("GEMINI_MODEL")) {
  const r = await call("Gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(get("GEMINI_MODEL"))}`, { headers: { "x-goog-api-key": get("GEMINI_API_KEY") } });
  if (r) {
    if (r.res.ok && (r.json?.supportedGenerationMethods ?? []).includes("generateContent")) ok(`model ${get("GEMINI_MODEL")} is available`);
    else if (r.res.status === 404) bad(`model "${get("GEMINI_MODEL")}" does not exist for your key. Run: npm run models`);
    else if ([400, 401, 403].includes(r.res.status)) bad(`the API key was rejected (HTTP ${r.res.status}). Create a new one at aistudio.google.com/apikey`);
    else bad(`unexpected answer (HTTP ${r.res.status})`);
  }
}

section("4. Resend (email)");
if (get("RESEND_API_KEY")) {
  const r = await call("Resend", "https://api.resend.com/domains", { headers: { Authorization: `Bearer ${get("RESEND_API_KEY")}` } });
  if (r) {
    if (r.res.ok) ok("key accepted (full access)");
    else if (/restricted/i.test(r.text)) ok("key accepted (sending-only, which is what we want)");
    else if (r.res.status === 401 || r.res.status === 403) bad("Resend rejected the key. Create a new one with Sending access.");
    else bad(`unexpected answer (HTTP ${r.res.status})`);
  }
  if (/onboarding@resend\.dev/i.test(get("EMAIL_FROM"))) warn("with onboarding@resend.dev, Resend only delivers to the email you signed up with. Put that address in FRONT_DESK_EMAIL and in every designer row.");
}

section("5. HubSpot");
if (get("HUBSPOT_PRIVATE_APP_TOKEN")) {
  const r = await call("HubSpot", "https://api.hubapi.com/crm/v3/objects/deals?limit=1", { headers: { Authorization: `Bearer ${get("HUBSPOT_PRIVATE_APP_TOKEN")}` } });
  if (r) {
    if (r.res.ok) ok("token accepted, deals readable");
    else if (r.res.status === 401) bad("HubSpot rejected the token. Re-copy it from Settings > Integrations > Private Apps.");
    else if (r.res.status === 403) bad("token works but lacks scopes. Add crm.objects.contacts.read/write and crm.objects.deals.read/write.");
    else bad(`unexpected answer (HTTP ${r.res.status})`);
  }
  if (get("HUBSPOT_DEAL_STAGE")) warn(`using deal stage "${get("HUBSPOT_DEAL_STAGE")}" (custom). If deals fail to create, this id is the usual cause.`);
} else warn("HubSpot skipped (no token)");

section("6. Your app");
if (get("APP_URL") && get("VAANI_WEBHOOK_SECRET")) {
  const url = `${get("APP_URL")}/api/vaani/webhook?token=${encodeURIComponent(get("VAANI_WEBHOOK_SECRET"))}`;
  const local = /localhost|127\.0\.0\.1/.test(get("APP_URL"));
  const r = await call("app", url);
  if (r?.res.ok && r.json?.ok) ok(`webhook answers at ${get("APP_URL")}`);
  else if (r) bad(`the app answered ${r.res.status}. Check VAANI_WEBHOOK_SECRET is the same value in Vercel.`);
  else if (local) { failed--; warn("the local app is not running (fine: start it with npm run dev when you want to test)"); }
}

if (sendTest) {
  section("7. Test email");
  const to = get("FRONT_DESK_EMAIL");
  const r = await call("Resend send", "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: get("EMAIL_FROM"), to: [to], subject: "[Aangan] Test email", text: "If you can read this, email sending works." }),
  });
  if (r?.res.ok) ok(`sent to ${to}. Check the inbox (and spam).`);
  else if (r) bad(`Resend said: ${(r.json?.message ?? r.text).slice(0, 200)}`);
}

console.log(failed ? `\n${failed} problem(s) to fix above.\n` : "\nAll good.\n");
process.exit(failed ? 1 : 0);

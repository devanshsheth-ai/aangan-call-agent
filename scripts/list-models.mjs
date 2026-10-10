// Lists the Gemini models your key can use, so GEMINI_MODEL is never a guess.   Run: npm run models   (add -- --all for every model)
const key = (process.env.GEMINI_API_KEY ?? "").trim();
if (!key) {
  console.error("GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
if (!res.ok) {
  console.error(`Gemini answered HTTP ${res.status}. The key is probably wrong; create one at aistudio.google.com/apikey`);
  process.exit(1);
}
const all = process.argv.includes("--all");
const models = ((await res.json()).models ?? [])
  .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""))
  .filter((n) => all || /flash/i.test(n));
console.log(models.length ? models.join("\n") : "No matching models.");
console.log("\nPut one of these names in GEMINI_MODEL. A plain 'flash' model without 'preview', 'exp' or a date is the stable choice.");

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { auditAgentTurns, guardClassification, PRICING_LINE, scrubNote } from "../lib/guard";
import { knowledge } from "../lib/knowledge";
import type { Classification } from "../lib/types";

const base: Classification = {
  classification: "qualified",
  fit_reason: "Criterion 1 to 5 met",
  asked_pricing: false,
  segment: "home",
  lead: { name: "Priya", area: "Baner", property_type: "3BHK", size_sqft: 1400, scope: "Full interiors", budget_band: null, timeline: "3 months", source: null },
  booked_slot: null,
  handoff_note: "",
};

test("price and estimate lines are stripped from the handoff note", () => {
  const note = [
    "Wants full interiors for a 3BHK in Baner.",
    "Rate would be ₹1,800 per sq ft.",
    "Studio would cost around 12 lakh.",
    "We can give an estimate after the visit.",
    "Size 1400 sq ft, possession in 3 months.",
  ].join("\n");
  const out = scrubNote(note, false);
  assert.equal(out, "Wants full interiors for a 3BHK in Baner.\nSize 1400 sq ft, possession in 3 months.");
});

test("amounts are caught in every common spelling", () => {
  for (const line of [
    "Looks like 15,00,000 rupees all in.",
    "Typically twenty lakh for this size.",
    "Around 30L for a 3BHK.",
    "Rs. 18,00,000 total",
    "INR 2500000 approx",
    "It is about 1.5 cr",
    "Full home is ₹40L",
  ]) {
    assert.equal(scrubNote(line, false), "", line);
  }
});

test("a plain size is not mistaken for a price", () => {
  assert.equal(scrubNote("Flat is 1400 sq ft, 2 bathrooms, 8 weeks to move in.", false), "Flat is 1400 sq ft, 2 bathrooms, 8 weeks to move in.");
});

test("the caller's own budget is allowed through", () => {
  assert.equal(scrubNote("Budget: caller said around 25 lakh.", false), "Budget: caller said around 25 lakh.");
  assert.equal(scrubNote("Caller's budget is about ₹30L total", false), "Caller's budget is about ₹30L total");
});

test("a studio rate is removed even when a budget is also mentioned", () => {
  assert.equal(scrubNote("Budget is 20 lakh and our rate is 1500 per sq ft", false), "");
});

test("a mixed line keeps its clean sentence", () => {
  assert.equal(scrubNote("Caller wants a modular kitchen. We charge ₹2,000 per sq ft.", false), "Caller wants a modular kitchen.");
});

test("pricing line is added when the caller asked, and not duplicated", () => {
  assert.ok(scrubNote("Wants interiors.", true).endsWith(PRICING_LINE));
  const again = scrubNote(`Wants interiors.\n${PRICING_LINE}`, true);
  assert.equal(again.split("\n").filter((l) => l.includes("Asked about pricing")).length, 1);
});

test("the pricing line itself survives the filter", () => {
  assert.equal(scrubNote(PRICING_LINE, true), PRICING_LINE);
});

test("guardClassification cleans every free-text field", () => {
  const out = guardClassification({
    ...base,
    asked_pricing: true,
    fit_reason: "Qualified. Estimate would be 20 lakh.",
    handoff_note: "Wants a 3BHK done.\nWe quote ₹1,500 per sq ft.",
    lead: { ...base.lead, scope: "Full interiors at ₹1,500 per sq ft", timeline: "3 months", budget_band: "Under 30 lakh" },
  });
  assert.equal(out.fit_reason, "Qualified.");
  assert.equal(out.handoff_note, `Wants a 3BHK done.\n${PRICING_LINE}`);
  assert.equal(out.lead.scope, null);
  assert.equal(out.lead.budget_band, "Under 30 lakh");
});

test("audit flags a voice agent that quoted a rate or an amount", () => {
  const flagged = auditAgentTurns([
    { role: "CALLER", text: "How much will it cost per sq ft?" },
    { role: "AGENT", text: "Our rates start at 1,500 per sq ft for full interiors." },
    { role: "AGENT", text: "That would be around ₹18 lakh for your flat." },
  ]);
  assert.equal(flagged.length, 2);
});

test("audit ignores the caller, budget questions and normal talk", () => {
  const flagged = auditAgentTurns([
    { role: "CALLER", text: "I can spend around 20 lakh, is that fine?" },
    { role: "AGENT", text: "Do you have a budget in mind, maybe around 15 lakh?" },
    { role: "AGENT", text: "Our designer will walk you through pricing at the consultation." },
    { role: "AGENT", text: "Is your flat about 1400 sq ft? We usually need 8 weeks." },
  ]);
  assert.deepEqual(flagged, []);
});

test("only qualified.md and services.md can reach a prompt, and pricing.md does not ship", () => {
  assert.deepEqual(Object.keys(knowledge()).sort(), ["qualified", "services"]);
  assert.equal(fs.existsSync(path.join(process.cwd(), "knowledge", "pricing.md")), false);
  for (const dir of ["lib", "app"]) {
    for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      assert.equal(/readFile\w*\([^)]*pricing/i.test(src), false, `${dir}/${f} reads a pricing file`);
    }
  }
});

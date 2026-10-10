import type { Classification, Turn } from "./types";

/**
 * The Cut, enforced in code. The agent never states a price, rate or estimate.
 * Two layers: (1) scrub anything price-like out of the AI's written output before it reaches a designer
 * or the database, (2) audit what the voice agent actually said and flag a slip for a human to review.
 * The caller's own volunteered budget is allowed through (it is a fact about the caller, not a quote).
 */

// A per-sq-ft style rate is never acceptable, from anyone.
const PER_SQFT = /per\s*(?:sq\.?\s*ft|sqft|sq\.?\s*feet|square\s*f(?:oo|ee)t)|\/\s*(?:sq\.?\s*ft|sqft|sq\.?\s*feet)|\bpsf\b/i;

// Wording that states or implies a studio estimate. Only applied to the AI's written output.
const ESTIMATE_WORDS = new RegExp(
  [
    String.raw`\bestimat(?:e|es|ed|ing|ion)\b`,
    String.raw`\bquot(?:e|es|ed|ing|ation|ations)\b`,
    String.raw`\b(?:would|will|should|could|may|might|can)\s+(?:cost|come\s+to|work\s+out|be\s+around|be\s+about)\b`,
    String.raw`\bwe\s+(?:charge|cost)\b`,
    String.raw`\bour\s+(?:rate|rates|price|prices|pricing|fee|fees|charges)\b`,
    String.raw`\bballpark\b`,
    String.raw`\bstarting\s+(?:from|at|price)\b`,
    String.raw`\b(?:costs?|priced?|charges?)\s+(?:around|approx\w*|about|roughly|between|from|at)\b`,
  ].join("|"),
  "i"
);

// A currency amount, including spelled-out ("twenty lakh") and shorthand ("30L") forms.
// Bare numbers are not matched, so "1400 sq ft" is fine.
const MONEY = /₹|\brs\.?\s*\d|\binr\b|\brupees?\b|\b(?:lakh|lakhs|lac|lacs|crore|crores)\b|\b\d[\d,.]*\s*(?:cr|k)\b|\b\d+(?:\.\d+)?l\b/i;
const BUDGET_WORD = /\bbudget\b/i;

const clean = (s: string) => !PER_SQFT.test(s) && !ESTIMATE_WORDS.test(s) && (!MONEY.test(s) || BUDGET_WORD.test(s));

/** Keep a line if it is clean; otherwise keep only its clean sentences. */
function cleanLine(line: string): string {
  if (clean(line)) return line;
  const parts = line.split(/(?<=[.;!?])\s+(?=[A-Z"'])/);
  const kept = parts.filter(clean).join(" ").trim();
  return clean(kept) ? kept : "";
}

export const PRICING_LINE = "Asked about pricing; told designer will cover it.";

export function scrubNote(note: string, askedPricing: boolean): string {
  const lines = note.split(/\r?\n/).map(cleanLine).filter((l) => l.trim());
  if (askedPricing && !lines.some((l) => /asked about pricing/i.test(l))) lines.push(PRICING_LINE);
  return lines.join("\n");
}

const scrubField = (v: string | null, allowBudget = false): string | null => {
  if (!v) return v;
  if (allowBudget) return PER_SQFT.test(v) || ESTIMATE_WORDS.test(v) ? null : v;
  return clean(v) ? v : cleanLine(v) || null;
};

export function guardClassification(c: Classification): Classification {
  const lead = c.lead;
  return {
    ...c,
    fit_reason: scrubField(c.fit_reason) ?? "See transcript",
    handoff_note: scrubNote(c.handoff_note, c.asked_pricing),
    lead: {
      ...lead,
      scope: scrubField(lead.scope),
      timeline: scrubField(lead.timeline),
      budget_band: scrubField(lead.budget_band, true),
    },
  };
}

/** Lines the voice agent spoke that look like a price. For human review; never blocks anything. */
export function auditAgentTurns(turns: Turn[]): string[] {
  return turns
    .filter((t) => t.role === "AGENT")
    .filter((t) => PER_SQFT.test(t.text) || (MONEY.test(t.text) && !BUDGET_WORD.test(t.text)))
    .map((t) => t.text.slice(0, 240));
}

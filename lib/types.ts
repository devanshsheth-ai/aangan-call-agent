export type Turn = { role: "AGENT" | "CALLER" | "TRANSCRIPT"; text: string };

export type NormalisedCall = {
  callId: string;
  callerNumber: string | null;
  endedAt: string | null;
  durationSec: number;
  endReason: string | null;
  summary: string;
  collected: Record<string, unknown>;
  transcript: Turn[];
  recordingUrl: string | null;
  bookedSlot: string | null;
};

export type VaaniEvent =
  | { kind: "started"; callId: string; callerNumber: string | null }
  | { kind: "ended"; callId: string; durationSec: number }
  | { kind: "failed"; callId: string; reason: string }
  | { kind: "postprocessing"; call: NormalisedCall }
  | { kind: "ignored"; event: string };

export type Segment = "home" | "office" | "unknown";

export type Lead = {
  name: string | null;
  area: string | null;
  property_type: string | null;
  size_sqft: number | null;
  scope: string | null;
  budget_band: string | null;
  timeline: string | null;
  source: string | null;
};

export type Classification = {
  classification: "qualified" | "not_fit" | "complaint" | "unclear";
  fit_reason: string;
  asked_pricing: boolean;
  segment: Segment;
  lead: Lead;
  booked_slot: string | null;
  handoff_note: string;
};

export type ClassifyInput = {
  summary: string;
  collected: Record<string, unknown>;
  transcript: Turn[];
  callTime: string | null;
};

export type Designer = { id: string; name: string; email: string | null; specialties: string[] };

export type CallRow = {
  id: string;
  vaani_call_id: string;
  caller_number: string | null;
  started_at: string | null;
  duration_sec: number | null;
  classification: string | null;
};

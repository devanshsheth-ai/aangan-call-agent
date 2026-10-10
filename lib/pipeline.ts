import { auditAgentTurns } from "./guard";
import { handoffEmail, type Mail } from "./email";
import { isAfterHours, transcriptText } from "./vaani";
import type { Deal } from "./hubspot";
import type { CallPatch, Store } from "./store";
import type { Classification, ClassifyInput, Designer, NormalisedCall, VaaniEvent } from "./types";

export type Deps = {
  store: Store;
  classify: (input: ClassifyInput) => Promise<{ result: Classification; costInr: number }>;
  sendEmail: (mail: Mail) => Promise<string>;
  /** Omitted when HubSpot is not configured. */
  createDeal?: (deal: Deal) => Promise<string>;
  actionUrl: (rowId: string, action: "claim" | "reschedule", by?: string) => string;
  frontDeskEmail: string;
  bookingUrl?: string;
  voiceRateInrPerMin: number;
  now?: () => Date;
};

export type PipelineResult = {
  status: "ignored" | "started" | "ended" | "failed" | "duplicate" | "in_progress" | "no_transcript" | "ai_failed" | "processed";
  classification?: Classification["classification"];
  designer?: string | null;
  errors?: string[];
};

const STALE_CLAIM_MS = 5 * 60_000;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

/** Run one output step. A failure is recorded and never stops the others. */
async function attempt<T>(label: string, errors: string[], run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (e) {
    errors.push(`${label}: ${errMsg(e)}`);
    return undefined;
  }
}

const ist = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) + " IST";

async function pickDesigner(segment: string, store: Store, now: Date): Promise<Designer | null> {
  const all = await store.activeDesigners();
  if (!all.length) return null;
  const matched = all.filter((d) => d.specialties.includes(segment));
  const pool = matched.length ? matched : all;
  const counts = await store.assignmentCounts(new Date(now.getTime() - 7 * 864e5).toISOString());
  return [...pool].sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0) || a.name.localeCompare(b.name))[0];
}

function leadMail(o: {
  to: string; rowId: string; call: NormalisedCall; r: Classification; slot: string | null;
  designer: Designer | null; flags: string[]; deps: Deps; prefix?: string;
}): Mail {
  const { call, r, slot, deps } = o;
  const who = r.lead.name ?? "New caller";
  const heading = `${o.prefix ?? ""}Qualified lead: ${who}${r.lead.area ? ` · ${r.lead.area}` : ""}`;
  const buttons = [
    { label: "Claim this lead", url: deps.actionUrl(o.rowId, "claim", o.designer?.name) },
    { label: "Reschedule", url: deps.actionUrl(o.rowId, "reschedule") },
    ...(deps.bookingUrl ? [{ label: "Booking link", url: deps.bookingUrl }] : []),
    ...(call.recordingUrl ? [{ label: "Recording", url: call.recordingUrl }] : []),
  ];
  const parts = handoffEmail({
    heading,
    facts: [
      ["Phone", call.callerNumber],
      ["Segment", r.segment],
      ["Property", [r.lead.property_type, r.lead.size_sqft ? `${r.lead.size_sqft} sq ft` : null].filter(Boolean).join(", ")],
      ["Scope", r.lead.scope],
      ["Timeline", r.lead.timeline],
      ["Budget (caller said)", r.lead.budget_band],
      ["Consultation", slot ? ist(slot) : "Not booked yet. Use the booking link."],
      ["Why qualified", r.fit_reason],
    ],
    note: r.handoff_note,
    buttons,
    warning: o.flags.length
      ? "Check the recording: the voice agent may have mentioned a price on this call, which it is never supposed to do."
      : undefined,
    footer: o.designer ? `Assigned to ${o.designer.name}.` : "No designer is set up for this segment, so this came to the front desk.",
  });
  return { to: o.to, subject: `[Aangan] ${heading}`, ...parts };
}

function plainMail(to: string, heading: string, facts: [string, string | null][], note: string, recording: string | null): Mail {
  const parts = handoffEmail({
    heading,
    facts,
    note,
    buttons: recording ? [{ label: "Recording", url: recording }] : [],
  });
  return { to, subject: `[Aangan] ${heading}`, ...parts };
}

export async function handleEvent(ev: VaaniEvent, deps: Deps): Promise<PipelineResult> {
  const now = (deps.now ?? (() => new Date()))();

  if (ev.kind === "ignored") return { status: "ignored" };

  if (ev.kind === "started") {
    await deps.store.recordCallStarted(ev.callId, ev.callerNumber, now.toISOString(), isAfterHours(now));
    return { status: "started" };
  }

  if (ev.kind === "ended") {
    const patch: CallPatch = { ended_at: now.toISOString() };
    if (ev.durationSec) patch.duration_sec = ev.durationSec;
    await deps.store.upsertCall(ev.callId, patch);
    return { status: "ended" };
  }

  if (ev.kind === "failed") {
    const row = await deps.store.upsertCall(ev.callId, { status: "failed", ended_at: now.toISOString() });
    if (row.classification === null) {
      await deps.store.updateCall(ev.callId, { classification: "unclear", fit_reason: `Call failed: ${ev.reason}`.slice(0, 300) });
    }
    return { status: "failed" };
  }

  const stage = { classified: false };
  try {
    return await processCall(ev.call, deps, now, stage);
  } catch (e) {
    // Intake failed (for example the database is down). The lead must still reach a human.
    if (!stage.classified && ev.call.transcript.length) {
      await attempt("raw_email", [], () =>
        deps.sendEmail(
          plainMail(
            deps.frontDeskEmail,
            "Call could not be logged automatically",
            [["Phone", ev.call.callerNumber], ["Error", errMsg(e)]],
            transcriptText(ev.call.transcript),
            ev.call.recordingUrl
          )
        )
      );
    }
    throw e;
  }
}

async function processCall(call: NormalisedCall, deps: Deps, now: Date, stage: { classified: boolean }): Promise<PipelineResult> {
  const { store } = deps;
  const endedAt = call.endedAt ?? now.toISOString();

  const row = await store.upsertCall(call.callId, {
    status: "completed",
    ended_at: endedAt,
    end_reason: call.endReason,
    summary: call.summary,
    collected: call.collected,
    transcript: call.transcript,
    recording_url: call.recordingUrl,
    ...(call.callerNumber ? { caller_number: call.callerNumber } : {}),
  });

  if (row.classification !== null) return { status: "duplicate" };
  if (!(await store.claimForProcessing(call.callId, now.toISOString(), new Date(now.getTime() - STALE_CLAIM_MS).toISOString()))) {
    return { status: "in_progress" };
  }

  const durationSec =
    call.durationSec || (row.started_at ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(row.started_at)) / 1000)) : 0);
  const meta: CallPatch = {
    duration_sec: durationSec,
    cost_voice_inr: (durationSec / 60) * deps.voiceRateInrPerMin,
    after_hours: isAfterHours(row.started_at ?? endedAt),
  };
  const callerNumber = call.callerNumber ?? row.caller_number;
  const finish = (patch: CallPatch) => store.updateCall(call.callId, { ...meta, ...patch });
  const errors: string[] = [];

  if (!call.transcript.length && !call.summary) {
    await finish({ classification: "unclear", fit_reason: "Call did not connect: no transcript or summary" });
    stage.classified = true;
    return { status: "no_transcript", classification: "unclear" };
  }

  let ai: { result: Classification; costInr: number };
  try {
    ai = await deps.classify({
      summary: call.summary,
      collected: call.collected,
      transcript: call.transcript,
      callTime: row.started_at ?? endedAt,
    });
  } catch (e) {
    errors.push(`classify: ${errMsg(e)}`);
    await attempt("front_desk_email", errors, () =>
      deps.sendEmail(
        plainMail(
          deps.frontDeskEmail,
          "Call needs a human: automatic review failed",
          [["Phone", callerNumber], ["Summary", call.summary || null]],
          transcriptText(call.transcript) || "(no transcript)",
          call.recordingUrl
        )
      )
    );
    await finish({
      classification: "unclear",
      fit_reason: `Automatic review failed, sent to front desk: ${errMsg(e)}`.slice(0, 300),
      output_errors: errors,
    });
    stage.classified = true;
    return { status: "ai_failed", classification: "unclear", errors };
  }

  const { result: r, costInr } = ai;
  const flags = auditAgentTurns(call.transcript);
  const slot = r.classification === "qualified" ? call.bookedSlot ?? r.booked_slot : null;
  const notified = { designer: null as Designer | null, emailId: undefined as string | undefined, dealId: undefined as string | undefined };
  const mailCall = { ...call, callerNumber };

  if (r.classification === "qualified") {
    notified.designer = (await attempt("designer_lookup", errors, () => pickDesigner(r.segment, store, now))) ?? null;
    const d = notified.designer;
    await Promise.all([
      attempt("designer_email", errors, async () => {
        const base = { rowId: row.id, call: mailCall, r, slot, designer: d, flags, deps };
        try {
          notified.emailId = await deps.sendEmail(leadMail({ ...base, to: d?.email || deps.frontDeskEmail }));
        } catch (e) {
          if (!d?.email) throw e;
          errors.push(`designer_email: ${errMsg(e)}`);
          notified.emailId = await deps.sendEmail(leadMail({ ...base, to: deps.frontDeskEmail, prefix: "(designer email failed) " }));
        }
      }),
      deps.createDeal
        ? attempt("hubspot", errors, async () => {
            notified.dealId = await deps.createDeal!({
              phone: callerNumber,
              name: r.lead.name,
              dealName: `${r.lead.name ?? "Caller"} · ${r.lead.area ?? "Pune"} · ${r.segment}`,
              description: r.handoff_note,
            });
          })
        : Promise.resolve(),
    ]);
  } else if (r.classification === "complaint") {
    notified.emailId = await attempt("front_desk_email", errors, () =>
      deps.sendEmail(
        plainMail(
          deps.frontDeskEmail,
          `Complaint call: ${r.lead.name ?? callerNumber ?? "unknown caller"}`,
          [["Phone", callerNumber], ["Why", r.fit_reason]],
          r.handoff_note || call.summary,
          call.recordingUrl
        )
      )
    );
  }

  await finish({
    classification: r.classification,
    fit_reason: r.fit_reason,
    asked_pricing: r.asked_pricing,
    segment: r.segment,
    lead: r.lead,
    handoff_note: r.handoff_note,
    booked_slot: slot,
    designer_id: notified.designer?.id ?? null,
    cost_llm_inr: costInr,
    agent_price_flag: flags.length > 0,
    price_flag_lines: flags.length ? flags : null,
    hubspot_deal_id: notified.dealId ?? null,
    email_message_id: notified.emailId ?? null,
    output_errors: errors.length ? errors : null,
  });
  stage.classified = true;
  return { status: "processed", classification: r.classification, designer: notified.designer?.name ?? null, errors };
}

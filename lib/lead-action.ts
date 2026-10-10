import { NextRequest } from "next/server";
import { esc } from "./email";
import { optionalEnv } from "./env";
import { verify, type LeadAction } from "./links";
import { htmlPage } from "./page";
import { query } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = { id: string; caller_number: string | null; handoff_note: string | null; claimed_by: string | null; lead: { name?: string | null } | null };

async function loadRow(id: string): Promise<Row | null> {
  const rows = await query<Row>("select id, caller_number, handoff_note, claimed_by, lead from calls where id = $1::uuid", [id]);
  return rows[0] ?? null;
}

const bad = () => htmlPage("This link is not valid", "<p>The link is incomplete or has been changed. Please use the button in the original email.</p>", 400);

/**
 * GET only shows a confirm page, because email security scanners open every link and must not change anything.
 * POST (the button on that page) is what records the action.
 */
export async function leadActionGet(req: NextRequest, action: LeadAction): Promise<Response> {
  const q = req.nextUrl.searchParams;
  const id = q.get("id") ?? "";
  const sig = q.get("sig");
  if (!UUID.test(id) || !verify(id, action, sig)) return bad();

  const row = await loadRow(id);
  if (!row) return htmlPage("Lead not found", "<p>This lead no longer exists.</p>", 404);

  const who = row.lead?.name || row.caller_number || "this caller";
  const hidden = `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="sig" value="${esc(sig!)}">`;
  const note = row.handoff_note ? `<p class="note">${esc(row.handoff_note)}</p>` : "";

  if (action === "claim") {
    if (row.claimed_by) return htmlPage("Already claimed", `<p>${esc(who)} was already claimed by <b>${esc(row.claimed_by)}</b>.</p>${note}`);
    return htmlPage(
      "Claim this lead",
      `${note}<form method="post" action="/api/lead/claim">${hidden}<label for="name">Your name</label><input id="name" type="text" name="name" maxlength="60" required value="${esc(q.get("by") ?? "")}"><button type="submit">Claim ${esc(who)}</button></form>`
    );
  }
  return htmlPage(
    "Reschedule this consultation",
    `<p>Mark the consultation with ${esc(who)} as needing a new time. You will get the booking link next.</p><form method="post" action="/api/lead/reschedule">${hidden}<button type="submit">Yes, reschedule</button></form>`
  );
}

export async function leadActionPost(req: NextRequest, action: LeadAction): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  const sig = String(form?.get("sig") ?? "");
  if (!UUID.test(id) || !verify(id, action, sig)) return bad();

  const now = new Date().toISOString();
  if (action === "claim") {
    const name = String(form?.get("name") ?? "").trim().slice(0, 60);
    if (!name) return htmlPage("Name needed", "<p>Please go back and enter your name.</p>", 400);
    let won: { id: string }[];
    try {
      won = await query<{ id: string }>(
        "update calls set claimed_by = $2, claimed_at = $3::timestamptz where id = $1::uuid and claimed_by is null returning id",
        [id, name, now]
      );
    } catch {
      return htmlPage("Something went wrong", "<p>Could not save your claim. Please try the link again.</p>", 500);
    }
    if (!won.length) {
      const row = await loadRow(id);
      return htmlPage("Already claimed", `<p>Another designer got there first: <b>${esc(row?.claimed_by ?? "someone")}</b>.</p>`);
    }
    return htmlPage("Claimed", `<p>Thanks ${esc(name)}. This lead is yours.</p>`);
  }

  try {
    await query("update calls set reschedule_requested_at = $2::timestamptz where id = $1::uuid", [id, now]);
  } catch {
    return htmlPage("Something went wrong", "<p>Could not save this. Please try the link again.</p>", 500);
  }
  const booking = optionalEnv("CALCOM_BOOKING_URL");
  return htmlPage(
    "Marked for rescheduling",
    booking && /^https?:\/\//i.test(booking)
      ? `<p>Noted. Pick a new time here:</p><p><a class="btn" href="${esc(booking)}">Open booking link</a></p>`
      : "<p>Noted. The front desk will arrange a new time.</p>"
  );
}

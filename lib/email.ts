import { env } from "./env";

export type Mail = { to: string; subject: string; html: string; text: string };

/** Sends through Resend's REST API. Returns the message id. */
export async function sendEmail(m: Mail): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return String(data.id);
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "#");

export type EmailParts = {
  heading: string;
  facts: [string, string | null | undefined][];
  note: string;
  buttons: { label: string; url: string }[];
  warning?: string;
  footer?: string;
};

export function handoffEmail(o: EmailParts): { html: string; text: string } {
  const facts = o.facts.filter(([, v]) => v) as [string, string][];
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#16211F">
  <h2 style="margin:0 0 12px;font-size:20px">${esc(o.heading)}</h2>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:14px">${facts
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#56635F;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
  <div style="white-space:pre-wrap;font-size:14px;line-height:1.5;background:#F3F5F4;border-radius:8px;padding:12px 14px">${esc(o.note)}</div>
  ${o.warning ? `<p style="font-size:13px;color:#8A3B12;background:#FBEFE6;border-radius:8px;padding:10px 12px;margin:12px 0 0">${esc(o.warning)}</p>` : ""}
  <p style="margin:18px 0">${o.buttons
    .map(
      (b, i) =>
        `<a href="${esc(safeUrl(b.url))}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:14px;${
          i === 0 ? "background:#1F5E57;color:#fff" : "border:1px solid #1F5E57;color:#1F5E57"
        }">${esc(b.label)}</a>`
    )
    .join("")}</p>
  ${o.footer ? `<p style="font-size:12px;color:#56635F">${esc(o.footer)}</p>` : ""}
</div>`;
  const text = [
    o.heading, "",
    ...facts.map(([k, v]) => `${k}: ${v}`), "",
    o.note, "",
    ...(o.warning ? [o.warning, ""] : []),
    ...o.buttons.map((b) => `${b.label}: ${b.url}`),
    o.footer ?? "",
  ].join("\n");
  return { html, text };
}

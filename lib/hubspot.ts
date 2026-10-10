import { env, optionalEnv } from "./env";

export type Deal = { phone: string | null; name: string | null; dealName: string; description: string };

async function hs(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env("HUBSPOT_PRIVATE_APP_TOKEN")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/** Finds or creates the contact by phone number, then creates a deal linked to it. Returns the deal id. */
export async function createDeal(d: Deal): Promise<string> {
  let contactId: string | undefined;
  if (d.phone) {
    const found = await hs("/crm/v3/objects/contacts/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: d.phone }] }],
      limit: 1,
    });
    contactId = found.results?.[0]?.id;
    if (!contactId) {
      const [first, ...rest] = (d.name ?? "").split(" ");
      const created = await hs("/crm/v3/objects/contacts", "POST", {
        properties: { phone: d.phone, firstname: first || "Caller", lastname: rest.join(" ") },
      });
      contactId = created.id;
    }
  }
  const deal = await hs("/crm/v3/objects/deals", "POST", {
    properties: {
      dealname: d.dealName,
      pipeline: optionalEnv("HUBSPOT_PIPELINE") ?? "default",
      dealstage: optionalEnv("HUBSPOT_DEAL_STAGE") ?? "appointmentscheduled",
      description: d.description,
    },
    associations: contactId
      ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }]
      : [],
  });
  return String(deal.id);
}

import { markShowedUp, markWon } from "./actions";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Day = {
  day: string; calls: number; after_hours_calls: number; qualified: number; booked: number;
  showed_up: number; won: number; won_value_inr: number; cost_inr: number; price_flags: number;
};
type Recent = {
  id: string; created_at: string; started_at: string | null; caller_number: string | null;
  classification: string | null; fit_reason: string | null; segment: string | null;
  asked_pricing: boolean; after_hours: boolean; booked_slot: string | null; claimed_by: string | null;
  showed_up_at: string | null; won_at: string | null; won_value_inr: number | null;
  agent_price_flag: boolean; duration_sec: number | null; designers: { name: string } | null;
};

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "";

async function load() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [days, recent] = await Promise.all([
    query<Day>(
      `select day::text as day, calls, after_hours_calls, qualified, booked, showed_up, won,
              won_value_inr::float8 as won_value_inr, cost_inr::float8 as cost_inr, price_flags
       from daily_metrics where day >= $1::date order by day desc`,
      [since]
    ),
    query<Recent & { designer_name: string | null }>(
      `select c.id, c.created_at, c.started_at, c.caller_number, c.classification, c.fit_reason, c.segment,
              c.asked_pricing, c.after_hours, c.booked_slot, c.claimed_by, c.showed_up_at, c.won_at,
              c.won_value_inr::float8 as won_value_inr, c.agent_price_flag, c.duration_sec, d.name as designer_name
       from calls c left join designers d on d.id = c.designer_id
       order by c.created_at desc limit 30`
    ),
  ]);
  return {
    days,
    recent: recent.map((r) => ({ ...r, designers: r.designer_name ? { name: r.designer_name } : null })) as Recent[],
  };
}

export default async function Dashboard() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (e) {
    return (
      <div className="wrap">
        <h1>Aangan calls</h1>
        <p className="error">
          The dashboard could not read the database: {e instanceof Error ? e.message : "unknown error"}. Check DATABASE_URL, and that
          db/migrations/001_init.sql has been run in the Neon SQL Editor.
        </p>
      </div>
    );
  }

  const sum = (k: keyof Day) => data.days.reduce((a, d) => a + Number(d[k] ?? 0), 0);
  const calls = sum("calls"), booked = sum("booked"), cost = sum("cost_inr"), flags = sum("price_flags");
  const tiles: { n: string; l: string; warn?: boolean }[] = [
    { n: String(calls), l: "Calls" },
    { n: String(sum("after_hours_calls")), l: "After-hours calls" },
    { n: String(sum("qualified")), l: "Qualified" },
    { n: String(booked), l: "Booked" },
    { n: String(sum("showed_up")), l: "Showed up" },
    { n: `${sum("won")}${sum("won_value_inr") ? ` · ${inr0.format(sum("won_value_inr"))}` : ""}`, l: "Won" },
    { n: inr2.format(cost), l: "Cost (voice + AI)" },
    { n: booked ? inr2.format(cost / booked) : "–", l: "Cost per booking" },
    { n: String(flags), l: "Price slips to review", warn: flags > 0 },
  ];

  return (
    <div className="wrap">
      <h1>Aangan calls</h1>
      <p className="sub">Last 30 days, India time. Showing what the AI call agent has handled.</p>

      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.l} className={`tile${t.warn ? " warn" : ""}`}>
            <div className="n">{t.n}</div>
            <div className="l">{t.l}</div>
          </div>
        ))}
      </div>

      <h2>By day</h2>
      <div className="scroll">
        {data.days.length === 0 ? (
          <div className="empty">No calls yet. Make a test call or run the webhook test script.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th><th className="num">Calls</th><th className="num">After hours</th><th className="num">Qualified</th>
                <th className="num">Booked</th><th className="num">Showed up</th><th className="num">Won</th><th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td><td className="num">{d.calls}</td><td className="num">{d.after_hours_calls}</td>
                  <td className="num">{d.qualified}</td><td className="num">{d.booked}</td><td className="num">{d.showed_up}</td>
                  <td className="num">{d.won}</td><td className="num">{inr2.format(Number(d.cost_inr))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Recent calls</h2>
      <div className="scroll">
        {data.recent.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th><th>Caller</th><th>Result</th><th>Reason</th><th>Designer</th><th>Consultation</th><th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((c) => (
                <tr key={c.id}>
                  <td>{when(c.started_at ?? c.created_at)}{c.after_hours ? " (after hours)" : ""}</td>
                  <td>{c.caller_number ?? "unknown"}</td>
                  <td>
                    <span className={`pill ${c.classification ?? ""}`}>{c.classification ?? "processing"}</span>
                    {c.asked_pricing ? <> <span className="pill">asked price</span></> : null}
                    {c.agent_price_flag ? <> <span className="pill flag">price slip</span></> : null}
                  </td>
                  <td className="wrapcell">{c.fit_reason}</td>
                  <td>{c.designers?.name ?? ""}{c.claimed_by ? ` (claimed: ${c.claimed_by})` : ""}</td>
                  <td>{when(c.booked_slot)}</td>
                  <td>
                    {c.classification !== "qualified" ? null : c.won_at ? (
                      <span className="pill qualified">won{c.won_value_inr ? ` ${inr0.format(Number(c.won_value_inr))}` : ""}</span>
                    ) : c.showed_up_at ? (
                      <form className="inline" action={markWon}>
                        <input type="hidden" name="id" value={c.id} />
                        <input name="value" placeholder="Value ₹" inputMode="numeric" required />
                        <button type="submit">Mark won</button>
                      </form>
                    ) : c.booked_slot ? (
                      <form className="inline" action={markShowedUp}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit">Showed up</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

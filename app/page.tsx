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
const dayLabel = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
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

const FILTERS = [["all", "All"], ["qualified", "Qualified"], ["not_fit", "not_fit"], ["complaint", "complaint"], ["unclear", "unclear"]] as const;

function Action({ c }: { c: Recent }) {
  if (c.classification !== "qualified") return <span className="none">—</span>;
  if (c.won_at) return <span className="wonbadge">Won{c.won_value_inr ? ` ${inr0.format(Number(c.won_value_inr))}` : ""}</span>;
  if (c.showed_up_at)
    return (
      <form className="inline" action={markWon}>
        <input type="hidden" name="id" value={c.id} />
        <input name="value" placeholder="₹ value" inputMode="numeric" required aria-label="Project value in rupees" />
        <button type="submit">Won</button>
      </form>
    );
  if (c.booked_slot)
    return (
      <form action={markShowedUp}>
        <input type="hidden" name="id" value={c.id} />
        <button type="submit" className="ghost">Showed up</button>
      </form>
    );
  return <span className="none">—</span>;
}

function Badges({ c }: { c: Recent }) {
  return (
    <div className="pills">
      <span className={`pill ${c.classification ?? ""}`}>{c.classification ?? "processing"}</span>
      {c.asked_pricing ? <span className="pill">asked price</span> : null}
      {c.agent_price_flag ? <span className="pill flag">price slip</span> : null}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const filter = FILTERS.some(([k]) => k === r) ? (r as string) : "all";

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
  const calls = sum("calls"), qualified = sum("qualified"), booked = sum("booked"), showed = sum("showed_up");
  const won = sum("won"), wonValue = sum("won_value_inr"), cost = sum("cost_inr"), flags = sum("price_flags"), afterHours = sum("after_hours_calls");

  const hero = [
    { l: "Calls", n: String(calls), note: `${afterHours} after hours` },
    { l: "Qualified", n: String(qualified), note: calls ? `${Math.round((qualified / calls) * 100)}% of calls` : "" },
    { l: "Booked", n: String(booked), note: qualified ? `${Math.round((booked / qualified) * 100)}% of qualified` : "" },
    { l: "Won", n: String(won), note: wonValue ? `${inr0.format(wonValue)} total` : "" },
  ];
  const minor = [
    ["After-hours calls", String(afterHours)],
    ["Showed up", String(showed)],
    ["Cost (voice + AI)", inr2.format(cost)],
    ["Cost per booking", booked ? inr2.format(cost / booked) : "–"],
  ];
  const funnel = [["Calls", calls], ["Qualified", qualified], ["Booked", booked], ["Showed up", showed], ["Won", won]] as const;
  const colors = ["#4F5E3F", "#7F8C6C", "#A9B28F", "#CFCBB0", "#8E5A42"];
  const rows = data.recent.filter((c) => filter === "all" || c.classification === filter);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">A</div>
          <b>Aangan <span>Studio</span></b>
        </div>
        <nav className="nav">
          <a className="on" href="#top">Overview</a>
          <a href="#by-day">By day</a>
          <a href="#recent">Recent calls</a>
        </nav>
        <div className="live">Live · India time</div>
      </aside>

      <section className="top" id="top">
        <div className="banner">
          <h1>Aangan calls</h1>
          <p>Last 30 days, India time. Showing what the AI call agent has handled.</p>
        </div>
        <div className="hero">
          {hero.map((t, i) => (
            <div key={t.l} className={`hcard h${i}`}>
              <div className="l">{t.l}</div>
              <div>
                <div className="n">{t.n}</div>
                <div className="note">{t.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="rail">
        <div className={`slip${flags > 0 ? " warn" : ""}`}>
          <div className="l">Price slips to review</div>
          <div className="n">{flags}</div>
        </div>
        <div className="card">
          {minor.map(([l, v]) => (
            <div key={l} className="minor"><span>{l}</span><b>{v}</b></div>
          ))}
        </div>
        <div className="card pad">
          <div className="funnel">
            {funnel.map(([l, v], i) => (
              <div key={l} className="col">
                <span className="v">{v}</span>
                <div className="bar" style={{ background: colors[i], height: `${Math.max(4, calls ? (v / calls) * 85 : 0)}%` }} />
              </div>
            ))}
          </div>
          <div className="flabels">{funnel.map(([l]) => <span key={l}>{l}</span>)}</div>
        </div>
      </aside>

      <section className="lower">
        <h2 id="by-day">By day</h2>
        <div className="box tall">
          {data.days.length === 0 ? (
            <div className="empty">No calls yet. Make a test call or run the webhook test script.</div>
          ) : (
            <table className="days">
              <thead>
                <tr>
                  <th>Day</th><th className="num">Calls</th><th className="num">After hours</th><th className="num">Qualified</th>
                  <th className="num">Booked</th><th className="num">Showed up</th><th className="num">Won</th><th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.day}>
                    <td>{dayLabel(d.day)}</td><td className="num">{d.calls}</td><td className="num dim">{d.after_hours_calls}</td>
                    <td className="num">{d.qualified}</td><td className="num">{d.booked}</td><td className="num">{d.showed_up}</td>
                    <td className="num">{d.won}</td><td className="num dim">{inr2.format(Number(d.cost_inr))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="callshead" id="recent">
          <h2>Recent calls</h2>
          <div className="chips">
            {FILTERS.map(([k, label]) => (
              <a key={k} className={`chip${filter === k ? " on" : ""}`} href={k === "all" ? "/#recent" : `/?r=${k}#recent`}>{label}</a>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="box"><div className="empty">No calls here yet.</div></div>
        ) : (
          <>
            <div className="box calls">
              <table>
                <thead>
                  <tr>
                    <th>When</th><th>Caller</th><th>Result</th><th>Reason</th><th>Designer</th><th>Consultation</th><th>Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td className="when">{when(c.started_at ?? c.created_at)}{c.after_hours ? " (after hours)" : ""}</td>
                      <td>{c.caller_number ?? "unknown"}</td>
                      <td><Badges c={c} /></td>
                      <td className="wrapcell">{c.fit_reason}</td>
                      <td>{c.designers?.name ?? "—"}{c.claimed_by ? ` (claimed: ${c.claimed_by})` : ""}</td>
                      <td>{c.booked_slot ? when(c.booked_slot) : "—"}</td>
                      <td><div className="act"><Action c={c} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cards">
              {rows.map((c) => (
                <div key={c.id} className="rcard">
                  <div className="row1">
                    <b>{c.caller_number ?? "unknown"}</b>
                    <Badges c={c} />
                  </div>
                  <div className="when">{when(c.started_at ?? c.created_at)}{c.after_hours ? " (after hours)" : ""}</div>
                  <div className="why">{c.fit_reason}</div>
                  <dl>
                    <dt>Designer</dt><dd>{c.designers?.name ?? "—"}{c.claimed_by ? ` (claimed: ${c.claimed_by})` : ""}</dd>
                    <dt>Consultation</dt><dd>{c.booked_slot ? when(c.booked_slot) : "—"}</dd>
                  </dl>
                  <div className="act"><Action c={c} /></div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { markShowedUp, markWon } from "./actions";

export type Day = {
  day: string; calls: number; after_hours_calls: number; qualified: number; booked: number;
  showed_up: number; won: number; won_value_inr: number; cost_inr: number; price_flags: number;
};
export type Recent = {
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
const istDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

const FILTERS: [string, string][] = [
  ["all", "All"], ["qualified", "Qualified"], ["not_fit", "not_fit"], ["complaint", "complaint"], ["unclear", "unclear"],
  ["booked", "Booked"], ["won", "Won"], ["slips", "Price slips"], ["after_hours", "After hours"],
];

function matches(c: Recent, f: string) {
  switch (f) {
    case "all": return true;
    case "booked": return !!c.booked_slot;
    case "won": return !!c.won_at;
    case "slips": return c.agent_price_flag;
    case "after_hours": return c.after_hours;
    default: return c.classification === f;
  }
}

function Action({ c }: { c: Recent }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (c.classification !== "qualified") return <span className="none">—</span>;
  if (c.won_at) return <span className="wonbadge">Won{c.won_value_inr ? ` ${inr0.format(Number(c.won_value_inr))}` : ""}</span>;
  if (c.showed_up_at)
    return (
      <form className="inline" action={markWon} onClick={stop}>
        <input type="hidden" name="id" value={c.id} />
        <input name="value" placeholder="₹ value" inputMode="numeric" required aria-label="Project value in rupees" />
        <button type="submit">Won</button>
      </form>
    );
  if (c.booked_slot)
    return (
      <form action={markShowedUp} onClick={stop}>
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

function Detail({ c }: { c: Recent }) {
  return (
    <dl className="detail">
      <dt>Segment</dt><dd>{c.segment ?? "—"}</dd>
      <dt>Call length</dt><dd>{c.duration_sec ? mins(c.duration_sec) : "—"}</dd>
      <dt>Claimed by</dt><dd>{c.claimed_by ?? "not claimed yet"}</dd>
      <dt>Showed up</dt><dd>{c.showed_up_at ? when(c.showed_up_at) : "—"}</dd>
    </dl>
  );
}

export default function Dashboard({ days, recent, range }: { days: Day[]; recent: Recent[]; range: number }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [newest, setNewest] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState("top");

  useEffect(() => {
    const ids = ["top", "by-day", "recent"];
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-30% 0px -60% 0px" }
    );
    ids.forEach((i) => { const el = document.getElementById(i); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  const sum = (k: keyof Day) => days.reduce((a, d) => a + Number(d[k] ?? 0), 0);
  const calls = sum("calls"), qualified = sum("qualified"), booked = sum("booked"), showed = sum("showed_up");
  const won = sum("won"), wonValue = sum("won_value_inr"), cost = sum("cost_inr"), flags = sum("price_flags"), afterHours = sum("after_hours_calls");
  const count = (cls: string) => recent.filter((c) => c.classification === cls).length;
  const asked = recent.filter((c) => c.asked_pricing).length;
  const durs = recent.map((c) => c.duration_sec ?? 0).filter((n) => n > 0);
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;

  const show = (f: string) => { setFilter(f); setDay(null); document.getElementById("recent")?.scrollIntoView({ behavior: "smooth" }); };

  const hero: { l: string; n: string; note: string; f: string }[] = [
    { l: "Calls", n: String(calls), note: `${afterHours} after hours`, f: "all" },
    { l: "Qualified", n: String(qualified), note: calls ? `${pct(qualified, calls)} of calls` : "", f: "qualified" },
    { l: "Booked", n: String(booked), note: qualified ? `${pct(booked, qualified)} of qualified` : "", f: "booked" },
    { l: "Won", n: String(won), note: wonValue ? `${inr0.format(wonValue)} total` : "", f: "won" },
  ];
  const minor: [string, string, string?][] = [
    ["After-hours calls", String(afterHours), "after_hours"],
    ["Asked about price", String(asked)],
    ["Showed up", String(showed)],
    ["Avg call length", avgDur ? mins(avgDur) : "–"],
    ["Calls per day", days.length ? (calls / days.length).toFixed(1) : "–"],
    ["Show-up rate", pct(showed, booked)],
    ["Win rate", pct(won, showed)],
    ["Avg project value", won ? inr0.format(wonValue / won) : "–"],
    ["Cost (voice + AI)", inr2.format(cost)],
    ["Cost per call", calls ? inr2.format(cost / calls) : "–"],
    ["Cost per booking", booked ? inr2.format(cost / booked) : "–"],
  ];
  const funnel: [string, number, string][] = [["Calls", calls, "all"], ["Qualified", qualified, "qualified"], ["Booked", booked, "booked"], ["Showed up", showed, "all"], ["Won", won, "won"]];
  const colors = ["#4F5E3F", "#7F8C6C", "#A9B28F", "#CFCBB0", "#8E5A42"];
  const mix: [string, number, string][] = [
    ["qualified", count("qualified"), "#7F8C6C"], ["not_fit", count("not_fit"), "#CFC6B0"],
    ["complaint", count("complaint"), "#C98A6B"], ["unclear", count("unclear"), "#D9C690"],
  ];
  const mixTotal = mix.reduce((a, m) => a + m[1], 0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = recent.filter(
      (c) =>
        matches(c, filter) &&
        (!day || istDay(c.started_at ?? c.created_at) === day) &&
        (!needle || `${c.caller_number ?? ""} ${c.fit_reason ?? ""} ${c.designers?.name ?? ""}`.toLowerCase().includes(needle))
    );
    return newest ? r : [...r].reverse();
  }, [recent, filter, q, day, newest]);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const onKey = (id: string) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(id); } };

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-in">
          <div className="brand">
            <div className="logo">A</div>
            <b>Aangan <span>Studio</span></b>
          </div>
          <nav className="nav">
            {[["top", "Overview"], ["by-day", "By day"], ["recent", "Recent calls"]].map(([id, label]) => (
              <a key={id} className={active === id ? "on" : ""} href={`#${id}`}>{label}</a>
            ))}
          </nav>
          <div className="live">Live · India time</div>
        </div>
      </aside>

      <section className="top" id="top">
        <div className="banner">
          <div>
            <h1>Aangan calls</h1>
            <p>Last {range} days, India time. Showing what the AI call agent has handled.</p>
          </div>
          <div className="range" role="group" aria-label="Date range">
            {[7, 30, 90].map((n) => (
              <Link key={n} href={`/?days=${n}`} className={`chip${range === n ? " on" : ""}`} scroll={false}>{n} days</Link>
            ))}
          </div>
        </div>
        <div className="hero">
          {hero.map((t, i) => (
            <button key={t.l} type="button" className={`hcard h${i}${filter === t.f && t.f !== "all" ? " sel" : ""}`} onClick={() => show(t.f)} aria-label={`${t.l}: ${t.n}. Show these calls`}>
              <span className="l">{t.l}</span>
              <span>
                <span className="n">{t.n}</span>
                <span className="note">{t.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="rail">
        <div className="rail-in">
          <button type="button" className={`slip${flags > 0 ? " warn" : ""}`} onClick={() => show("slips")}>
            <span className="l">Price slips to review</span>
            <span className="n">{flags}</span>
          </button>
          <div className="card">
            {minor.map(([l, v, f]) =>
              f ? (
                <button type="button" key={l} className="minor link" onClick={() => show(f)}><span>{l}</span><b>{v}</b></button>
              ) : (
                <div key={l} className="minor"><span>{l}</span><b>{v}</b></div>
              )
            )}
          </div>
          <div className="card pad">
            <div className="funnel">
              {funnel.map(([l, v, f], i) => (
                <button type="button" key={l} className="col" onClick={() => show(f)} aria-label={`${l}: ${v}`}>
                  <span className="v">{v}</span>
                  <span className="bar" style={{ background: colors[i], height: `${Math.max(4, calls ? (v / calls) * 85 : 0)}%` }} />
                </button>
              ))}
            </div>
            <div className="flabels">{funnel.map(([l]) => <span key={l}>{l}</span>)}</div>
          </div>
          <div className="card pad">
            <div className="mixhead">Call outcomes</div>
            <div className="mixbar">
              {mixTotal ? mix.filter((m) => m[1]).map(([l, n, c]) => (
                <button type="button" key={l} title={`${l}: ${n}`} aria-label={`${l}: ${n}`} style={{ width: `${(n / mixTotal) * 100}%`, background: c }} onClick={() => show(l)} />
              )) : <span className="mixempty" />}
            </div>
            <div className="mixkey">
              {mix.map(([l, n, c]) => (
                <button type="button" key={l} onClick={() => show(l)}><i style={{ background: c }} />{l} <b>{n}</b></button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="lower">
        <h2 id="by-day">By day</h2>
        <div className="box tall">
          {days.length === 0 ? (
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
                {days.map((d) => (
                  <tr key={d.day} className={`click${day === d.day ? " sel" : ""}`} tabIndex={0}
                    onClick={() => { setDay(day === d.day ? null : d.day); setFilter("all"); if (day !== d.day) document.getElementById("recent")?.scrollIntoView({ behavior: "smooth" }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLElement).click(); }}>
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
              <button type="button" key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="tools">
          <input type="search" className="search" placeholder="Search caller, reason or designer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search calls" />
          <button type="button" className="chip" onClick={() => setNewest(!newest)}>{newest ? "Newest first" : "Oldest first"}</button>
          {day ? <button type="button" className="chip on" onClick={() => setDay(null)}>Day: {dayLabel(day)} ✕</button> : null}
          <span className="count">{rows.length} of {recent.length}</span>
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
                    <FragmentRow key={c.id} c={c} open={open === c.id} toggle={() => toggle(c.id)} onKey={onKey(c.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cards">
              {rows.map((c) => (
                <div key={c.id} className="rcard" role="button" tabIndex={0} aria-expanded={open === c.id} onClick={() => toggle(c.id)} onKeyDown={onKey(c.id)}>
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
                  {open === c.id ? <Detail c={c} /> : null}
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

function FragmentRow({ c, open, toggle, onKey }: { c: Recent; open: boolean; toggle: () => void; onKey: (e: React.KeyboardEvent) => void }) {
  return (
    <>
      <tr className={`click${open ? " sel" : ""}`} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={onKey}>
        <td className="when">{when(c.started_at ?? c.created_at)}{c.after_hours ? " (after hours)" : ""}</td>
        <td>{c.caller_number ?? "unknown"}</td>
        <td><Badges c={c} /></td>
        <td className="wrapcell">{c.fit_reason}</td>
        <td>{c.designers?.name ?? "—"}{c.claimed_by ? ` (claimed: ${c.claimed_by})` : ""}</td>
        <td>{c.booked_slot ? when(c.booked_slot) : "—"}</td>
        <td><div className="act"><Action c={c} /></div></td>
      </tr>
      {open ? <tr className="detailrow"><td colSpan={7}><Detail c={c} /></td></tr> : null}
    </>
  );
}

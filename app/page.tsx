import { query } from "@/lib/db";
import Dashboard, { type Day, type Recent } from "./Dashboard";

export const dynamic = "force-dynamic";

async function load(range: number) {
  const since = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
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
       where c.created_at >= $1::timestamptz
       order by c.created_at desc limit 500`,
      [since]
    ),
  ]);
  return {
    days,
    recent: recent.map((r) => ({ ...r, designers: r.designer_name ? { name: r.designer_name } : null })) as Recent[],
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const range = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(range);
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
  return <Dashboard days={data.days} recent={data.recent} range={range} />;
}

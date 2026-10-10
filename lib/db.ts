import { neon } from "@neondatabase/serverless";
import { env } from "./env";

let run: ReturnType<typeof neon> | undefined;

function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

/** Runs one parameterised query on Neon and returns the rows. Timestamps come back as ISO strings. */
export async function query<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  run ??= neon(env("DATABASE_URL"));
  const rows = (await run.query(text, params)) as Record<string, unknown>[];
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)]))) as T[];
}

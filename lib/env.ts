export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function numberEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
}

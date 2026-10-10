import { NextRequest, NextResponse } from "next/server";

// Protects the dashboard only. /api routes have their own checks (webhook token, signed links).
export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };

const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse("Dashboard is locked: set DASHBOARD_PASSWORD.", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const i = decoded.indexOf(":");
      if (i >= 0 && (await same(decoded.slice(0, i), "aangan")) && (await same(decoded.slice(i + 1), password))) {
        return NextResponse.next();
      }
    } catch {
      // fall through to the 401
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Aangan dashboard", charset="UTF-8"' },
  });
}

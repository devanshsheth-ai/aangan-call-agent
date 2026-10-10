import { NextRequest } from "next/server";
import { leadActionGet, leadActionPost } from "@/lib/lead-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (req: NextRequest) => leadActionGet(req, "claim");
export const POST = (req: NextRequest) => leadActionPost(req, "claim");

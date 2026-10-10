import crypto from "node:crypto";
import { env } from "./env";
import { safeEqual } from "./vaani";

export type LeadAction = "claim" | "reschedule";

/** HMAC-signed action links, so only someone holding the email can claim or reschedule a lead. */
export function sign(callId: string, action: LeadAction, secret = env("LINK_SECRET")): string {
  return crypto.createHmac("sha256", secret).update(`${action}:${callId}`).digest("hex");
}

export function verify(callId: string, action: LeadAction, sig: string | null, secret = env("LINK_SECRET")): boolean {
  return !!sig && safeEqual(sign(callId, action, secret), sig);
}

export function actionUrl(callId: string, action: LeadAction, by?: string): string {
  const u = new URL(`/api/lead/${action}`, env("APP_URL"));
  u.searchParams.set("id", callId);
  u.searchParams.set("sig", sign(callId, action));
  if (by) u.searchParams.set("by", by);
  return u.toString();
}

"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(form: FormData): string {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Bad call id");
  return id;
}

export async function markShowedUp(form: FormData) {
  await query("update calls set showed_up_at = now() where id = $1::uuid", [idOf(form)]);
  revalidatePath("/");
}

export async function markWon(form: FormData) {
  const value = Number(String(form.get("value") ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(value) || value < 0) throw new Error("Enter the project value in rupees");
  await query("update calls set won_at = now(), won_value_inr = $2::numeric where id = $1::uuid", [idOf(form), value]);
  revalidatePath("/");
}

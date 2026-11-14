"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { FORBIDDEN, errorState } from "@/lib/action-runner";
import { parseForm, rawValues, type FormState } from "@/lib/form-state";
import { optionListSchema, settingsSchema } from "@/lib/validation/schemas";
import { updateSettings } from "@/lib/repo/settings";
import { updateOptionList } from "@/lib/repo/options";
import { isOptionListKey } from "@/lib/options";

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  if (actor.role !== "admin") return { message: FORBIDDEN };
  const parsed = parseForm(settingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const version = Number(formData.get("version"));
  try {
    await updateSettings(Number.isInteger(version) ? version : -1, parsed.data, actor);
  } catch (err) {
    return errorState(err, rawValues(formData));
  }
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveOptionList(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  if (actor.role !== "admin") return { message: FORBIDDEN };
  const key = String(formData.get("key") ?? "");
  if (!isOptionListKey(key)) return { message: "Unknown list." };
  const parsed = parseForm(optionListSchema, formData);
  if (!parsed.ok) return parsed.state;
  const version = Number(formData.get("version"));
  try {
    await updateOptionList(key, Number.isInteger(version) ? version : -1, parsed.data, actor);
  } catch (err) {
    return errorState(err, rawValues(formData));
  }
  revalidatePath("/", "layout");
  redirect(`/admin/settings?saved=1#list-${key}`);
}

"use server";

import { runDelete, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { preownedSchema } from "@/lib/validation/schemas";
import { createPreowned, deletePreowned, updatePreowned } from "@/lib/repo/modules";

export async function savePreowned(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, preownedSchema, "/preowned", "preowned:edit", { create: createPreowned, update: updatePreowned });
}

export async function removePreowned(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/preowned", "preowned:delete", deletePreowned);
}

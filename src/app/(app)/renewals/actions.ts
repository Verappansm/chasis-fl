"use server";

import { runDelete, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { renewalSchema } from "@/lib/validation/schemas";
import { createRenewal, deleteRenewal, updateRenewal } from "@/lib/repo/modules";

export async function saveRenewal(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, renewalSchema, "/renewals", "renewals:edit", { create: createRenewal, update: updateRenewal });
}

export async function removeRenewal(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/renewals", "renewals:delete", deleteRenewal);
}

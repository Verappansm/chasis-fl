"use server";

import { runDelete, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { incentiveSchema } from "@/lib/validation/schemas";
import { createIncentive, deleteIncentive, updateIncentive } from "@/lib/repo/modules";

export async function saveIncentive(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, incentiveSchema, "/incentives", "incentives:edit", { create: createIncentive, update: updateIncentive });
}

export async function removeIncentive(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/incentives", "incentives:delete", deleteIncentive);
}

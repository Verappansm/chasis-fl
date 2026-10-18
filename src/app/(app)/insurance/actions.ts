"use server";

import { runDelete, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { insuranceSchema } from "@/lib/validation/schemas";
import { createInsurance, deleteInsurance, updateInsurance } from "@/lib/repo/modules";

export async function saveInsurance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, insuranceSchema, "/insurance", "insurance:edit", { create: createInsurance, update: updateInsurance });
}

export async function removeInsurance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/insurance", "insurance:delete", deleteInsurance);
}

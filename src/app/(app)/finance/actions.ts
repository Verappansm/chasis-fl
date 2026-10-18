"use server";

import { runDelete, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { financeSchema } from "@/lib/validation/schemas";
import { createFinance, deleteFinance, updateFinance } from "@/lib/repo/modules";

export async function saveFinance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, financeSchema, "/finance", "finance:edit", { create: createFinance, update: updateFinance });
}

export async function removeFinance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/finance", "finance:delete", deleteFinance);
}

"use server";

import { runDelete, runReceipt, runReceiptRemove, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { insuranceSchema } from "@/lib/validation/schemas";
import { createInsurance, deleteInsurance, updateInsurance, addReceipt, removeReceipt } from "@/lib/repo/modules";

export async function saveInsurance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, insuranceSchema, "/insurance", "insurance:invoice", { create: createInsurance, update: updateInsurance });
}

export async function saveInsuranceReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceipt(formData, "/insurance", "insurance:receipt", (id, v, data, user) => addReceipt("insurance", id, v, data, user));
}

export async function removeInsurance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/insurance", "insurance:delete", deleteInsurance);
}

export async function removeInsuranceReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceiptRemove(formData, "/insurance", "insurance:receipt", (id, v, receiptId, user) => removeReceipt("insurance", id, v, receiptId, user));
}

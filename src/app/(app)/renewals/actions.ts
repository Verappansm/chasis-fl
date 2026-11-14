"use server";

import { runDelete, runReceipt, runReceiptRemove, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { renewalSchema } from "@/lib/validation/schemas";
import { createRenewal, deleteRenewal, updateRenewal, addReceipt, removeReceipt } from "@/lib/repo/modules";

export async function saveRenewal(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, renewalSchema, "/renewals", "renewals:invoice", { create: createRenewal, update: updateRenewal });
}

export async function saveRenewalReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceipt(formData, "/renewals", "renewals:receipt", (id, v, data, user) => addReceipt("renewal", id, v, data, user));
}

export async function removeRenewal(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/renewals", "renewals:delete", deleteRenewal);
}

export async function removeRenewalReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceiptRemove(formData, "/renewals", "renewals:receipt", (id, v, receiptId, user) => removeReceipt("renewal", id, v, receiptId, user));
}

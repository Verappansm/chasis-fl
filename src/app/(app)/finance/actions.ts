"use server";

import { runDelete, runReceipt, runReceiptRemove, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { financeSchema } from "@/lib/validation/schemas";
import { createFinance, deleteFinance, updateFinance, addReceipt, removeReceipt } from "@/lib/repo/modules";

export async function saveFinance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, financeSchema, "/finance", "finance:invoice", { create: createFinance, update: updateFinance });
}

export async function saveFinanceReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceipt(formData, "/finance", "finance:receipt", (id, v, data, user) => addReceipt("finance", id, v, data, user));
}

export async function removeFinance(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/finance", "finance:delete", deleteFinance);
}

export async function removeFinanceReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceiptRemove(formData, "/finance", "finance:receipt", (id, v, receiptId, user) => removeReceipt("finance", id, v, receiptId, user));
}

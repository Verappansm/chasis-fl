"use server";

import { runDelete, runReceipt, runReceiptRemove, runSave } from "@/lib/action-runner";
import type { FormState } from "@/lib/form-state";
import { purchaseSchema } from "@/lib/validation/schemas";
import { createPurchase, deletePurchase, updatePurchase, addReceipt, removeReceipt } from "@/lib/repo/modules";

export async function savePurchase(_prev: FormState, formData: FormData): Promise<FormState> {
  return runSave(formData, purchaseSchema, "/purchases", "purchases:invoice", { create: createPurchase, update: updatePurchase });
}

export async function savePurchaseReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceipt(formData, "/purchases", "purchases:receipt", (id, v, data, user) => addReceipt("purchase", id, v, data, user));
}

export async function removePurchase(_prev: FormState, formData: FormData): Promise<FormState> {
  return runDelete(formData, "/purchases", "purchases:delete", deletePurchase);
}

export async function removePurchaseReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runReceiptRemove(formData, "/purchases", "purchases:receipt", (id, v, receiptId, user) => removeReceipt("purchase", id, v, receiptId, user));
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { FORBIDDEN, errorState } from "@/lib/action-runner";
import { parseFormWithLists, type FormState } from "@/lib/form-state";
import { createUserSchema, resetPasswordSchema, userAccessSchema } from "@/lib/validation/schemas";
import { createUser, resetUserPassword, updateUserAccess } from "@/lib/repo/users";

/** Every user-management action re-checks admin rights on the server. */
async function requireAdminAction() {
  const actor = await requireUser();
  return actor.role === "admin" ? actor : null;
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminAction();
  if (!actor) return { message: FORBIDDEN };
  const parsed = parseFormWithLists(createUserSchema, formData, ["permissions"]);
  if (!parsed.ok) return parsed.state;
  try {
    await createUser(parsed.data, actor);
  } catch (err) {
    const { password: _p, confirmPassword: _c, ...values } = Object.fromEntries(
      [...formData.entries()].filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
    void _p;
    void _c;
    return errorState(err, { ...values, permissions: formData.getAll("permissions").join(",") });
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function updateAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminAction();
  if (!actor) return { message: FORBIDDEN };
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version"));
  const parsed = parseFormWithLists(userAccessSchema, formData, ["permissions"]);
  if (!parsed.ok) return parsed.state;
  try {
    await updateUserAccess(id, Number.isInteger(version) ? version : -1, parsed.data, actor);
  } catch (err) {
    return errorState(err, {});
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminAction();
  if (!actor) return { message: FORBIDDEN };
  const parsed = parseFormWithLists(resetPasswordSchema, formData, []);
  if (!parsed.ok) return parsed.state;
  try {
    await resetUserPassword(String(formData.get("id") ?? ""), parsed.data.password, actor);
  } catch (err) {
    return errorState(err, {});
  }
  return { success: "Password reset. The user has been signed out everywhere and must use the new password." };
}

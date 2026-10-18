"use server";

import { requireUser } from "@/lib/auth/dal";
import { createSession } from "@/lib/auth/session";
import { errorState } from "@/lib/action-runner";
import { parseFormWithLists, type FormState } from "@/lib/form-state";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { changeOwnPassword } from "@/lib/repo/users";

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseFormWithLists(changePasswordSchema, formData, []);
  if (!parsed.ok) return parsed.state;
  try {
    const tokenVersion = await changeOwnPassword(user, parsed.data.currentPassword, parsed.data.password);
    // Other devices are signed out; keep this one signed in with a fresh token.
    await createSession({ sub: user.id, username: user.username, tv: tokenVersion });
  } catch (err) {
    return errorState(err, {});
  }
  return { success: "Password changed. You have been signed out on all other devices." };
}

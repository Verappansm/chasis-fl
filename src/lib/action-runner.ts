import "server-only";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { can, type Permission } from "@/lib/permissions";
import { parseForm, rawValues, type FormState } from "@/lib/form-state";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/repo/errors";

export function errorState(err: unknown, values: Record<string, string>): FormState {
  if (err instanceof ValidationError) {
    return { message: err.message, fieldErrors: { [err.field]: [err.message] }, values };
  }
  if (err instanceof ConflictError || err instanceof NotFoundError) {
    return { message: err.message, values };
  }
  console.error("[action] unexpected error", err);
  return { message: "Something went wrong while saving. Please try again.", values };
}

function readIdAndVersion(formData: FormData): { id?: string; version: number } {
  const id = formData.get("id");
  const version = Number(formData.get("version"));
  return {
    id: typeof id === "string" && id ? id : undefined,
    version: Number.isInteger(version) ? version : -1,
  };
}

function done(basePath: string, flag: "saved" | "deleted"): never {
  revalidatePath(basePath);
  revalidatePath("/overview");
  redirect(`${basePath}?${flag}=1`);
}

export const FORBIDDEN = "You do not have permission to do this. Ask an admin for access.";

/**
 * Create when the form has no id, update (with optimistic concurrency) when it
 * does. `permission` is checked on the server for every call.
 */
export async function runSave<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  basePath: string,
  permission: Permission,
  handlers: {
    create: (data: z.output<S>, user: CurrentUser) => Promise<string>;
    update: (id: string, version: number, data: z.output<S>, user: CurrentUser) => Promise<void>;
  },
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, permission)) return { message: FORBIDDEN, values: rawValues(formData) };
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return parsed.state;

  const { id, version } = readIdAndVersion(formData);
  try {
    if (id) await handlers.update(id, version, parsed.data, user);
    else await handlers.create(parsed.data, user);
  } catch (err) {
    return errorState(err, rawValues(formData));
  }
  done(basePath, "saved");
}

export async function runDelete(
  formData: FormData,
  basePath: string,
  permission: Permission,
  remove: (id: string, version: number, user: CurrentUser) => Promise<void>,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, permission)) return { message: FORBIDDEN };
  const { id, version } = readIdAndVersion(formData);
  if (!id) return { message: "Missing record id." };
  try {
    await remove(id, version, user);
  } catch (err) {
    return errorState(err, {});
  }
  done(basePath, "deleted");
}

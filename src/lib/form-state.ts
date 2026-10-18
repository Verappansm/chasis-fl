import type { z } from "zod";

/** State shape shared by every form + server action pair (useActionState). */
export interface FormState {
  message?: string;
  /** Shown in green; used by forms that stay on the page after saving. */
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** The submitted raw values, so the form re-renders with what the user typed. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export function rawValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; state: FormState };

export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): ParseResult<z.output<S>> {
  const values = rawValues(formData);
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    ok: false,
    state: { message: "Please correct the highlighted fields.", fieldErrors, values },
  };
}

/**
 * Like parseForm, but multi-value checkbox groups (e.g. `permissions`) are
 * read with getAll(). Echoed values join them with commas.
 */
export function parseFormWithLists<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  listFields: string[],
): ParseResult<z.output<S>> {
  const values = rawValues(formData);
  const input: Record<string, unknown> = { ...values };
  for (const name of listFields) {
    const list = formData.getAll(name).filter((v): v is string => typeof v === "string");
    input[name] = list;
    values[name] = list.join(",");
  }
  // Never echo passwords back to the browser.
  for (const k of Object.keys(values)) if (/password/i.test(k)) delete values[k];

  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, state: { message: "Please correct the highlighted fields.", fieldErrors, values } };
}

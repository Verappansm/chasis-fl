"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { initialFormState, type FormState } from "@/lib/form-state";
import { buttonStyles } from "./ui";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "chassis" | "money" | "date" | "checkbox" | "select" | "textarea";
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Field is only enabled while this checkbox is ticked (disabled inputs are not submitted). */
  enabledBy?: string;
  /** Span both grid columns. */
  wide?: boolean;
  maxLength?: number;
  /** Cannot be edited once the record exists. */
  immutable?: boolean;
};

export type SectionDef = { title: string; description?: string; fields: FieldDef[] };

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-400 read-only:bg-slate-50 aria-[invalid=true]:border-red-400";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonStyles.primary}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function RecordForm({
  action,
  sections,
  initial,
  record,
  cancelHref,
  submitLabel,
  readOnly = false,
}: {
  action: Action;
  sections: SectionDef[];
  initial: Record<string, string>;
  /** Present when editing: id + version for optimistic concurrency. */
  record?: { id: string; version: number };
  cancelHref: string;
  submitLabel: string;
  /** View-only: every field disabled and no submit button. */
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const values = state.values ?? initial;
  // Remount the fields whenever the server echoes back new values, so
  // uncontrolled inputs (and checkbox-dependent state) pick them up.
  const formKey = state.values ? JSON.stringify(state.values) : "initial";

  return (
    <form action={formAction} noValidate className="space-y-6">
      {record && (
        <>
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="version" value={record.version} />
        </>
      )}

      {state.message && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {readOnly && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          You have view-only access to this record.
        </p>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <Fields key={formKey} sections={sections} values={values} errors={state.fieldErrors} editing={Boolean(record)} />
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <Link href={cancelHref} className={buttonStyles.secondary}>
          {readOnly ? "Back" : "Cancel"}
        </Link>
        {!readOnly && <SubmitButton label={submitLabel} />}
      </div>
    </form>
  );
}

function Fields({
  sections,
  values,
  errors,
  editing,
}: {
  sections: SectionDef[];
  values: Record<string, string>;
  errors?: Record<string, string[] | undefined>;
  editing: boolean;
}) {
  const checkboxNames = sections.flatMap((s) => s.fields.filter((f) => f.type === "checkbox").map((f) => f.name));
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checkboxNames.map((n) => [n, values[n] === "on" || values[n] === "true"])),
  );

  return (
    <>
      {sections.map((section) => (
        <fieldset key={section.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <legend className="sr-only">{section.title}</legend>
          <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
          {section.description && <p className="mt-1 text-sm text-slate-500">{section.description}</p>}
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {section.fields.map((field) => {
              const error = errors?.[field.name]?.[0];
              const disabled = field.enabledBy ? !checked[field.enabledBy] : false;
              return (
                <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
                  <FieldInput
                    field={field}
                    value={values[field.name] ?? ""}
                    error={error}
                    disabled={disabled}
                    readOnly={Boolean(field.immutable && editing)}
                    checked={checked[field.name]}
                    onCheckedChange={(v) => setChecked((c) => ({ ...c, [field.name]: v }))}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  readOnly,
  checked,
  onCheckedChange,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  disabled: boolean;
  readOnly: boolean;
  checked?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = `f-${field.name}`;
  const describedBy = [error && `${id}-error`, field.hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: field.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    disabled,
  } as const;

  if (field.type === "checkbox") {
    return (
      <div>
        <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <input
            {...common}
            type="checkbox"
            defaultChecked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-slate-800">{field.label}</span>
        </label>
        <Messages id={id} error={error} hint={field.hint} />
      </div>
    );
  }

  let control;
  switch (field.type) {
    case "select":
      control = (
        <select {...common} defaultValue={value} required={field.required} className={inputClass}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "textarea":
      control = (
        <textarea {...common} defaultValue={value} rows={3} maxLength={field.maxLength ?? 1000} className={inputClass} />
      );
      break;
    case "money":
      control = (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">₹</span>
          <input
            {...common}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={value}
            required={field.required}
            placeholder="0.00"
            className={`${inputClass} pl-7 tabular-nums`}
          />
        </div>
      );
      break;
    case "date":
      control = (
        <input
          {...common}
          type="date"
          min="2000-01-01"
          defaultValue={disabled ? "" : value}
          required={field.required}
          className={inputClass}
        />
      );
      break;
    case "chassis":
      control = (
        <input
          {...common}
          type="text"
          autoComplete="off"
          spellCheck={false}
          defaultValue={value}
          required
          readOnly={readOnly}
          maxLength={24}
          placeholder="e.g. MA3EWDE1S00123456"
          className={`${inputClass} font-mono uppercase`}
        />
      );
      break;
    default:
      control = (
        <input
          {...common}
          type="text"
          defaultValue={value}
          required={field.required}
          maxLength={field.maxLength ?? 120}
          className={inputClass}
        />
      );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {control}
      <Messages id={id} error={error} hint={readOnly ? "Cannot be changed after creation." : field.hint} />
    </div>
  );
}

function Messages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
        {hint}
      </p>
    );
  }
  return null;
}

/** Delete with confirmation; carries the version so stale deletes are rejected. */
export function DeleteForm({
  action,
  id,
  version,
  what,
}: {
  action: Action;
  id: string;
  version: number;
  what: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Delete this ${what}? This cannot be undone.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" disabled={pending} className={buttonStyles.danger}>
        {pending ? "Deleting…" : `Delete ${what}`}
      </button>
      {state.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

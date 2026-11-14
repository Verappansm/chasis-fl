"use client";

import { useActionState, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { initialFormState, type FormState } from "@/lib/form-state";
import { DEFAULT_RATES, FORMULAS, type FormulaContext, type FormulaKey } from "@/lib/calc";
import { choicesFor, type OptionListKey, type OptionLists } from "@/lib/options";
import { buttonStyles } from "./ui";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "code" | "number" | "chassis" | "money" | "date" | "checkbox" | "select" | "textarea" | "computed";
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
  /** `computed` fields: read-only, recalculated live from the other fields. */
  formula?: FormulaKey;
  /** Only shown (and submitted) while another field has one of these values. */
  showWhen?: ShowWhen;
  /** Text field whose choices an admin manages (drop-down or free text with suggestions). */
  list?: OptionListKey;
};

/** Case-insensitive, so a typed "Demo" counts as "demo". */
export type ShowWhen = { field: string; in?: string[]; notIn?: string[] };
export type SectionDef = { title: string; description?: string; fields: FieldDef[]; showWhen?: ShowWhen };

function visible(rule: ShowWhen | undefined, live: Record<string, string>) {
  if (!rule) return true;
  const v = (live[rule.field] ?? "").trim().toLowerCase();
  if (rule.in && !rule.in.includes(v)) return false;
  if (rule.notIn && rule.notIn.includes(v)) return false;
  return true;
}

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
  context = DEFAULT_RATES,
  readOnlyFields = [],
  readOnlyNote = "You have view-only access to this record.",
  lists,
  hidden,
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
  /** Rates used by computed fields. */
  context?: FormulaContext;
  /** Fields shown but not editable (still submitted), e.g. a pre-selected deal. */
  readOnlyFields?: string[];
  readOnlyNote?: string;
  /** Admin option lists, for fields with `list`. */
  lists?: OptionLists;
  /** Extra hidden inputs (e.g. where to return after saving). */
  hidden?: Record<string, string>;
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
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}

      {state.message && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {readOnly && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          {readOnlyNote}
        </p>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <Fields
          key={formKey}
          sections={sections}
          values={values}
          errors={state.fieldErrors}
          editing={Boolean(record)}
          context={context}
          readOnlyFields={readOnlyFields}
          lists={lists}
        />
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
  context,
  readOnlyFields,
  lists,
}: {
  sections: SectionDef[];
  values: Record<string, string>;
  errors?: Record<string, string[] | undefined>;
  editing: boolean;
  context: FormulaContext;
  readOnlyFields: string[];
  lists?: OptionLists;
}) {
  // Live copy of every value, for computed fields and show/enable rules.
  const [live, setLive] = useState<Record<string, string>>(values);
  const onChange = (e: FormEvent<HTMLDivElement>) => {
    const t = e.target as HTMLInputElement;
    if (!t.name) return;
    setLive((l) => ({ ...l, [t.name]: t.type === "checkbox" ? (t.checked ? "on" : "") : t.value }));
  };

  return (
    <div className="space-y-6" onChange={onChange}>
      {sections.filter((s) => visible(s.showWhen, live)).map((section) => (
        <fieldset key={section.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <legend className="sr-only">{section.title}</legend>
          <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
          {section.description && <p className="mt-1 text-sm text-slate-500">{section.description}</p>}
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {section.fields.filter((f) => visible(f.showWhen, live)).map((field) => {
              const error = errors?.[field.name]?.[0];
              const disabled = field.enabledBy ? live[field.enabledBy] !== "on" : false;
              return (
                <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
                  {field.type === "computed" ? (
                    <Computed field={field} text={field.formula ? FORMULAS[field.formula](live, context) : "—"} />
                  ) : (
                    <FieldInput
                      field={field}
                      value={live[field.name] ?? ""}
                      error={error}
                      disabled={disabled}
                      readOnly={Boolean(field.immutable && editing) || readOnlyFields.includes(field.name)}
                      checked={live[field.name] === "on" || live[field.name] === "true"}
                      lists={lists}
                      initialValue={values[field.name] ?? ""}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function Computed({ field, text }: { field: FieldDef; text: string }) {
  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</p>
      <output className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium tabular-nums text-slate-900">
        {text}
      </output>
      {field.hint && <p className="mt-1.5 text-xs text-slate-500">{field.hint}</p>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  readOnly,
  checked,
  lists,
  initialValue,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  disabled: boolean;
  readOnly: boolean;
  checked?: boolean;
  lists?: OptionLists;
  /** The record's saved value: always offered, even if no longer on the list. */
  initialValue: string;
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
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-slate-800">{field.label}</span>
        </label>
        <Messages id={id} error={error} hint={field.hint} />
      </div>
    );
  }

  let control;
  const list = field.list && lists ? lists[field.list] : undefined;
  if (field.list && list) {
    const choices = choicesFor(field.list, list);
    if (initialValue && !choices.some((c) => c.value.toLowerCase() === initialValue.toLowerCase())) {
      choices.push({ value: initialValue, label: `${initialValue} (not on the list)` });
    }
    if (list.mode === "dropdown") {
      control = (
        <select {...common} defaultValue={value} required={field.required} disabled={disabled || readOnly} className={inputClass}>
          <option value="">Select…</option>
          {choices.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      // A disabled select is not submitted; keep the value for read-only fields.
      if (readOnly) control = <>{control}<input type="hidden" name={field.name} value={value} /></>;
    } else {
      const label = choices.find((c) => c.value === value)?.label;
      control = (
        <>
          <input
            {...common}
            type="text"
            list={`${id}-list`}
            autoComplete="off"
            defaultValue={label && !label.endsWith("(not on the list)") ? label : value}
            required={field.required}
            readOnly={readOnly}
            maxLength={field.maxLength ?? 120}
            className={inputClass}
          />
          <datalist id={`${id}-list`}>
            {choices.map((o) => (
              <option key={o.value} value={o.label} />
            ))}
          </datalist>
        </>
      );
    }
  }
  if (!control) switch (field.type) {
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
    case "code":
      control = (
        <input
          {...common}
          type="text"
          autoComplete="off"
          spellCheck={false}
          defaultValue={value}
          required={field.required}
          readOnly={readOnly}
          maxLength={field.maxLength ?? 40}
          className={`${inputClass} font-mono uppercase`}
        />
      );
      break;
    case "number":
      control = (
        <input
          {...common}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={value}
          required={field.required}
          maxLength={field.maxLength ?? 6}
          className={`${inputClass} tabular-nums`}
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
          readOnly={readOnly}
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

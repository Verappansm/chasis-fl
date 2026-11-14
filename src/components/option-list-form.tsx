"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/form-state";
import type { OptionMode } from "@/lib/options";
import { buttonStyles } from "./ui";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonStyles.primary}>
      {pending ? "Saving…" : "Save list"}
    </button>
  );
}

/** One admin-managed list: text box ↔ drop-down toggle, and the options (one per line). */
export function OptionListForm({
  action,
  listKey,
  label,
  usedIn,
  mode,
  options,
  version,
  fixed = [],
  used = [],
}: {
  action: Action;
  listKey: string;
  label: string;
  usedIn: string;
  mode: OptionMode;
  options: string[];
  version: number;
  /** Always available, cannot be removed (built-in types). */
  fixed?: string[];
  /** Values already in the records, offered as a quick add. */
  used?: string[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [current, setCurrent] = useState<OptionMode>((state.values?.mode as OptionMode) ?? mode);
  const [text, setText] = useState(state.values?.options ?? options.join("\n"));
  const listed = new Set(text.split("\n").map((o) => o.trim().toLowerCase()).filter(Boolean));
  const missing = used.filter((u) => !listed.has(u.toLowerCase()) && !fixed.some((f) => f.toLowerCase() === u.toLowerCase()));

  return (
    <form action={formAction} noValidate className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="key" value={listKey} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="mode" value={current} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
          <p className="text-xs text-slate-500">{usedIn}</p>
        </div>
        <div role="radiogroup" aria-label={`${label}: how employees enter it`} className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {(["text", "dropdown"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={current === m}
              onClick={() => setCurrent(m)}
              className={`rounded-md px-3 py-1.5 transition ${current === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {m === "text" ? "Text box" : "Drop-down"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {current === "dropdown"
          ? "Employees must pick one of these options."
          : "Employees type freely; these options are suggested as they type."}
      </p>
      {fixed.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          Always available:
          {fixed.map((f) => (
            <span key={f} className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              {f}
            </span>
          ))}
        </p>
      )}
      <label htmlFor={`opt-${listKey}`} className="mt-3 block text-xs font-medium text-slate-700">
        {fixed.length ? "Extra options" : "Options"} (one per line)
      </label>
      <textarea
        id={`opt-${listKey}`}
        name="options"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={state.fieldErrors?.options ? true : undefined}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-[invalid=true]:border-red-400"
      />
      {missing.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          In use but not listed: {missing.slice(0, 12).join(", ")}
          {missing.length > 12 && ` and ${missing.length - 12} more`}.{" "}
          <button
            type="button"
            className="font-medium text-indigo-700 hover:underline"
            onClick={() => setText((t) => [t.trim(), ...missing].filter(Boolean).join("\n"))}
          >
            Add all
          </button>
        </p>
      )}
      {(state.message || state.success) && (
        <p role={state.message ? "alert" : "status"} className={`mt-3 text-sm ${state.message ? "text-red-700" : "text-emerald-700"}`}>
          {state.message ?? state.success}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Save />
      </div>
    </form>
  );
}

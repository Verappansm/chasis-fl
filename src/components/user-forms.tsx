"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  MODULES,
  PERMISSION_PRESETS,
  ROLES,
  ROLE_LABELS,
  normalizePermissions,
  type Permission,
  type Role,
} from "@/lib/permissions";
import { buttonStyles } from "./ui";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400";

/* ------------------------------------------------------------ primitives */

function Alerts({ state }: { state: FormState }) {
  return (
    <>
      {state.message && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      )}
      {state.success && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.success}
        </div>
      )}
    </>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

function PasswordInput({ name, autoComplete, error }: { name: string; autoComplete: string; error?: string }) {
  return (
    <input
      id={`f-${name}`}
      name={name}
      type="password"
      autoComplete={autoComplete}
      required
      maxLength={128}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `f-${name}-error` : undefined}
      className={inputClass}
    />
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------ permission matrix */

const ACTIONS = [
  { key: "view", label: "View" },
  { key: "edit", label: "Create & edit" },
  { key: "delete", label: "Delete" },
] as const;

const ROWS: { key: string; label: string; actions: readonly ("view" | "edit" | "delete")[] }[] = [
  { key: "overview", label: "Overview dashboard", actions: ["view"] },
  ...MODULES.map((m) => ({ key: m.key, label: m.label, actions: ["view", "edit", "delete"] as const })),
];

function PermissionMatrix({
  value,
  onChange,
  disabled,
  error,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled: boolean;
  error?: string;
}) {
  const set = new Set(value);
  const toggle = (perm: Permission, on: boolean) => {
    const next = new Set(set);
    const [mod, action] = perm.split(":");
    if (on) next.add(perm);
    else {
      next.delete(perm);
      // Removing view removes everything that depends on it.
      if (action === "view") for (const a of ["edit", "delete"]) next.delete(`${mod}:${a}` as Permission);
    }
    onChange(normalizePermissions([...next]));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Quick fill:</span>
        {PERMISSION_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.permissions)}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Area</th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="px-4 py-2.5 text-center">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{row.label}</td>
                {ACTIONS.map((a) => {
                  if (!row.actions.includes(a.key)) return <td key={a.key} />;
                  const perm = `${row.key}:${a.key}` as Permission;
                  return (
                    <td key={a.key} className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={perm}
                        checked={disabled || set.has(perm)}
                        disabled={disabled}
                        onChange={(e) => toggle(perm, e.target.checked)}
                        aria-label={`${row.label}: ${a.label}`}
                        className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {disabled ? "Admins always have full access, including user management." : "Create & edit and Delete automatically include View."}
      </p>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <select
      id="f-role"
      name="role"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className={inputClass}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function SubmitRow({ cancelHref, pending, label }: { cancelHref?: string; pending: boolean; label: string }) {
  return (
    <div className="flex items-center justify-end gap-3">
      {cancelHref && (
        <Link href={cancelHref} className={buttonStyles.secondary}>
          Cancel
        </Link>
      )}
      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- forms */

export function CreateUserForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [role, setRole] = useState<Role>("user");
  const [permissions, setPermissions] = useState<Permission[]>(PERMISSION_PRESETS[0].permissions);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <Alerts state={state} />
      <Panel title="Account">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="f-username" label="Username" error={e("username")} hint="Lowercase; used to sign in.">
            <input
              id="f-username"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={32}
              defaultValue={state.values?.username}
              aria-invalid={e("username") ? true : undefined}
              className={inputClass}
            />
          </Field>
          <Field id="f-role" label="Role" error={e("role")}>
            <RoleSelect value={role} onChange={setRole} />
          </Field>
          <Field id="f-password" label="Password" error={e("password")} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput name="password" autoComplete="new-password" error={e("password")} />
          </Field>
          <Field id="f-confirmPassword" label="Confirm password" error={e("confirmPassword")}>
            <PasswordInput name="confirmPassword" autoComplete="new-password" error={e("confirmPassword")} />
          </Field>
        </div>
      </Panel>
      <Panel title="Permissions" description="What this user can see and change.">
        <PermissionMatrix value={permissions} onChange={setPermissions} disabled={role === "admin"} error={e("permissions")} />
      </Panel>
      <SubmitRow cancelHref="/admin/users" pending={pending} label="Create user" />
    </form>
  );
}

export interface EditableUser {
  id: string;
  version: number;
  username: string;
  role: Role;
  active: boolean;
  permissions: Permission[];
}

export function AccessForm({ action, user, isSelf }: { action: Action; user: EditableUser; isSelf: boolean }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [permissions, setPermissions] = useState<Permission[]>(user.permissions);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="version" value={user.version} />
      {/* Disabled controls are not submitted; send the unchanged values explicitly. */}
      {isSelf && (
        <>
          <input type="hidden" name="role" value={user.role} />
          <input type="hidden" name="active" value="on" />
        </>
      )}
      <Alerts state={state} />
      <Panel title="Role & status">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="f-role" label="Role" error={e("role")} hint={isSelf ? "You cannot change your own role." : undefined}>
            <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
          </Field>
          <Field id="f-active" label="Status" error={e("active")} hint={isSelf ? "You cannot deactivate yourself." : undefined}>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <input
                id="f-active"
                type="checkbox"
                name={isSelf ? undefined : "active"}
                checked={active}
                disabled={isSelf}
                onChange={(ev) => setActive(ev.target.checked)}
                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-800">{active ? "Active, can sign in" : "Deactivated, cannot sign in"}</span>
            </label>
          </Field>
        </div>
      </Panel>
      <Panel title="Permissions">
        <PermissionMatrix value={permissions} onChange={setPermissions} disabled={role === "admin"} error={e("permissions")} />
      </Panel>
      <SubmitRow cancelHref="/admin/users" pending={pending} label="Save access" />
    </form>
  );
}

export function ResetPasswordForm({ action, id }: { action: Action; id: string }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Alerts state={state} />
      <Panel title="Reset password" description="Sets a new password and signs the user out of every device.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="f-password" label="New password" error={e("password")} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput name="password" autoComplete="new-password" error={e("password")} />
          </Field>
          <Field id="f-confirmPassword" label="Confirm new password" error={e("confirmPassword")}>
            <PasswordInput name="confirmPassword" autoComplete="new-password" error={e("confirmPassword")} />
          </Field>
        </div>
      </Panel>
      <SubmitRow pending={pending} label="Reset password" />
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Alerts state={state} />
      <Panel title="Change password" description="You stay signed in here; other devices are signed out.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2 sm:max-w-sm">
            <Field id="f-currentPassword" label="Current password" error={e("currentPassword")}>
              <PasswordInput name="currentPassword" autoComplete="current-password" error={e("currentPassword")} />
            </Field>
          </div>
          <Field id="f-password" label="New password" error={e("password")} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput name="password" autoComplete="new-password" error={e("password")} />
          </Field>
          <Field id="f-confirmPassword" label="Confirm new password" error={e("confirmPassword")}>
            <PasswordInput name="confirmPassword" autoComplete="new-password" error={e("confirmPassword")} />
          </Field>
        </div>
      </Panel>
      <SubmitRow pending={pending} label="Change password" />
    </form>
  );
}

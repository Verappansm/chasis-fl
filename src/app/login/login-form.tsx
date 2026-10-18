"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { initialFormState } from "@/lib/form-state";
import { buttonStyles } from "@/components/ui";

const input =
  "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          defaultValue={state.values?.username}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} className={input} />
      </div>
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

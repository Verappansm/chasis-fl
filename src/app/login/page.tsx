import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl bg-indigo-500 text-lg font-bold text-white">C</div>
          <h1 className="mt-4 text-xl font-semibold text-white">Chasis ERP</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to continue</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

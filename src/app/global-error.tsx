"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import "./globals.css";

/** Last-resort error page: replaces the root layout, so it brings its own document. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-900">
        <title>Something went wrong · Chasis ERP</title>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The app hit an unexpected error. Nothing you saved before this was lost. Try again, or sign in again if it keeps happening.
          </p>
          {digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {digest}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => retry()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Try again
            </button>
            <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Go to start
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}

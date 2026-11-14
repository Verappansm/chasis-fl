"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Shared body of the error boundaries. Server errors arrive with a digest, never the message. */
export function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert">
      <div className="mx-auto grid size-11 place-items-center rounded-full bg-amber-50 text-amber-600" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-6">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page could not be loaded. It is usually temporary (for example a network hiccup); try again. If it keeps happening, tell your admin
        the reference below.
      </p>
      {digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Go to start
        </Link>
      </div>
    </div>
  );
}

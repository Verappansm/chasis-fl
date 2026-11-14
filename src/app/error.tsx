"use client"; // Error boundaries must be Client Components

import { ErrorPanel } from "@/components/error-panel";

/** Errors outside the app shell (e.g. the sign-in page). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <ErrorPanel error={error} retry={retry} />
    </div>
  );
}

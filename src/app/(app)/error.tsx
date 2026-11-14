"use client"; // Error boundaries must be Client Components

import { ErrorPanel } from "@/components/error-panel";

/** Errors inside the app keep the sidebar; only the page area shows the error. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}

import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/not-found-panel";

export const metadata: Metadata = { title: "Not found" };

/** Unknown URLs. Signed-out visitors never get here: the proxy sends them to sign in first. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <NotFoundPanel />
    </div>
  );
}

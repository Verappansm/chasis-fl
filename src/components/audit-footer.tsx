import { formatDateTime } from "@/lib/format";
import type { AuditFields } from "@/lib/types";

export function AuditFooter({ doc }: { doc: AuditFields }) {
  return (
    <p className="mt-6 text-xs text-slate-400">
      Created {formatDateTime(doc.createdAt)} by {doc.createdBy} · Last updated {formatDateTime(doc.updatedAt)} by{" "}
      {doc.updatedBy} · Revision {doc.version}
    </p>
  );
}

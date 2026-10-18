import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { can, type Permission } from "@/lib/permissions";

/**
 * Renders children only for users holding `permission`. UI convenience only:
 * the server actions and pages enforce the same permission independently.
 */
export function IfCan({ permission, children }: { permission: Permission | "admin"; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate permission={permission}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ permission, children }: { permission: Permission | "admin"; children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const allowed = permission === "admin" ? user.role === "admin" : can(user, permission);
  return allowed ? children : null;
}

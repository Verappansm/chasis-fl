import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/repo/users";
import { formatDateTime } from "@/lib/format";
import { MODULES, ROLE_LABELS, effectivePermissions, type Permission } from "@/lib/permissions";
import { Badge, Card, DataTable, Flash, LinkButton, PageHeader, TableSkeleton, Td, Th, one } from "@/components/ui";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader
        title="Users & access"
        description="Who can sign in, and what each person can see and change."
        action={<LinkButton href="/admin/users/new">New user</LinkButton>}
      />
      <Suspense fallback={<TableSkeleton />}>
        <UserList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** e.g. "Overview · Finance (V E D) · Insurance (V)". */
function AccessSummary({ permissions }: { permissions: Permission[] }) {
  const parts: string[] = [];
  if (permissions.includes("overview:view")) parts.push("Overview");
  for (const m of MODULES) {
    const flags = [
      permissions.includes(`${m.key}:view`) && "V",
      permissions.includes(`${m.key}:edit`) && "E",
      permissions.includes(`${m.key}:delete`) && "D",
    ].filter(Boolean);
    if (flags.length) parts.push(`${m.label} (${flags.join(" ")})`);
  }
  return <span className="text-slate-600">{parts.length ? parts.join(" · ") : "No access"}</span>;
}

async function UserList({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const users = await listUsers();

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} />
      <Card tour="users-list">
        <DataTable
          head={
            <>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Access</Th>
              <Th>Last sign-in</Th>
            </>
          }
        >
          {users.map((u) => {
            const role = u.role === "admin" ? "admin" : "user";
            return (
              <tr key={u._id.toHexString()} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/admin/users/${u._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {u.username}
                  </Link>
                  {u._id.toHexString() === me.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </Td>
                <Td>
                  <Badge tone={role === "admin" ? "indigo" : "slate"}>{ROLE_LABELS[role]}</Badge>
                </Td>
                <Td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</Td>
                <Td>
                  {role === "admin" ? (
                    <span className="text-slate-600">Full access + user management</span>
                  ) : (
                    <AccessSummary permissions={effectivePermissions(role, u.permissions)} />
                  )}
                </Td>
                <Td>{formatDateTime(u.lastLoginAt)}</Td>
              </tr>
            );
          })}
        </DataTable>
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          V = view · E = create &amp; edit · D = delete. Users are deactivated rather than deleted so the audit trail stays intact.
        </div>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/repo/users";
import { formatDateTime } from "@/lib/format";
import { MODULES, ROLE_LABELS, effectivePermissions, type Permission } from "@/lib/permissions";
import {
  Badge,
  Card,
  DataTable,
  Flash,
  LinkButton,
  PageHeader,
  TableSkeleton,
  Td,
  Th,
  one,
  rowClass,
} from "@/components/ui";

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

const FLAG: Record<string, string> = { view: "V", invoice: "I", receipt: "R", edit: "E", delete: "D" };

/** e.g. "Overview · Purchase (V I R) · Finance payout (V)". */
function AccessSummary({ permissions }: { permissions: Permission[] }) {
  const parts: string[] = [];
  if (permissions.includes("overview:view")) parts.push("Overview");
  for (const m of MODULES) {
    const flags = (m.actions as readonly string[]).filter((a) => (permissions as string[]).includes(`${m.key}:${a}`)).map((a) => FLAG[a]);
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
          stack="lg"
          head={
            <>
              <Th>User</Th>
              <Th>Status</Th>
              <Th className="w-1/2">Access</Th>
              <Th>Last sign-in</Th>
            </>
          }
        >
          {users.map((u) => {
            const role = u.role === "admin" ? "admin" : "user";
            return (
              <tr key={u._id.toHexString()} className={rowClass}>
                <Td primary>
                  <Link href={`/admin/users/${u._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {u.username}
                  </Link>
                  {u._id.toHexString() === me.id && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                  <span className="mt-1 block">
                    <Badge tone={role === "admin" ? "indigo" : "slate"}>{ROLE_LABELS[role]}</Badge>
                  </span>
                </Td>
                <Td label="Status">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</Td>
                <Td label="Access" wide>
                  {role === "admin" ? (
                    <span className="text-slate-600">Full access + user management</span>
                  ) : (
                    <AccessSummary permissions={effectivePermissions(role, u.permissions)} />
                  )}
                </Td>
                <Td label="Last sign-in">{formatDateTime(u.lastLoginAt)}</Td>
              </tr>
            );
          })}
        </DataTable>
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          V = view · I = invoice (create &amp; edit up to invoice) · R = receipt · E = create &amp; edit · D = delete. Users are deactivated rather than deleted so the audit trail stays intact.
        </div>
      </Card>
    </>
  );
}

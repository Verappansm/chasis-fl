import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { can } from "@/lib/permissions";
import { listRenewals, upcomingExpiries, type RenewalFilter } from "@/lib/repo/modules";
import { dateToInput, formatDate, formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/validation/fields";
import { RENEWAL_STATUSES, RENEWAL_STATUS_LABELS, type RenewalStatus } from "@/lib/types";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Flash,
  LinkButton,
  ListToolbar,
  PageHeader,
  Pagination,
  TableSkeleton,
  Td,
  Th,
  buttonStyles,
  one,
} from "@/components/ui";

export const metadata: Metadata = { title: "Renewal" };

const STATUSES = [
  { value: "open", label: "Open" },
  ...RENEWAL_STATUSES.map((s) => ({ value: s, label: RENEWAL_STATUS_LABELS[s] })),
  { value: "all", label: "All" },
];

const STATUS_TONE: Record<RenewalStatus, "amber" | "indigo" | "green" | "slate"> = {
  due: "amber",
  contacted: "indigo",
  renewed: "green",
  lost: "slate",
};

export default function RenewalsPage({ searchParams }: PageProps<"/renewals">) {
  return (
    <>
      <PageHeader
        title="Renewal"
        description="Insurance renewal follow-ups, so recurring commission is not lost to competitors."
        action={
          <IfCan permission="renewals:edit">
            <LinkButton href="/renewals/new">New renewal case</LinkButton>
          </IfCan>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <Expiring />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RenewalList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Expiring() {
  const user = await requirePermission("renewals:view");
  const canEdit = can(user, "renewals:edit");
  const policies = await upcomingExpiries(45);
  if (!policies.length) return null;
  return (
    <Card className="mb-6 border-amber-200">
      <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Policies expiring soon without a renewal case</h2>
        <p className="text-xs text-amber-800">Expiring within 45 days (or lapsed in the last 15) and not yet followed up.</p>
      </div>
      <DataTable
        head={
          <>
            <Th>Chassis</Th>
            <Th>Provider</Th>
            <Th>Policy</Th>
            <Th right>Premium</Th>
            <Th>Expires</Th>
            <Th />
          </>
        }
      >
        {policies.map((p) => {
          const lapsed = dateToInput(p.policyEndDate) < todayIso();
          const sp = new URLSearchParams({ chassis: p.chassisNumber, due: dateToInput(p.policyEndDate) });
          return (
            <tr key={p._id.toHexString()}>
              <Td mono>{p.chassisNumber}</Td>
              <Td>{p.provider}</Td>
              <Td>{p.policyNumber ?? "—"}</Td>
              <Td right>{formatMoney(p.premiumAmount)}</Td>
              <Td>
                <Badge tone={lapsed ? "red" : "amber"}>
                  {lapsed ? "Lapsed" : "Due"} {formatDate(p.policyEndDate)}
                </Badge>
              </Td>
              <Td right>
                {canEdit && (
                  <Link href={`/renewals/new?${sp.toString()}`} className={buttonStyles.secondary}>
                    Start follow-up
                  </Link>
                )}
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </Card>
  );
}

async function RenewalList({ searchParams }: { searchParams: PageProps<"/renewals">["searchParams"] }) {
  await requirePermission("renewals:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const statusRaw = one(sp.status) ?? "open";
  const status = (STATUSES.some((s) => s.value === statusRaw) ? statusRaw : "open") as RenewalFilter;
  const page = Number(one(sp.page) ?? 1);
  const result = await listRenewals({ q, status, page });
  const today = todayIso();

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card>
        <ListToolbar basePath="/renewals" q={q} status={status} statuses={STATUSES} placeholder="Search chassis or notes" />
        {result.items.length === 0 ? (
          <EmptyState title="No renewal cases found" />
        ) : (
          <DataTable
            head={
              <>
                <Th>Chassis</Th>
                <Th>Due date</Th>
                <Th>Status</Th>
                <Th>Next follow-up</Th>
                <Th>Notes</Th>
              </>
            }
          >
            {result.items.map((doc) => {
              const open = doc.status === "due" || doc.status === "contacted";
              const overdue = open && dateToInput(doc.dueDate) < today;
              return (
                <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                  <Td mono>
                    <Link href={`/renewals/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                      {doc.chassisNumber}
                    </Link>
                  </Td>
                  <Td>
                    <span className={overdue ? "font-medium text-red-600" : ""}>{formatDate(doc.dueDate)}</span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[doc.status]}>{RENEWAL_STATUS_LABELS[doc.status]}</Badge>
                  </Td>
                  <Td>{formatDate(doc.followUpDate)}</Td>
                  <Td>
                    <span className="block max-w-xs truncate">{doc.notes ?? "—"}</span>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <Pagination basePath="/renewals" page={result.page} pageCount={result.pageCount} total={result.total} params={{ q, status }} />
      </Card>
    </>
  );
}

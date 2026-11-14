import Link from "next/link";
import type { ClaimFields } from "@/lib/types";
import { CLAIM_STAGES, CLAIM_STAGE_LABELS } from "@/lib/types";
import { PERIODS } from "@/lib/periods";
import { daysSince, dateToInput, formatMoney } from "@/lib/format";
import type { Deal, payoutsForDeal } from "@/lib/repo/modules";
import { AGEING_DAYS, receiptLines } from "@/lib/repo/modules";
import { percentOf } from "@/lib/calc";
import { Badge, Card, DataTable, LinkButton, Td, Th, buttonStyles } from "./ui";
import { DateText } from "./date-text";

export const STAGE_OPTIONS = [
  { value: "all", label: "All" },
  ...CLAIM_STAGES.map((s) => ({ value: s, label: CLAIM_STAGE_LABELS[s] })),
] as const;

/** Lists default to all time; the overview defaults to this month. */
export const LIST_PERIOD_OPTIONS = [PERIODS[3], PERIODS[0], PERIODS[1], PERIODS[2]] as const;

/** Where a receivable stands, with ageing on unpaid invoices. */
export function StageBadge({ claim }: { claim: Partial<ClaimFields> & { stage: ClaimFields["stage"] } }) {
  switch (claim.stage) {
    case "not_billed":
      return <Badge tone="amber">Not billed</Badge>;
    case "billed": {
      const age = claim.invoiceDate ? daysSince(claim.invoiceDate) : 0;
      return <Badge tone={age > AGEING_DAYS ? "red" : "indigo"}>Billed · {age}d</Badge>;
    }
    case "collected":
      return <Badge tone="green">Collected</Badge>;
    case "short_paid":
      return <Badge tone="red">Short-paid · {formatMoney(claim.balance)}</Badge>;
    default:
      return <span className="text-slate-400">—</span>;
  }
}

/** Invoice / receipt numbers for a list row. */
export function ClaimRefs({ claim }: { claim: Partial<ClaimFields> }) {
  if (!claim.invoiceNo) return <span className="text-slate-400">—</span>;
  return (
    <span className="text-xs leading-5">
      <span className="font-mono">{claim.invoiceNo}</span> · <DateText iso={dateToInput(claim.invoiceDate)} />
      {claim.receiptNo && (
        <>
          <br />
          <span className="text-slate-500">Rcpt</span> <span className="font-mono">{claim.receiptNo}</span>
        </>
      )}
    </span>
  );
}

/** The sale a payout belongs to. */
export function DealCard({ deal }: { deal: Deal }) {
  const href = deal.kind === "purchase" ? `/purchases/${deal.id}` : `/preowned/${deal.id}`;
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{deal.label}</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            <Link href={href} className="text-indigo-700 hover:underline">
              {deal.ref}
            </Link>{" "}
            · {deal.model}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Chassis <span className="font-mono">{deal.chassisNumber}</span>
            {deal.customer && <> · Customer {deal.customer}</>}
            {deal.saleDate && (
              <>
                {" "}
                · Sold <DateText iso={dateToInput(deal.saleDate)} />
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Car value</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{formatMoney(deal.carValue)}</p>
          {!deal.sold && <Badge tone="red">Not sold yet</Badge>}
        </div>
      </div>
    </Card>
  );
}

type Payouts = Awaited<ReturnType<typeof payoutsForDeal>>;

/** Finance / insurance / renewal payouts recorded against one sale. */
export function DealPayouts({
  payouts,
  dealRef,
  sold,
  canAddFinance,
  canAddInsurance,
}: {
  payouts: Payouts;
  dealRef: string;
  sold: boolean;
  canAddFinance: boolean;
  canAddInsurance: boolean;
}) {
  const rows = [
    ...payouts.finance.map((p) => ({ p, kind: "Finance", href: `/finance/${p._id.toHexString()}` })),
    ...payouts.insurance.map((p) => ({ p, kind: "Insurance", href: `/insurance/${p._id.toHexString()}` })),
    ...payouts.renewals.map((p) => ({ p, kind: "Renewal", href: `/renewals/${p._id.toHexString()}` })),
  ];
  const ref = encodeURIComponent(dealRef);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Payouts on this sale</h2>
          <p className="text-xs text-slate-500">
            {sold ? `Finance, insurance and renewal payouts recorded against ${dealRef}.` : "Record the sale first; payouts need a sold car."}
          </p>
        </div>
        {sold && (
          <div className="flex flex-wrap gap-2">
            {canAddFinance && !payouts.finance.length && (
              <LinkButton variant="secondary" href={`/finance/new?deal=${ref}`}>
                Add finance payout
              </LinkButton>
            )}
            {canAddInsurance && !payouts.insurance.length && (
              <LinkButton variant="secondary" href={`/insurance/new?deal=${ref}`}>
                Add insurance payout
              </LinkButton>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">None yet.</p>
      ) : (
        <DataTable
          stack="md"
          head={
            <>
              <Th>Payout</Th>
              <Th>Provider</Th>
              <Th right>Total</Th>
              <Th>Status</Th>
            </>
          }
        >
          {rows.map(({ p, kind, href }) => (
            <tr key={p._id.toHexString()}>
              <Td primary>
                <Link href={href} className="font-medium text-indigo-700 hover:underline">
                  {kind}
                </Link>
              </Td>
              <Td label="Provider">{p.provider}</Td>
              <Td label="Total" right>{formatMoney(p.claimTotal)}</Td>
              <Td label="Status">
                <StageBadge claim={p} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

/** First step of a new payout: pick the sale by commission no / stock no (GET, no JavaScript needed). */
export function DealPicker({
  basePath,
  value,
  error,
  errorLink,
}: {
  basePath: string;
  value?: string;
  error?: string;
  errorLink?: { href: string; label: string };
}) {
  return (
    <Card className="p-6">
      <form action={basePath} method="get" className="max-w-md space-y-3">
        <label htmlFor="deal" className="block text-sm font-medium text-slate-700">
          Commission no, or pre-owned stock no (PO-…)
        </label>
        <div className="flex gap-2">
          <input
            id="deal"
            name="deal"
            defaultValue={value}
            required
            maxLength={40}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-[invalid=true]:border-red-400"
          />
          <button type="submit" className={buttonStyles.primary}>
            Continue
          </button>
        </div>
        {error ? (
          <p className="text-xs text-red-600">
            {error}
            {errorLink && (
              <>
                {" "}
                <Link href={errorLink.href} className="font-medium underline">
                  {errorLink.label}
                </Link>
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-slate-500">The car must be sold first.</p>
        )}
      </form>
    </Card>
  );
}

/** Props for the receipt panel, from a record with an invoice loop. */
export function receiptProps(doc: Partial<ClaimFields>) {
  return {
    claimTotal: doc.claimTotal ?? 0,
    expectedTds: percentOf(doc.claimAmount ?? 0, doc.tdsRateBp ?? 0),
    receipts: receiptLines(doc).map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      receiptDate: dateToInput(r.receiptDate),
      tdsAmount: r.tdsAmount,
      receivedAmount: r.receivedAmount,
      by: r.by,
    })),
    invoiceRaised: Boolean(doc.invoiceNo),
  };
}

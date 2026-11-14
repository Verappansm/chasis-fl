import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists, usedValues } from "@/lib/repo/options";
import { OPTION_LISTS } from "@/lib/options";
import { PURCHASE_TYPES, PURCHASE_TYPE_LABELS } from "@/lib/types";
import { RecordForm, type SectionDef } from "@/components/record-form";
import { OptionListForm } from "@/components/option-list-form";
import { Flash, PageHeader, TableSkeleton, one } from "@/components/ui";
import { bpToInput, formatPercent } from "@/lib/format";
import { saveOptionList, saveSettings } from "./actions";

export const metadata: Metadata = { title: "Constants" };

const pct = (name: string, label: string, hint: string) =>
  ({ name, label, type: "text", required: true, maxLength: 6, hint }) as const;

const KEEP = "Applies to records created from now on. Existing records keep the rate they were created with, so past invoices never change.";

const sections: SectionDef[] = [
  {
    title: "GST rates",
    description: `Every GST rate the app uses, in one place. ${KEEP}`,
    fields: [
      pct("purchaseGstRateBp", "Car purchase, petrol / diesel (%)", "On the purchase total from Mercedes-Benz. Check the current rate with your CA."),
      pct("evPurchaseGstRateBp", "Car purchase, EV grade (%)", "Electric cars. Default 5"),
      pct("saleGstRateBp", "Car sale (%)", "On the selling price of a demo / bidding / courtesy car. Default 18"),
      pct("serviceGstRateBp", "Our invoices (%)", "Fixed compensation, finance, insurance and renewal payouts. Default 18"),
    ],
  },
  {
    title: "Fixed compensation",
    description: KEEP,
    fields: [pct("fcRateBp", "Fixed compensation (% of basic price)", "New cars only. Default 3.5")],
  },
  {
    title: "TDS deducted by the payer",
    description: "On the amount before GST. Defaults to the rate here on the first receipt; can be changed on each receipt.",
    fields: [
      pct("fcTdsRateBp", "Mercedes-Benz (fixed compensation) %", "Default 2"),
      pct("financeTdsRateBp", "Finance providers %", "Default 2"),
      pct("insuranceTdsRateBp", "Insurers (insurance and renewals) %", "Default 2"),
    ],
  },
  {
    title: "Finance",
    fields: [
      pct(
        "loanCapBp",
        "Loan cap (% of car value)",
        "Car value = selling price + GST. Above 100 lets a bank fund the on-road price (road tax, insurance, registration). Default 130",
      ),
    ],
  },
  {
    title: "Demo cars",
    fields: [{ name: "demoLockInDays", label: "Lock-in period (days)", type: "number", required: true, hint: "Default 90. Can be changed per car." }],
  },
];

export default function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  return (
    <>
      <PageHeader title="Constants" description="Rates, defaults and the choices employees see in the forms. Only admins can change these." />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/settings">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const [s, lists, used] = await Promise.all([getSettings(), getOptionLists(), usedValues()]);
  return (
    <div className="space-y-10">
      <Flash saved={one(sp.saved) === "1"} />
      <section aria-labelledby="h-current" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="h-current" className="text-sm font-semibold text-slate-700">
          In force now
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["GST, car purchase", formatPercent(s.purchaseGstRateBp)],
            ["GST, EV purchase", formatPercent(s.evPurchaseGstRateBp)],
            ["GST, car sale", formatPercent(s.saleGstRateBp)],
            ["GST, our invoices", formatPercent(s.serviceGstRateBp)],
            ["Fixed compensation", formatPercent(s.fcRateBp)],
            ["TDS, Mercedes-Benz", formatPercent(s.fcTdsRateBp)],
            ["TDS, finance", formatPercent(s.financeTdsRateBp)],
            ["TDS, insurers", formatPercent(s.insuranceTdsRateBp)],
            ["Loan cap", formatPercent(s.loanCapBp)],
            ["Demo lock-in", `${s.demoLockInDays} days`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <RecordForm
        action={saveSettings}
        sections={sections}
        initial={{
          fcRateBp: bpToInput(s.fcRateBp),
          serviceGstRateBp: bpToInput(s.serviceGstRateBp),
          purchaseGstRateBp: bpToInput(s.purchaseGstRateBp),
          evPurchaseGstRateBp: bpToInput(s.evPurchaseGstRateBp),
          saleGstRateBp: bpToInput(s.saleGstRateBp),
          fcTdsRateBp: bpToInput(s.fcTdsRateBp),
          financeTdsRateBp: bpToInput(s.financeTdsRateBp),
          insuranceTdsRateBp: bpToInput(s.insuranceTdsRateBp),
          loanCapBp: bpToInput(s.loanCapBp),
          demoLockInDays: String(s.demoLockInDays),
        }}
        record={{ id: "rates", version: s.version }}
        cancelHref="/overview"
        submitLabel="Save constants"
      />

      <section aria-labelledby="h-lists">
        <h2 id="h-lists" className="text-base font-semibold text-slate-900">
          Form choices
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          For each field, choose whether employees type it (with these options suggested) or pick it from a drop-down of only these options.
          Existing records keep their values even if an option is removed.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {OPTION_LISTS.map((l) => (
            <div key={l.key} id={`list-${l.key}`}>
              <OptionListForm
                action={saveOptionList}
                listKey={l.key}
                label={l.label}
                usedIn={l.usedIn}
                mode={lists[l.key].mode}
                options={lists[l.key].options}
                version={lists[l.key].version}
                used={used[l.key]}
                fixed={l.key === "purchaseType" ? PURCHASE_TYPES.map((t) => PURCHASE_TYPE_LABELS[t]) : []}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

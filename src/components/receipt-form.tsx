"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/form-state";
import { previewPaise } from "@/lib/calc";
import { formatDay, formatMoney } from "@/lib/format";
import { buttonStyles } from "./ui";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface ReceiptRow {
  id: string;
  receiptNo: string;
  /** yyyy-mm-dd */
  receiptDate: string;
  tdsAmount: number;
  receivedAmount: number;
  by: string;
}

const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonStyles.primary}>
      {pending ? "Saving…" : "Add receipt"}
    </button>
  );
}

/**
 * The last step of the invoice loop: what the payer actually paid. A payer
 * may pay in parts, so each payment is its own receipt. TDS is normally
 * deducted once, with the first payment.
 */
export function ReceiptForm({
  action,
  removeAction,
  record,
  claimTotal,
  expectedTds,
  receipts,
  invoiceRaised,
  canEdit,
}: {
  action: Action;
  removeAction: Action;
  record: { id: string; version: number };
  /** Paise. */
  claimTotal: number;
  /** TDS at the record's rate on the amount before GST. */
  expectedTds: number;
  receipts: ReceiptRow[];
  invoiceRaised: boolean;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [removeState, removeFormAction, removing] = useActionState(removeAction, initialFormState);
  const tdsSoFar = receipts.reduce((t, r) => t + r.tdsAmount, 0);
  const receivedSoFar = receipts.reduce((t, r) => t + r.receivedAmount, 0);
  const balance = claimTotal - tdsSoFar - receivedSoFar;
  const defaultTds = Math.max(0, expectedTds - tdsSoFar);

  const values = state.values ?? {};
  const [tds, setTds] = useState(values.tdsAmount ?? "");
  const [received, setReceived] = useState(values.receivedAmount ?? "");
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  const newTds = tds.trim() ? previewPaise(tds) : defaultTds;
  const after = balance - newTds - previewPaise(received);
  const canAdd = canEdit && invoiceRaised && balance > 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" data-tour="receipt">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900">Receipts</h2>
        <p className="mt-1 text-sm text-slate-500">
          {invoiceRaised
            ? "Record each payment as it arrives. If the payer pays less, the balance stays open until the rest is received."
            : "Raise the invoice first (invoice no and date above); receipts are recorded after that."}
        </p>
        {!canEdit && invoiceRaised && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
            You can see the receipts but not record them (that needs Receipt access for this tab).
          </p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total receivable" value={formatMoney(claimTotal)} />
          <Stat label="TDS deducted" value={formatMoney(tdsSoFar)} hint={`Expected ${formatMoney(expectedTds)}`} />
          <Stat label="Received" value={formatMoney(receivedSoFar)} />
          <Stat
            label={balance < 0 ? "Paid in excess" : "Balance to be paid"}
            value={formatMoney(Math.abs(balance))}
            tone={!receipts.length ? undefined : balance > 0 ? "red" : "green"}
          />
        </dl>
      </div>

      {receipts.length > 0 && (
        <div className="border-b border-slate-200">
          <table className="rt rt-md w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Receipt no</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">TDS</th>
                <th className="px-4 py-2.5 text-right">Received</th>
                <th className="px-4 py-2.5">By</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td data-primary="" className="px-4 py-2.5 font-mono text-[13px] font-medium text-slate-900">{r.receiptNo}</td>
                  <td data-label="Date" className="px-4 py-2.5">{formatDay(r.receiptDate)}</td>
                  <td data-label="TDS" className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.tdsAmount)}</td>
                  <td data-label="Received" className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.receivedAmount)}</td>
                  <td data-label="By" className="px-4 py-2.5 text-slate-500">{r.by || "—"}</td>
                  {canEdit && (
                    <td data-wide="" className="px-4 py-2.5 text-right">
                      <form
                        action={removeFormAction}
                        onSubmit={(ev) => {
                          if (!window.confirm(`Remove receipt ${r.receiptNo}?`)) ev.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={record.id} />
                        <input type="hidden" name="version" value={record.version} />
                        <input type="hidden" name="receiptId" value={r.id} />
                        <button type="submit" disabled={removing} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {removeState.message && (
            <p role="alert" className="px-4 py-2 text-sm text-red-700">
              {removeState.message}
            </p>
          )}
        </div>
      )}

      {canAdd && (
        <form action={formAction} noValidate className="p-6">
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="version" value={record.version} />
          <h3 className="text-sm font-semibold text-slate-900">{receipts.length ? "Add another receipt" : "Add receipt"}</h3>
          {state.message && (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.message}
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field id="r-receiptNo" label="Receipt no" error={e("receiptNo")}>
              <input
                id="r-receiptNo"
                name="receiptNo"
                defaultValue={values.receiptNo}
                maxLength={40}
                autoComplete="off"
                aria-invalid={e("receiptNo") ? true : undefined}
                className={`${inputClass} font-mono uppercase`}
              />
            </Field>
            <Field id="r-receiptDate" label="Receipt date" error={e("receiptDate")}>
              <input
                id="r-receiptDate"
                name="receiptDate"
                type="date"
                min="2000-01-01"
                max={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}
                defaultValue={values.receiptDate}
                aria-invalid={e("receiptDate") ? true : undefined}
                className={inputClass}
              />
            </Field>
            <Field id="r-tdsAmount" label="TDS on this receipt" error={e("tdsAmount")} hint={`Leave empty for ${formatMoney(defaultTds)}`}>
              <Money id="r-tdsAmount" name="tdsAmount" value={tds} onChange={setTds} placeholder={String(defaultTds / 100)} error={e("tdsAmount")} />
            </Field>
            <Field id="r-receivedAmount" label="Amount received" error={e("receivedAmount")} hint={`Payable now ${formatMoney(balance - newTds)}`}>
              <Money id="r-receivedAmount" name="receivedAmount" value={received} onChange={setReceived} error={e("receivedAmount")} />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm font-medium tabular-nums ${received.trim() ? (after > 0 ? "text-red-700" : "text-emerald-700") : "text-slate-500"}`}>
              Balance after this receipt: {received.trim() ? formatMoney(after) : "—"}
            </p>
            <Save />
          </div>
        </form>
      )}
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "red" | "green" }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-1 text-base font-semibold tabular-nums ${tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-slate-900"}`}>
        {value}
      </dd>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Money({
  id,
  name,
  value,
  onChange,
  placeholder = "0.00",
  error,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">₹</span>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} pl-7 tabular-nums`}
      />
    </div>
  );
}

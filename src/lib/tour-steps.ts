import { can, type Permission, type Principal } from "@/lib/permissions";

/**
 * Guided product tour. Plain data so the server can filter it by permission
 * and hand it to the client. `target` matches a `data-tour` attribute.
 */
export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Page this step lives on; the tour navigates there first. */
  route?: string;
  /** Element to spotlight. Without one the step is a centred card. */
  target?: string;
  /** The highlighted element is clickable and clicking it continues the tour. */
  clickToContinue?: boolean;
  /** Skip silently when the element is not on the page (e.g. an empty list). */
  optional?: boolean;
  requires?: Permission | "admin";
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Chasis ERP",
    body: "This is where the F&I desk tracks every rupee per chassis: bank payouts on car loans, insurance commission, renewals, and the incentives you pay out. The tour takes about two minutes.",
  },
  {
    id: "nav-overview",
    target: "nav-overview",
    clickToContinue: true,
    requires: "overview:view",
    title: "Start with the Overview",
    body: "Click Overview in the menu. It's your dashboard.",
  },
  {
    id: "ov-income",
    route: "/overview",
    target: "ov-income",
    requires: "overview:view",
    title: "What the desk earned",
    body: "Payouts received from banks (finance) and commission received from insurers, minus what you paid to sales executives and brokers. Net incentive is what the desk really made.",
  },
  {
    id: "ov-owed",
    route: "/overview",
    target: "ov-owed",
    requires: "overview:view",
    title: "What you're still owed",
    body: "Payouts not received yet. A red badge means it has been pending for more than 60 days, so chase it. Click any tile to open the cases behind the number.",
  },
  {
    id: "ov-chase",
    route: "/overview",
    target: "ov-chase",
    requires: "overview:view",
    title: "Who to chase first",
    body: "Everything pending, grouped by bank or insurer and sorted by amount. Use it as the accounts team's call list.",
  },
  {
    id: "ov-activity",
    route: "/overview",
    target: "ov-activity",
    requires: "overview:view",
    title: "Every change is recorded",
    body: "Who added or changed what, and when. Nothing changes without a trace.",
  },
  {
    id: "nav-finance",
    target: "nav-finance",
    clickToContinue: true,
    requires: "finance:view",
    title: "Finance",
    body: "Click Finance to see cars sold on a loan.",
  },
  {
    id: "finance-list",
    route: "/finance",
    target: "finance-list",
    requires: "finance:view",
    title: "One row per car sold on a loan",
    body: "Bank, loan amount and the payout the bank owes you, plus purchase price, selling price and margin. Green means received, amber means pending, red means pending for more than 60 days. Search by chassis or bank, and click a chassis number to open it.",
  },
  {
    id: "finance-new",
    route: "/finance",
    target: "new-record",
    optional: true,
    requires: "finance:edit",
    title: "Add a sale",
    body: "Enter the chassis, bank, loan, payout and the car's purchase and selling price. Duplicate chassis numbers, bad amounts and impossible dates are blocked automatically.",
  },
  {
    id: "nav-insurance",
    target: "nav-insurance",
    clickToContinue: true,
    requires: "insurance:view",
    title: "Insurance",
    body: "Click Insurance to see the policies you sold.",
  },
  {
    id: "insurance-list",
    route: "/insurance",
    target: "insurance-list",
    requires: "insurance:view",
    title: "Policies and commission",
    body: "Each policy, its premium, and the commission due from the insurer. A car can have several policies over the years (new, then renewals). The policy end date drives the renewal reminders.",
  },
  {
    id: "nav-renewals",
    target: "nav-renewals",
    clickToContinue: true,
    requires: "renewals:view",
    title: "Renewal",
    body: "Click Renewal. Every year, each policy is a chance to earn commission again.",
  },
  {
    id: "renewals-expiring",
    route: "/renewals",
    target: "renewals-expiring",
    optional: true,
    requires: "renewals:view",
    title: "Calls to make",
    body: "Policies expiring within 45 days that nobody has followed up yet. The system finds them for you, so renewals don't slip away to competitors.",
  },
  {
    id: "renewals-list",
    route: "/renewals",
    target: "renewals-list",
    requires: "renewals:view",
    title: "Follow-ups",
    body: "Track each renewal from Due to Contacted, then Renewed or Lost, with notes and the next follow-up date. Use the filters to switch between them.",
  },
  {
    id: "nav-incentives",
    target: "nav-incentives",
    clickToContinue: true,
    requires: "incentives:view",
    title: "Incentive",
    body: "Click Incentive to see what you paid out.",
  },
  {
    id: "incentives-list",
    route: "/incentives",
    target: "incentives-list",
    requires: "incentives:view",
    title: "Payouts you made",
    body: "Incentives paid to sales executives, brokers and DSAs for each car, with the payment reference for reconciliation. These are subtracted to give the net figure on the Overview.",
  },
  {
    id: "nav-users",
    target: "nav-admin-users",
    clickToContinue: true,
    requires: "admin",
    title: "Users",
    body: "Click Users. Only admins see this.",
  },
  {
    id: "users-list",
    route: "/admin/users",
    target: "users-list",
    requires: "admin",
    title: "Who can do what",
    body: "Add people, make them admin, and tick exactly what each person can view, edit or delete in each section. Changes apply immediately, and deactivated users are signed out straight away.",
  },
  {
    id: "launcher",
    target: "tour-launcher",
    title: "Replay this anytime",
    body: "Click Take the tour whenever you want this walkthrough again. Your name, just below, opens My account, where you can change your password.",
  },
  {
    id: "done",
    title: "You're all set",
    body: "Start on the Overview each day: chase anything red, follow up renewals that are due, and record payouts as you make them.",
  },
];

export function tourStepsFor(user: Principal): TourStep[] {
  return STEPS.filter((s) => !s.requires || (s.requires === "admin" ? user.role === "admin" : can(user, s.requires)));
}

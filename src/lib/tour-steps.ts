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
    body: "This is where VST Titanium Motors tracks every car bought from Mercedes-Benz and every rupee it is owed: fixed compensation on new cars, and finance, insurance and renewal payouts, from invoice to receipt. The tour takes about two minutes.",
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
    id: "ov-period",
    route: "/overview",
    target: "ov-period",
    requires: "overview:view",
    title: "Pick a period",
    body: "This month, last month, this financial year or all time. Every number below follows it.",
  },
  {
    id: "ov-pipeline",
    route: "/overview",
    target: "ov-pipeline",
    requires: "overview:view",
    title: "Where the money is stuck",
    body: "For each stream: how many are not billed yet, billed but not collected, collected, or short-paid with a balance due. A red badge means the invoice has been unpaid for more than 60 days. Click a row to open the records behind it.",
  },
  {
    id: "ov-stock",
    route: "/overview",
    target: "ov-stock",
    requires: "overview:view",
    title: "Cars",
    body: "Cars bought in the period, demo cars still in their lock-in, pre-owned stock, and renewals coming up.",
  },
  {
    id: "nav-purchases",
    target: "nav-purchases",
    clickToContinue: true,
    requires: "purchases:view",
    title: "Purchase",
    body: "Click Purchase to see cars bought from Mercedes-Benz.",
  },
  {
    id: "purchases-list",
    route: "/purchases",
    target: "purchases-list",
    requires: "purchases:view",
    title: "One row per commission no",
    body: "New, demo, bidding and courtesy cars. Purchase total, GST and total purchase are calculated for you. New cars show where their fixed compensation stands; demo cars show their lock-in. Click any date to switch between dd-mm-yyyy and Apr-26.",
  },
  {
    id: "purchases-new",
    route: "/purchases",
    target: "new-record",
    optional: true,
    requires: "purchases:invoice",
    title: "Add a purchase",
    body: "Enter the car and its price breakdown. For a new car, enter the invoice no once you bill Mercedes-Benz; the receipt is recorded on the same page when the payment arrives.",
  },
  {
    id: "nav-demo",
    target: "nav-demo",
    clickToContinue: true,
    requires: "purchases:view",
    title: "Demo stock",
    body: "Click Demo stock: only the demo cars, split into live (in lock-in), deflected and sold.",
  },
  {
    id: "demo-list",
    route: "/demo",
    target: "demo-list",
    requires: "purchases:view",
    title: "Profit or loss on every demo car",
    body: "A is total selling price minus total purchase, B the loss claim with Mercedes-Benz, C the sales measure; net = A + B + C. The cards above show stock, unsold value and the P&L for the period.",
  },
  {
    id: "nav-preowned",
    target: "nav-preowned",
    clickToContinue: true,
    requires: "preowned:view",
    title: "Pre-owned",
    body: "Click Pre-owned for cars bought from customers, for exchange or resale.",
  },
  {
    id: "nav-finance",
    target: "nav-finance",
    clickToContinue: true,
    requires: "finance:view",
    title: "Finance payout",
    body: "Click Finance payout to see payouts from banks on car loans.",
  },
  {
    id: "finance-list",
    route: "/finance",
    target: "finance-list",
    requires: "finance:view",
    title: "The same loop for every payout",
    body: "Incentive plus GST, invoice to the provider, then the receipt with TDS. Insurance and renewal payouts work the same way. A payout can only be added once the car is sold.",
  },
  {
    id: "nav-renewals",
    target: "nav-renewals",
    clickToContinue: true,
    requires: "renewals:view",
    title: "Renewal payout",
    body: "Click Renewal payout. Every year, each policy we sold is a chance to earn again.",
  },
  {
    id: "renewals-expiring",
    route: "/renewals",
    target: "renewals-expiring",
    optional: true,
    requires: "renewals:view",
    title: "Calls to make",
    body: "Our policies expiring within 45 days that haven't been renewed yet. Record the renewal straight from here.",
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
    body: "For each tab, choose View, Invoice (create and edit up to raising the invoice), Receipt (record the payment after the invoice) and Delete. Deactivated users are signed out straight away. Passwords are never shown, only reset.",
  },
  {
    id: "nav-activity",
    target: "nav-admin-activity",
    requires: "admin",
    title: "Activity log",
    body: "Every change, with who made it, when, from where and which fields changed. Failed sign-ins and refused access show up here too. Filter by user, area, action and dates.",
  },
  {
    id: "nav-constants",
    target: "nav-admin-settings",
    requires: "admin",
    title: "Constants",
    body: "Rates (FC, GST, TDS per payer, demo lock-in) and the choices employees see: for type, location, class, model and providers, switch between a free text box and a drop-down of your options.",
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
    body: "Start on the Overview each day: bill what is not billed, chase what is billed and red, and follow up short payments.",
  },
];

export function tourStepsFor(user: Principal): TourStep[] {
  return STEPS.filter((s) => !s.requires || (s.requires === "admin" ? user.role === "admin" : can(user, s.requires)));
}

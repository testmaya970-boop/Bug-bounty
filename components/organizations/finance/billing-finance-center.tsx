"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Coins,
  TrendingUp,
  DollarSign,
  Download,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Building2,
  Receipt,
  FileText,
  ShieldCheck,
  Globe,
  PieChart,
  BarChart3,
  Calendar,
  Lock,
  ArrowRight,
  ChevronRight,
  MoreVertical,
  Check,
  RefreshCw,
  ExternalLink,
  Sliders,
  Award,
  Zap,
  Activity,
  UserCheck,
  Eye,
  Info,
  Layers,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  ENTERPRISE_SUBSCRIPTION,
  PROGRAM_BUDGETS,
  MOCK_RESEARCHER_PAYMENTS,
  MOCK_INVOICES,
  MOCK_PAYMENT_METHODS,
  MOCK_TAX_DOCUMENTS,
  MOCK_FINANCIAL_TIMELINE,
  FINANCIAL_ANALYTICS,
  type ResearcherPaymentItem,
  type PaymentStatus,
  type InvoiceRecord,
  type PaymentMethodItem,
  type ProgramBudgetInfo,
} from "../../../lib/mock/billing-finance";

interface BillingFinanceCenterProps {
  organizationId: string;
  organizationName: string;
}

type TabType =
  | "overview"
  | "subscription"
  | "budget"
  | "payments"
  | "invoices"
  | "methods"
  | "tax"
  | "analytics"
  | "forecasts"
  | "timeline";

export function BillingFinanceCenter({ organizationId, organizationName }: BillingFinanceCenterProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  React.useEffect(() => {
    const tab = searchParams.get("tab") as TabType | null;
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [payments, setPayments] = useState<ResearcherPaymentItem[]>(MOCK_RESEARCHER_PAYMENTS);
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [paymentSearch, setPaymentSearch] = useState<string>("");

  const [budgets, setBudgets] = useState<ProgramBudgetInfo[]>(PROGRAM_BUDGETS);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(MOCK_INVOICES);
  const [invoiceFilter, setInvoiceFilter] = useState<string>("all");

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>(MOCK_PAYMENT_METHODS);

  // Modals & Drawers
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [addFundsAmount, setAddFundsAmount] = useState("25000");
  const [selectedTargetProgram, setSelectedTargetProgram] = useState(PROGRAM_BUDGETS[0].id);

  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<ResearcherPaymentItem | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesSearch =
        p.reportTitle.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        p.researcherHandle.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        p.researcherName.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        p.invoiceNumber.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        p.reportId.toLowerCase().includes(paymentSearch.toLowerCase());

      const matchesStatus = paymentFilter === "all" || p.status === paymentFilter;

      return matchesSearch && matchesStatus;
    });
  }, [payments, paymentSearch, paymentFilter]);

  // Aggregated totals
  const totalBudgetPool = budgets.reduce((acc, b) => acc + b.totalBudget, 0);
  const totalBudgetSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
  const totalBudgetReserved = budgets.reduce((acc, b) => acc + b.reserved, 0);
  const totalBudgetRemaining = budgets.reduce((acc, b) => acc + b.remaining, 0);

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const pendingPayoutTotal = pendingPayments.reduce((acc, p) => acc + p.amount, 0);

  // Handlers
  const handleApprovePayment = (id: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "approved" as PaymentStatus, paidAt: "Queued for wire batch" } : p)),
    );
    showToast("Reward payout approved and queued for automated wire disbursal.");
  };

  const handleHoldPayment = (id: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "hold" as PaymentStatus, failureReason: "Placed on hold by finance administrator for review." } : p)),
    );
    showToast("Payment placed on administrative hold.");
  };

  const handleRejectPayment = (id: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "failed" as PaymentStatus, failureReason: "Rejected by financial governance policy." } : p)),
    );
    showToast("Reward payment rejected.");
  };

  const handleAddFundsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(addFundsAmount) || 0;
    if (amountNum <= 0) return;

    setBudgets((prev) =>
      prev.map((b) =>
        b.id === selectedTargetProgram
          ? {
              ...b,
              totalBudget: b.totalBudget + amountNum,
              remaining: b.remaining + amountNum,
              status: "healthy",
            }
          : b,
      ),
    );
    setIsAddFundsOpen(false);
    showToast(`Successfully added $${amountNum.toLocaleString("en-US")} to program reward budget!`);
  };

  const handleSetPrimaryMethod = (id: string) => {
    setPaymentMethods((prev) =>
      prev.map((pm) => ({
        ...pm,
        isPrimary: pm.id === id,
      })),
    );
    showToast("Primary payment method updated.");
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-semibold text-[#111827] shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="size-4 text-blue-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header & Hero Section */}
      <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <CreditCard className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-[#111827]">Billing & Finance Center</h1>
                  <span className="text-xs font-semibold text-emerald-700">· Financial Operations</span>
                </div>
                <p className="text-xs text-[#667085]">
                  Manage subscriptions, researcher rewards, invoices, taxes, and enterprise financial governance.
                </p>
              </div>
            </div>
          </div>

          {/* Primary Financial Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddFundsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Add Budget / Funds</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("payments");
                setPaymentFilter("pending");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
            >
              <Coins className="size-3.5 text-amber-600" />
              <span>Approve Rewards ({pendingPayments.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("invoices");
                showToast("Downloading consolidated Q4 financial statement PDF...");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
            >
              <Download className="size-3.5 text-[#667085]" />
              <span>Download Statement</span>
            </button>
          </div>
        </div>

        {/* Hero Quick Metrics Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-5 border-t border-[#F2F4F7]">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Current Plan</span>
            <div className="text-base font-bold text-[#111827]">Enterprise</div>
            <div className="text-[11px] text-[#667085]">$4,500/mo (Annual)</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">October Spend</span>
            <div className="text-base font-bold text-blue-600">$32,450</div>
            <div className="text-[11px] text-[#667085]">Includes rewards & fees</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Reward Budget Pool</span>
            <div className="text-base font-bold text-emerald-600">${totalBudgetRemaining.toLocaleString("en-US")}</div>
            <div className="text-[11px] text-emerald-600/80">49.3% available to award</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Pending Rewards</span>
            <div className="text-base font-bold text-amber-600">${pendingPayoutTotal.toLocaleString("en-US")}</div>
            <div className="text-[11px] text-amber-700/80">{pendingPayments.length} awaiting sign-off</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Outstanding Invoices</span>
            <div className="text-base font-bold text-[#111827]">$17,500</div>
            <div className="text-[11px] text-[#667085]">2 pending settlement</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Contract Renewal</span>
            <div className="text-base font-bold text-purple-700">Dec 15, 2026</div>
            <div className="text-[11px] text-purple-600/80">Net-30 Invoice verified</div>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E7EAF0] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: "overview", label: "Financial Overview", icon: BarChart3 },
          { id: "subscription", label: "Subscription & Plan", icon: Award },
          { id: "budget", label: "Reward Budgets", icon: PieChart },
          { id: "payments", label: `Researcher Payments (${payments.length})`, icon: Coins },
          { id: "invoices", label: `Invoices & Notes (${invoices.length})`, icon: Receipt },
          { id: "methods", label: "Payment Methods", icon: CreditCard },
          { id: "tax", label: "Tax & Compliance Center", icon: FileText },
          { id: "analytics", label: "Cost Analytics", icon: Activity },
          { id: "forecasts", label: "Spend Forecasting", icon: TrendingUp },
          { id: "timeline", label: "Financial Timeline", icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3.5 py-3 text-xs font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "border-blue-600 text-blue-700 font-bold"
                  : "border-transparent text-[#667085] hover:border-slate-300 hover:text-[#111827]",
              )}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: FINANCIAL OVERVIEW */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Health Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Remaining Reward Pool</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Coins className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-600">
                  ${totalBudgetRemaining.toLocaleString("en-US")}
                </span>
                <span className="text-xs text-[#667085]">/ ${totalBudgetPool.toLocaleString("en-US")}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(totalBudgetRemaining / totalBudgetPool) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-1">
                <span>Burn: ~$1,080 / day</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("budget")}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Adjust
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">October Total Disbursed</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Activity className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#111827]">$32,450</span>
                <span className="text-xs font-semibold text-emerald-600">-8.2% vs Sep</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: "68%" }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-1">
                <span>7 awards completed</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Charts
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Pending Sign-Offs</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-600">${pendingPayoutTotal.toLocaleString("en-US")}</span>
                <span className="text-xs text-[#667085]">{pendingPayments.length} reports</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "35%" }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-1">
                <span>1 Critical ($7,500)</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("payments");
                    setPaymentFilter("pending");
                  }}
                  className="font-semibold text-amber-700 hover:underline"
                >
                  Authorize
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Estimated Security ROI</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <ShieldCheck className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-purple-700">$4.25M</span>
                <span className="text-xs text-[#667085]">avoidance</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-purple-600 rounded-full" style={{ width: "92%" }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-1">
                <span>18 zero-day bugs fixed</span>
                <span className="font-semibold text-purple-600">High Impact</span>
              </div>
            </div>
          </div>

          {/* 2-Column Overview Workspace: Left Budgets, Right Pending Sign-offs */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 Cols: Program Budget Allocation */}
            <div className="lg:col-span-7 rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">Active Program Reward Budgets</h3>
                  <p className="text-xs text-[#667085]">Real-time balance, commitments, and burn velocity per program.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("budget")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>Detailed View</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>

              <div className="space-y-3">
                {budgets.map((b) => {
                  const pct = Math.round((b.spent / b.totalBudget) * 100);
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-[#F2F4F7] p-3.5 space-y-2 hover:border-[#D0D5DD] transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#111827]">{b.programName}</span>
                        <span className="font-bold text-xs text-[#111827]">
                          ${b.remaining.toLocaleString("en-US")} <span className="text-[11px] font-normal text-[#667085]">left of ${b.totalBudget.toLocaleString("en-US")}</span>
                        </span>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 flex">
                        <div
                          style={{ width: `${pct}%` }}
                          className={cn(
                            "h-full",
                            b.status === "warning" ? "bg-amber-500" : "bg-blue-600",
                          )}
                          title={`Spent: $${b.spent}`}
                        />
                        <div
                          style={{ width: `${Math.round((b.reserved / b.totalBudget) * 100)}%` }}
                          className="h-full bg-slate-300"
                          title={`Reserved: $${b.reserved}`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#667085]">
                        <span>Spent: ${b.spent.toLocaleString("en-US")} · Reserved: ${b.reserved.toLocaleString("en-US")}</span>
                        <span>Burn: ~${b.burnRatePerDay}/day</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Cols: Pending Payout Sign-offs */}
            <div className="lg:col-span-5 rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">Pending Reward Authorizations</h3>
                  <p className="text-xs text-[#667085]">Bounties validated and awaiting final finance release.</p>
                </div>
                <span className="text-xs font-bold text-amber-600">{pendingPayments.length} pending</span>
              </div>

              <div className="space-y-3">
                {pendingPayments.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-amber-200/80 bg-amber-50/20 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-[#111827] line-clamp-1">{p.reportTitle}</div>
                        <div className="text-[11px] text-[#667085] mt-0.5">
                          Researcher: <span className="font-semibold text-[#111827]">{p.researcherHandle}</span> · {p.programName}
                        </div>
                      </div>
                      <span className="font-bold text-sm text-emerald-700 shrink-0">
                        ${p.amount.toLocaleString("en-US")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 text-xs">
                      <span className="text-[11px] text-[#667085]">{p.requestedAt}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleHoldPayment(p.id)}
                          className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                        >
                          Hold
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovePayment(p.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve Wire
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("payments")}
                className="w-full rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] py-2 text-center text-xs font-semibold text-[#475467] hover:bg-[#F2F4F7]"
              >
                View Full Researcher Payments Ledger →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: SUBSCRIPTION & PLAN */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "subscription" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 8 Cols: Plan Specs & Usage */}
            <div className="lg:col-span-8 rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-6 border-b border-[#F2F4F7]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#111827]">{ENTERPRISE_SUBSCRIPTION.name}</h3>
                    <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                      ACTIVE CONTRACT
                    </span>
                  </div>
                  <p className="text-xs text-[#667085] mt-1">
                    Contract: <span className="font-mono">{ENTERPRISE_SUBSCRIPTION.contractNumber}</span> · Payment Terms: {ENTERPRISE_SUBSCRIPTION.paymentTerms}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-2xl font-black text-[#111827]">
                    ${ENTERPRISE_SUBSCRIPTION.priceMonthly.toLocaleString("en-US")}
                    <span className="text-xs font-normal text-[#667085]"> / month</span>
                  </div>
                  <div className="text-xs text-purple-700 font-semibold">Billed annually ($54,000/yr)</div>
                </div>
              </div>

              {/* Usage Meters */}
              <div className="space-y-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">Contract Ingest & Seat Capacity Meters</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {ENTERPRISE_SUBSCRIPTION.usageMeters.map((meter) => (
                    <div key={meter.label} className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111827]">{meter.label}</span>
                        <span className="text-[#667085]">
                          {meter.used.toLocaleString("en-US")} / {meter.limit.toLocaleString("en-US")} {meter.unit}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            meter.percentage > 85 ? "bg-amber-500" : "bg-blue-600",
                          )}
                          style={{ width: `${meter.percentage}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-[#667085] text-right">{meter.percentage}% consumed</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Included Capabilities */}
              <div className="space-y-3 pt-3 border-t border-[#F2F4F7]">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">Enterprise Contract Privileges</h4>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {ENTERPRISE_SUBSCRIPTION.features.map((feat) => (
                    <div key={feat} className="flex items-start gap-2 text-xs text-[#344054]">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Renewal & Management */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-blue-600" />
                  <h4 className="font-bold text-sm text-[#111827]">Renewal Timeline</h4>
                </div>
                <div className="rounded-lg bg-slate-50 p-3.5 space-y-1 text-xs">
                  <div className="text-[#667085]">Next Automatic Renewal:</div>
                  <div className="text-base font-bold text-[#111827]">{ENTERPRISE_SUBSCRIPTION.renewalDate}</div>
                  <div className="text-[11px] text-emerald-700 font-medium">Automatic Net-30 invoice will be dispatched</div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => showToast("Dedicated Account Executive (Claire Vance) notified to schedule quarterly review.")}
                    className="w-full rounded-xl bg-blue-600 py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    Contact Enterprise Executive
                  </button>

                  <button
                    type="button"
                    onClick={() => showToast("Plan change request submitted to account management.")}
                    className="w-full rounded-xl border border-[#E7EAF0] bg-white py-2.5 text-center text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                  >
                    Modify Tier or Add Seats
                  </button>
                </div>
              </div>

              {/* Account Manager Box */}
              <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-2 text-xs">
                <span className="font-bold text-[#111827]">Dedicated Security Concierge:</span>
                <p className="text-[#667085]">
                  Claire Vance · VP Strategic Accounts<br />
                  Direct line: +1 (415) 890-4412<br />
                  Email: claire.vance@comolho.io
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: REWARD BUDGETS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "budget" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Reward Budget Allocation & Policy</h3>
              <p className="text-xs text-[#667085]">
                Manage departmental pools, reserve thresholds, and auto-pause controls when limits are reached.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddFundsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>Add Budget Pool</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {budgets.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-[#111827]">{b.programName}</h4>
                    <span className="text-xs text-[#667085]">Daily Velocity: ~${b.burnRatePerDay} USD/day</span>
                  </div>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold",
                      b.status === "healthy"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {b.status.toUpperCase()}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-emerald-700">${b.remaining.toLocaleString("en-US")} Available</span>
                    <span className="text-[#667085]">${b.totalBudget.toLocaleString("en-US")} Total</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 flex">
                    <div
                      style={{ width: `${Math.round((b.spent / b.totalBudget) * 100)}%` }}
                      className="h-full bg-blue-600"
                    />
                    <div
                      style={{ width: `${Math.round((b.reserved / b.totalBudget) * 100)}%` }}
                      className="h-full bg-amber-400"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#667085]">
                    <span>Spent: ${b.spent.toLocaleString("en-US")}</span>
                    <span>Reserved: ${b.reserved.toLocaleString("en-US")}</span>
                  </div>
                </div>

                <div className="text-[11px] text-[#475467] pt-2 border-t border-[#F2F4F7]">
                  Last Award: <span className="font-medium text-[#111827]">{b.lastBountyAwarded}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: RESEARCHER PAYMENTS WORKSPACE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "All Payments" },
                { id: "pending", label: `Pending (${pendingPayments.length})` },
                { id: "approved", label: "Approved" },
                { id: "processing", label: "Processing" },
                { id: "completed", label: "Completed" },
                { id: "tax_pending", label: "Tax Pending" },
                { id: "hold", label: "On Hold" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setPaymentFilter(st.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                    paymentFilter === st.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-[#F9FAFB] text-[#475467] hover:bg-[#F2F4F7] hover:text-[#111827]",
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-1.5 sm:w-72 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10">
              <Search className="size-3.5 text-[#98A2B3]" />
              <input
                type="text"
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                placeholder="Search researcher, report, invoice..."
                className="w-full bg-transparent text-xs text-[#111827] placeholder:text-[#98A2B3] focus:outline-none"
              />
            </div>
          </div>

          {/* Payments Table */}
          <div className="overflow-hidden rounded-xl border border-[#E7EAF0] bg-white shadow-sm">
            <div className="divide-y divide-[#F2F4F7]">
              {filteredPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#F9FAFB] lg:flex-row lg:items-center lg:justify-between"
                >
                  {/* Left: Report & Researcher info */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#111827]">{p.reportTitle}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold",
                          p.severity === "CRITICAL"
                            ? "bg-rose-50 text-rose-700"
                            : p.severity === "HIGH"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700",
                        )}
                      >
                        {p.severity}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold uppercase",
                          p.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : p.status === "approved"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#667085]">
                      <span className="font-semibold text-[#111827]">{p.researcherHandle}</span>
                      <span>({p.researcherCountry})</span>
                      <span>·</span>
                      <span>{p.programName}</span>
                      <span>·</span>
                      <span>Method: {p.paymentMethod}</span>
                      <span>·</span>
                      <span className="text-emerald-700 font-medium">{p.taxStatus}</span>
                    </div>

                    {p.failureReason && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200/70 p-2 text-xs text-amber-800">
                        {p.failureReason}
                      </div>
                    )}
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex shrink-0 items-center justify-between lg:justify-end gap-4 border-t border-[#F2F4F7] pt-2 lg:border-t-0 lg:pt-0">
                    <div className="text-left lg:text-right">
                      <div className="text-base font-bold text-[#111827]">
                        ${p.amount.toLocaleString("en-US")} <span className="text-xs font-normal text-[#667085]">USD</span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3]">
                        +${p.feeAmount} fee · Inv: {p.invoiceNumber}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleHoldPayment(p.id)}
                            className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                          >
                            Hold
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovePayment(p.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                        </>
                      )}

                      {p.status === "hold" && (
                        <button
                          type="button"
                          onClick={() => handleApprovePayment(p.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                          Release Hold
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          showToast(`Exported payment voucher for ${p.invoiceNumber}`);
                        }}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs text-[#667085] hover:text-[#111827] hover:bg-[#F9FAFB]"
                        title="Download Voucher"
                      >
                        <Download className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: INVOICE CENTER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              {["all", "paid", "pending"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setInvoiceFilter(st)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all capitalize",
                    invoiceFilter === st ? "bg-blue-600 text-white shadow-sm" : "bg-[#F9FAFB] text-[#475467] hover:bg-[#F2F4F7]",
                  )}
                >
                  {st === "all" ? "All Invoices" : st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => showToast("Exporting consolidated audit spreadsheet (CSV)...")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E7EAF0] bg-white shadow-sm">
            <div className="divide-y divide-[#F2F4F7]">
              {invoices
                .filter((inv) => (invoiceFilter === "all" ? true : inv.status === invoiceFilter))
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs font-mono text-[#111827]">{inv.invoiceNumber}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700">
                          {inv.type}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 text-[10px] font-bold uppercase",
                            inv.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#475467]">{inv.description}</p>
                      <div className="text-[11px] text-[#98A2B3]">
                        Issued: {inv.issuedAt} · Due: {inv.dueAt} · Recipient: {inv.recipient}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-[#111827]">
                        ${inv.amount.toLocaleString("en-US")} {inv.currency}
                      </span>
                      <button
                        type="button"
                        onClick={() => showToast(`Generating official PDF for ${inv.invoiceNumber}...`)}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 6: PAYMENT METHODS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "methods" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Corporate Funding & Payout Methods</h3>
              <p className="text-xs text-[#667085]">
                Authorized bank accounts, corporate credit cards, and multi-currency rails.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddCardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>Add Payment Method</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className={cn(
                  "rounded-xl border bg-white p-5 shadow-sm space-y-4 transition-all relative",
                  pm.isPrimary ? "border-blue-600 ring-1 ring-blue-500/20" : "border-[#E7EAF0]",
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                    {pm.type === "bank_account" ? <Building2 className="size-5" /> : <CreditCard className="size-5" />}
                  </div>

                  {pm.isPrimary && (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      Primary
                    </span>
                  )}
                </div>

                <div>
                  <div className="font-bold text-sm text-[#111827]">{pm.brandOrBank}</div>
                  <div className="font-mono text-xs text-[#667085] mt-0.5">
                    •••• •••• •••• {pm.last4} {pm.expiry && `(${pm.expiry})`}
                  </div>
                  <div className="text-[11px] text-[#98A2B3] mt-1 truncate">{pm.billingName}</div>
                </div>

                <div className="pt-2 border-t border-[#F2F4F7] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-emerald-700 font-semibold">Verified</span>
                  {!pm.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimaryMethod(pm.id)}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      Make Primary
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 7: TAX & COMPLIANCE CENTER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "tax" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Organization Tax Identity & Legal Profile</h3>
              <p className="text-xs text-[#667085]">
                Corporate residency and automated withholding documentation.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              <div className="rounded-lg bg-slate-50 p-3.5 space-y-1 text-xs">
                <span className="text-[#667085]">Tax Residency:</span>
                <div className="font-bold text-[#111827]">United States (Delaware C-Corp)</div>
                <div className="text-[11px] text-[#98A2B3]">EIN: XX-XXXX8912 (Verified)</div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3.5 space-y-1 text-xs">
                <span className="text-[#667085]">Withholding Automation:</span>
                <div className="font-bold text-[#111827]">W-8BEN / W-9 Enforced</div>
                <div className="text-[11px] text-emerald-700 font-semibold">94 Active Certifications on file</div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3.5 space-y-1 text-xs">
                <span className="text-[#667085]">Global Regimes Supported:</span>
                <div className="font-bold text-[#111827]">US 1099, EU VAT, India TDS</div>
                <div className="text-[11px] text-[#98A2B3]">Section 194J automated withholding</div>
              </div>
            </div>
          </div>

          {/* Tax Documents Repository */}
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">
              Certified Tax Documents & Filings ({MOCK_TAX_DOCUMENTS.length})
            </h4>

            <div className="divide-y divide-[#F2F4F7]">
              {MOCK_TAX_DOCUMENTS.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#111827]">{doc.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700">
                        {doc.formType}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#667085]">
                      Jurisdiction: {doc.jurisdiction} · Filed: {doc.submittedAt} · Size: {doc.downloadSize}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => showToast(`Downloading ${doc.formType} packet...`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] px-3 py-1.5 font-semibold text-[#344054] hover:bg-[#F9FAFB] shrink-0"
                  >
                    <Download className="size-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 8: COST ANALYTICS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Financial Analytics & Spend Distribution</h3>
            <p className="text-xs text-[#667085]">
              Granular breakdown of security investments by vulnerability severity and program.
            </p>
          </div>

          {/* 12-Month Spend Trend Visual Chart */}
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-[#111827]">12-Month Financial Disbursal Trend</h4>
                <p className="text-xs text-[#667085]">Platform SaaS vs. Direct Researcher Bounty Awards</p>
              </div>
              <span className="text-xs font-bold text-blue-600">Total YTD: $370,500</span>
            </div>

            {/* Visual stacked bars */}
            <div className="flex items-end justify-between gap-2 h-44 pt-6 pb-2">
              {FINANCIAL_ANALYTICS.monthlySpendHistory.map((bar) => {
                const heightPct = Math.min(100, Math.round((bar.total / 45000) * 100));
                return (
                  <div key={bar.month} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <div className="w-full flex items-end justify-center h-32">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full max-w-[28px] rounded-t bg-blue-600 group-hover:bg-blue-700 transition-all relative"
                      >
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-[#111827] px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                          ${(bar.total / 1000).toFixed(1)}k
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#98A2B3] font-medium">{bar.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Severity vs Cost Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-[#111827]">Spend by Vulnerability Severity</h4>
              <div className="space-y-3 pt-1">
                {FINANCIAL_ANALYTICS.severitySpendBreakdown.map((sev) => (
                  <div key={sev.severity} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#111827]">{sev.severity}</span>
                      <span className="font-bold text-[#111827]">${sev.spend.toLocaleString("en-US")} ({sev.percentage}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${sev.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-[#111827]">Top Compensated Researchers</h4>
              <div className="divide-y divide-[#F2F4F7]">
                {FINANCIAL_ANALYTICS.topResearchersPaid.map((res) => (
                  <div key={res.handle} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <div className="font-bold text-[#111827]">{res.handle}</div>
                      <div className="text-[11px] text-[#98A2B3]">{res.reportsCount} accepted reports · {res.country}</div>
                    </div>
                    <span className="font-bold text-emerald-700">${res.amount.toLocaleString("en-US")} USD</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 9: FORECASTING & RUNWAY */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "forecasts" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">Predictive Financial Modeling & Runway</h3>
              <p className="text-xs text-[#667085]">
                Algorithmic projections grounded in vulnerability discovery velocity and quarterly burn rate.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-4 space-y-1">
                <span className="text-xs text-[#667085]">Projected Runway</span>
                <div className="text-2xl font-bold text-blue-700">{FINANCIAL_ANALYTICS.forecast.runwayMonths} Months</div>
                <div className="text-[11px] text-[#475467]">Sufficient funding through current fiscal quarter</div>
              </div>

              <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-4 space-y-1">
                <span className="text-xs text-[#667085]">Expected 30-Day Spend</span>
                <div className="text-2xl font-bold text-emerald-700">${FINANCIAL_ANALYTICS.forecast.expectedMonthlySpend.toLocaleString("en-US")}</div>
                <div className="text-[11px] text-[#475467]">Based on recent asset enrollment</div>
              </div>

              <div className="rounded-lg bg-purple-50/50 border border-purple-100 p-4 space-y-1">
                <span className="text-xs text-[#667085]">Projected Budget Exhaustion</span>
                <div className="text-2xl font-bold text-purple-700">{FINANCIAL_ANALYTICS.forecast.projectedBudgetExhaustionDate}</div>
                <div className="text-[11px] text-[#475467]">Recommend replenishment by Dec 20</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 10: FINANCIAL TIMELINE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Financial Audit Trail & Event Timeline</h3>
            <p className="text-xs text-[#667085]">
              Cryptographically timestamped transaction log for internal SOX and SOC 2 Type II audit readiness.
            </p>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm">
            <div className="space-y-5">
              {MOCK_FINANCIAL_TIMELINE.map((evt, idx) => (
                <div key={evt.id} className="flex items-start gap-4 text-xs">
                  <div className="flex flex-col items-center">
                    <div className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 font-bold">
                      {idx + 1}
                    </div>
                    {idx !== MOCK_FINANCIAL_TIMELINE.length - 1 && <div className="h-10 w-0.5 bg-slate-200 mt-1" />}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#111827]">{evt.title}</span>
                      <span className="text-[11px] text-[#98A2B3]">{evt.timestamp}</span>
                    </div>
                    <p className="text-[#475467] leading-relaxed">{evt.note}</p>
                    <div className="text-[11px] text-[#667085]">
                      Actor: {evt.actor} · Ref: <span className="font-mono text-[#111827]">{evt.referenceId}</span>
                      {evt.amount && <span className="font-bold text-emerald-700"> · ${evt.amount.toLocaleString("en-US")} {evt.currency}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ADD FUNDS / REPLENISH MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isAddFundsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">Replenish Program Reward Budget</h3>
                <p className="text-xs text-[#667085]">Fund bounty pool via corporate wire or primary payment method.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddFundsOpen(false)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddFundsSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Target Program</label>
                <select
                  value={selectedTargetProgram}
                  onChange={(e) => setSelectedTargetProgram(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827] focus:outline-none"
                >
                  {budgets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.programName} (${b.remaining.toLocaleString("en-US")} left)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Replenishment Amount (USD)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2 font-bold text-[#667085]">$</span>
                  <input
                    type="number"
                    value={addFundsAmount}
                    onChange={(e) => setAddFundsAmount(e.target.value)}
                    className="w-full rounded-lg border border-[#D0D5DD] pl-7 pr-3 py-2 text-xs text-[#111827] focus:border-blue-500 focus:outline-none"
                    placeholder="25000"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Funding Rail</label>
                <select className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827] focus:outline-none">
                  <option>J.P. Morgan Chase Bank (****4812) - Automated Clearing House</option>
                  <option>Corporate Net-30 Wire Invoice</option>
                  <option>Visa Corporate Commercial (****9024)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddFundsOpen(false)}
                  className="rounded-lg border border-[#E7EAF0] px-3.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Confirm & Fund Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ADD PAYMENT METHOD MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isAddCardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">Add Corporate Payment Rail</h3>
                <p className="text-xs text-[#667085]">Add bank account or corporate credit card for billing.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCardOpen(false)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Cardholder / Company Name</label>
                <input
                  type="text"
                  defaultValue="Northwind Cloud Technologies Inc."
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Card / Account Number</label>
                <input
                  type="text"
                  placeholder="•••• •••• •••• ••••"
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#344054]">Expiry</label>
                  <input type="text" placeholder="MM/YY" className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">CVC / Routing</label>
                  <input type="text" placeholder="CVC" className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs font-mono" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCardOpen(false)}
                  className="rounded-lg border border-[#E7EAF0] px-3.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCardOpen(false);
                    showToast("Payment method verified and saved.");
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Save Method
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

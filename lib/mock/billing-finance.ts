/**
 * Realistic Mock Data & Types for Com Olho Enterprise Billing & Finance Center
 * Comprehensive financial operations workspace modeled after Stripe Dashboard, AWS Billing, and GitHub Enterprise.
 */

export interface BillingPlanInfo {
  name: string;
  tier: "Starter" | "Professional" | "Enterprise" | "GovCloud";
  priceMonthly: number;
  billingCycle: "Monthly" | "Annual";
  renewalDate: string;
  contractNumber: string;
  paymentTerms: string;
  features: string[];
  usageMeters: {
    label: string;
    used: number;
    limit: number;
    unit: string;
    percentage: number;
  }[];
}

export interface ProgramBudgetInfo {
  id: string;
  programId: string;
  programName: string;
  totalBudget: number;
  spent: number;
  reserved: number;
  remaining: number;
  currency: string;
  burnRatePerDay: number;
  status: "healthy" | "warning" | "exhausted";
  lastBountyAwarded: string;
}

export type PaymentStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "tax_pending"
  | "hold";

export interface ResearcherPaymentItem {
  id: string;
  reportId: string;
  reportTitle: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  researcherHandle: string;
  researcherName: string;
  researcherCountry: string;
  programName: string;
  amount: number;
  feeAmount: number;
  currency: string;
  paymentMethod: "Wire Transfer" | "Stripe Express" | "PayPal" | "Crypto/USDC";
  status: PaymentStatus;
  invoiceNumber: string;
  taxStatus: "W-8BEN Verified" | "W-9 Verified" | "Tax Form Required" | "Exempt";
  approverName: string;
  requestedAt: string;
  paidAt?: string;
  failureReason?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  type: "Subscription" | "Bounty Disbursal" | "Platform Fee" | "Credit Adjustment";
  recipient: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "overdue" | "cancelled";
  downloadUrl?: string;
  description: string;
}

export interface PaymentMethodItem {
  id: string;
  type: "bank_account" | "credit_card" | "paypal";
  brandOrBank: string;
  last4: string;
  expiry?: string;
  isPrimary: boolean;
  status: "verified" | "action_required" | "expired";
  lastUsed: string;
  billingName: string;
}

export interface TaxDocumentItem {
  id: string;
  formType: "1099-MISC" | "1099-NEC" | "W-8BEN" | "W-9" | "VAT Invoice" | "TDS Certificate";
  year: number;
  title: string;
  entityName: string;
  jurisdiction: string;
  status: "Verified & Filed" | "Pending Review" | "Submitted";
  submittedAt: string;
  downloadSize: string;
}

export interface FinancialEventLog {
  id: string;
  type: "reward_approved" | "invoice_paid" | "budget_replenished" | "payout_settled" | "tax_verified" | "fee_collected";
  title: string;
  actor: string;
  timestamp: string;
  amount?: number;
  currency?: string;
  referenceId: string;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────
export const ENTERPRISE_SUBSCRIPTION: BillingPlanInfo = {
  name: "Enterprise Security Operations & GovCloud",
  tier: "Enterprise",
  priceMonthly: 4500,
  billingCycle: "Annual",
  renewalDate: "December 15, 2026",
  contractNumber: "ENT-2026-CO-98402",
  paymentTerms: "Net-30 Invoice / Wire Transfer",
  features: [
    "Unlimited Public & Private Bug Bounty Programs",
    "Dedicated 24/7 Managed Triage Desk (1-Hour SLA guarantee)",
    "Custom Attack Surface Discovery & Active DNS Sentinel",
    "SAML 2.0 / Okta / Azure AD SCIM Automated Provisioning",
    "Bi-Directional Atlassian Jira & ServiceNow SIR Connectors",
    "Cryptographic HMAC-SHA256 Webhook Bus & SIEM Export",
    "Automated Global Multi-Currency Researcher Payout Engine",
    "W-8BEN / W-9 IRS Compliance Automation & 1099 Generation",
  ],
  usageMeters: [
    { label: "Organization Team Seats", used: 42, limit: 100, unit: "seats", percentage: 42 },
    { label: "Active Programs (Public/VDP)", used: 7, limit: 20, unit: "programs", percentage: 35 },
    { label: "Private Invite-Only Programs", used: 4, limit: 10, unit: "programs", percentage: 40 },
    { label: "Monthly API Dispatch Ingest", used: 184200, limit: 500000, unit: "calls", percentage: 36.8 },
    { label: "Encrypted Evidence Vault Storage", used: 38.4, limit: 250, unit: "GB", percentage: 15.4 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// REWARD BUDGET BY PROGRAM
// ─────────────────────────────────────────────────────────────────────────────
export const PROGRAM_BUDGETS: ProgramBudgetInfo[] = [
  {
    id: "bg-1",
    programId: "prog-prod-core",
    programName: "Northwind Cloud Production Core (Web & API)",
    totalBudget: 50000,
    spent: 24500,
    reserved: 8500,
    remaining: 17000,
    currency: "USD",
    burnRatePerDay: 840,
    status: "warning",
    lastBountyAwarded: "3 hours ago ($7,500)",
  },
  {
    id: "bg-2",
    programId: "prog-cloud-infra",
    programName: "Cloud Infrastructure, Kubernetes & IAM Engine",
    totalBudget: 25000,
    spent: 5200,
    reserved: 4500,
    remaining: 15300,
    currency: "USD",
    burnRatePerDay: 190,
    status: "healthy",
    lastBountyAwarded: "Yesterday ($3,500)",
  },
  {
    id: "bg-3",
    programId: "prog-mobile-sdk",
    programName: "Mobile SDKs (iOS Swift & Android Kotlin)",
    totalBudget: 15000,
    spent: 2750,
    reserved: 5250,
    remaining: 7000,
    currency: "USD",
    burnRatePerDay: 110,
    status: "healthy",
    lastBountyAwarded: "4 days ago ($2,000)",
  },
  {
    id: "bg-4",
    programId: "prog-vdp-responsible",
    programName: "Vulnerability Disclosure Program (VDP)",
    totalBudget: 10000,
    spent: 0,
    reserved: 0,
    remaining: 10000,
    currency: "USD",
    burnRatePerDay: 0,
    status: "healthy",
    lastBountyAwarded: "Swag & Recognition only",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCHER PAYMENTS & LEDGER
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_RESEARCHER_PAYMENTS: ResearcherPaymentItem[] = [
  {
    id: "pay-101",
    reportId: "CO-1049",
    reportTitle: "Remote Code Execution via Spring SpEL in Payments Gateway",
    severity: "CRITICAL",
    researcherHandle: "0xCyberNinja",
    researcherName: "Kenji Sato",
    researcherCountry: "Japan",
    programName: "Northwind Cloud Production Core",
    amount: 7500,
    feeAmount: 375,
    currency: "USD",
    paymentMethod: "Wire Transfer",
    status: "pending",
    invoiceNumber: "INV-2026-8819",
    taxStatus: "W-8BEN Verified",
    approverName: "Elena Rostova (VP Eng)",
    requestedAt: "3 hours ago",
  },
  {
    id: "pay-102",
    reportId: "CO-1042",
    reportTitle: "Blind SSRF to AWS Instance Metadata Service (IMDSv1)",
    severity: "CRITICAL",
    researcherHandle: "vortex_sec",
    researcherName: "Viktor Petrov",
    researcherCountry: "Estonia",
    programName: "Cloud Infrastructure & IAM",
    amount: 10000,
    feeAmount: 500,
    currency: "USD",
    paymentMethod: "Wire Transfer",
    status: "approved",
    invoiceNumber: "INV-2026-8812",
    taxStatus: "W-8BEN Verified",
    approverName: "Sarah Chen (Head of SecOps)",
    requestedAt: "Yesterday",
    paidAt: "Queued for batch dispatch",
  },
  {
    id: "pay-103",
    reportId: "CO-1038",
    reportTitle: "Pre-Auth Account Takeover via JWT Public Key Confusion",
    severity: "HIGH",
    researcherHandle: "bytehunter",
    researcherName: "Liam O'Connor",
    researcherCountry: "Ireland",
    programName: "Northwind Cloud Production Core",
    amount: 5000,
    feeAmount: 250,
    currency: "USD",
    paymentMethod: "Stripe Express",
    status: "processing",
    invoiceNumber: "INV-2026-8804",
    taxStatus: "W-8BEN Verified",
    approverName: "Marcus Brody",
    requestedAt: "2 days ago",
    paidAt: "ACH transfer initiated (2 days est.)",
  },
  {
    id: "pay-104",
    reportId: "CO-1031",
    reportTitle: "Stored XSS Leading to Session Hijack in Organization Settings",
    severity: "MEDIUM",
    researcherHandle: "alice_crypto",
    researcherName: "Alice Dubois",
    researcherCountry: "France",
    programName: "Northwind Cloud Production Core",
    amount: 2500,
    feeAmount: 125,
    currency: "USD",
    paymentMethod: "PayPal",
    status: "completed",
    invoiceNumber: "INV-2026-8791",
    taxStatus: "W-8BEN Verified",
    approverName: "Marcus Brody",
    requestedAt: "Oct 26, 2026",
    paidAt: "Oct 27, 2026 (TX #PP-994102)",
  },
  {
    id: "pay-105",
    reportId: "CO-1025",
    reportTitle: "BOLA / IDOR in Organization Invoice Download API",
    severity: "HIGH",
    researcherHandle: "shadow_walker",
    researcherName: "Amir Hassan",
    researcherCountry: "United Arab Emirates",
    programName: "Northwind Cloud Production Core",
    amount: 4000,
    feeAmount: 200,
    currency: "USD",
    paymentMethod: "Wire Transfer",
    status: "tax_pending",
    invoiceNumber: "INV-2026-8780",
    taxStatus: "Tax Form Required",
    approverName: "Sarah Chen",
    requestedAt: "Oct 24, 2026",
    failureReason: "W-8BEN form expired. Notification sent to researcher to update tax residency.",
  },
  {
    id: "pay-106",
    reportId: "CO-1019",
    reportTitle: "Cross-Site WebSocket Hijacking in Real-Time Triage Feed",
    severity: "MEDIUM",
    researcherHandle: "neo_matrix",
    researcherName: "Mateo Silva",
    researcherCountry: "Brazil",
    programName: "Mobile SDKs",
    amount: 1750,
    feeAmount: 87.5,
    currency: "USD",
    paymentMethod: "Wire Transfer",
    status: "hold",
    invoiceNumber: "INV-2026-8762",
    taxStatus: "W-8BEN Verified",
    approverName: "David Sterling (Finance)",
    requestedAt: "Oct 20, 2026",
    failureReason: "Security team requested regression verification before disbursing final reward tranche.",
  },
  {
    id: "pay-107",
    reportId: "CO-1011",
    reportTitle: "Subdomain Takeover on Staging Microservices Endpoint",
    severity: "MEDIUM",
    researcherHandle: "cloud_sentinel",
    researcherName: "Jennifer Zhang",
    researcherCountry: "Canada",
    programName: "Cloud Infrastructure & IAM",
    amount: 1500,
    feeAmount: 75,
    currency: "USD",
    paymentMethod: "Wire Transfer",
    status: "completed",
    invoiceNumber: "INV-2026-8744",
    taxStatus: "W-8BEN Verified",
    approverName: "Sarah Chen",
    requestedAt: "Oct 18, 2026",
    paidAt: "Oct 19, 2026 (Ref #WT-40291)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE RECORDS
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_INVOICES: InvoiceRecord[] = [
  {
    id: "inv-901",
    invoiceNumber: "INV-2026-1049",
    type: "Subscription",
    recipient: "Northwind Cloud Technologies Inc.",
    issuedAt: "Oct 01, 2026",
    dueAt: "Oct 31, 2026",
    amount: 4500,
    currency: "USD",
    status: "paid",
    description: "Enterprise Operations Plan (October 2026 Monthly Tranche)",
  },
  {
    id: "inv-902",
    invoiceNumber: "INV-2026-1050",
    type: "Bounty Disbursal",
    recipient: "0xCyberNinja (Kenji Sato)",
    issuedAt: "Nov 01, 2026",
    dueAt: "Nov 15, 2026",
    amount: 7500,
    currency: "USD",
    status: "pending",
    description: "Bounty award for Report CO-1049 (Remote Code Execution in Core)",
  },
  {
    id: "inv-903",
    invoiceNumber: "INV-2026-1045",
    type: "Bounty Disbursal",
    recipient: "vortex_sec (Viktor Petrov)",
    issuedAt: "Oct 31, 2026",
    dueAt: "Nov 14, 2026",
    amount: 10000,
    currency: "USD",
    status: "pending",
    description: "Bounty award for Report CO-1042 (Zero-Day SSRF to AWS Metadata)",
  },
  {
    id: "inv-904",
    invoiceNumber: "INV-2026-1039",
    type: "Bounty Disbursal",
    recipient: "bytehunter (Liam O'Connor)",
    issuedAt: "Oct 29, 2026",
    dueAt: "Nov 12, 2026",
    amount: 5000,
    currency: "USD",
    status: "paid",
    description: "Bounty award for Report CO-1038 (JWT Pre-Auth Account Takeover)",
  },
  {
    id: "inv-905",
    invoiceNumber: "INV-2026-1022",
    type: "Credit Adjustment",
    recipient: "Northwind Cloud Technologies Inc.",
    issuedAt: "Oct 15, 2026",
    dueAt: "Oct 15, 2026",
    amount: -1200,
    currency: "USD",
    status: "paid",
    description: "Quarterly High-Volume Enterprise SLA Credit Refund",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT METHODS
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_PAYMENT_METHODS: PaymentMethodItem[] = [
  {
    id: "pm-1",
    type: "bank_account",
    brandOrBank: "J.P. Morgan Chase Bank, N.A.",
    last4: "4812",
    isPrimary: true,
    status: "verified",
    lastUsed: "Yesterday ($10,000 Payout Batch)",
    billingName: "Northwind Cloud Technologies Inc. (Operating Account)",
  },
  {
    id: "pm-2",
    type: "credit_card",
    brandOrBank: "Visa Corporate Commercial",
    last4: "9024",
    expiry: "08/29",
    isPrimary: false,
    status: "verified",
    lastUsed: "Oct 01, 2026 ($4,500 Subscription)",
    billingName: "David Sterling (Chief Financial Officer)",
  },
  {
    id: "pm-3",
    type: "paypal",
    brandOrBank: "PayPal Enterprise Commerce",
    last4: "corp",
    isPrimary: false,
    status: "verified",
    lastUsed: "Oct 27, 2026 ($2,500 Payout to alice_crypto)",
    billingName: "billing@northwindcloud.com",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TAX & COMPLIANCE REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_TAX_DOCUMENTS: TaxDocumentItem[] = [
  {
    id: "tax-1",
    formType: "1099-NEC",
    year: 2026,
    title: "Consolidated US Non-Employee Compensation Return (Q1-Q3)",
    entityName: "Northwind Cloud Technologies Inc.",
    jurisdiction: "United States (Internal Revenue Service)",
    status: "Verified & Filed",
    submittedAt: "Oct 15, 2026",
    downloadSize: "1.4 MB PDF",
  },
  {
    id: "tax-2",
    formType: "W-8BEN",
    year: 2026,
    title: "International Researcher Certificate of Foreign Status Master Pack",
    entityName: "Com Olho Global Withholding Repository (94 Researchers)",
    jurisdiction: "International Treaty Withholding",
    status: "Verified & Filed",
    submittedAt: "Oct 02, 2026",
    downloadSize: "4.8 MB ZIP",
  },
  {
    id: "tax-3",
    formType: "VAT Invoice",
    year: 2026,
    title: "EU Reverse-Charge B2B VAT Summary Statement",
    entityName: "Northwind Cloud Europe B.V.",
    jurisdiction: "European Union (VIES Verified)",
    status: "Verified & Filed",
    submittedAt: "Sep 30, 2026",
    downloadSize: "840 KB PDF",
  },
  {
    id: "tax-4",
    formType: "TDS Certificate",
    year: 2026,
    title: "Section 194J Professional Services Tax Deduction (Form 16A)",
    entityName: "Com Olho India Pvt Ltd",
    jurisdiction: "India (Income Tax Department)",
    status: "Submitted",
    submittedAt: "Oct 28, 2026",
    downloadSize: "620 KB PDF",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL TIMELINE
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_FINANCIAL_TIMELINE: FinancialEventLog[] = [
  {
    id: "ft-1",
    type: "reward_approved",
    title: "Bounty Reward Authorized for P1 Critical",
    actor: "Elena Rostova (VP Eng)",
    timestamp: "3 hours ago",
    amount: 7500,
    currency: "USD",
    referenceId: "CO-1049",
    note: "Exploit validated; dual sign-off completed under $5k threshold policy.",
  },
  {
    id: "ft-2",
    type: "payout_settled",
    title: "ACH Wire Transfer Settled to Viktor Petrov",
    actor: "J.P. Morgan Automated Clearing House",
    timestamp: "Yesterday 16:40",
    amount: 10000,
    currency: "USD",
    referenceId: "WT-49910",
    note: "IMDSv1 zero-day bounty payment settled in full. Zero withholding applicable under US-Estonia tax treaty.",
  },
  {
    id: "ft-3",
    type: "budget_replenished",
    title: "Q4 Bounty Pool Replenished via Corporate Wire",
    actor: "David Sterling (CFO)",
    timestamp: "Oct 15, 2026",
    amount: 50000,
    currency: "USD",
    referenceId: "ACH-982144",
    note: "Allocated $30,000 to Production Core and $20,000 to Cloud Infrastructure.",
  },
  {
    id: "ft-4",
    type: "invoice_paid",
    title: "Enterprise Operations Plan Auto-Paid",
    actor: "Visa Corporate Commercial (****9024)",
    timestamp: "Oct 01, 2026",
    amount: 4500,
    currency: "USD",
    referenceId: "INV-2026-1049",
    note: "Monthly SaaS fee settled; 42 team seats and Managed Triage active.",
  },
  {
    id: "ft-5",
    type: "tax_verified",
    title: "Form W-8BEN Validated for Kenji Sato",
    actor: "IRS Automated TIN Check Engine",
    timestamp: "Sep 28, 2026",
    referenceId: "TAX-JP-8812",
    note: "Treaty benefits confirmed; 0% federal withholding applied.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SPEND ANALYTICS & FORECASTING
// ─────────────────────────────────────────────────────────────────────────────
export const FINANCIAL_ANALYTICS = {
  monthlySpendHistory: [
    { month: "Nov '25", platform: 4500, bounties: 18000, total: 22500 },
    { month: "Dec '25", platform: 4500, bounties: 26000, total: 30500 },
    { month: "Jan '26", platform: 4500, bounties: 19500, total: 24000 },
    { month: "Feb '26", platform: 4500, bounties: 22000, total: 26500 },
    { month: "Mar '26", platform: 4500, bounties: 31000, total: 35500 },
    { month: "Apr '26", platform: 4500, bounties: 24500, total: 29000 },
    { month: "May '26", platform: 4500, bounties: 28000, total: 32500 },
    { month: "Jun '26", platform: 4500, bounties: 34000, total: 38500 },
    { month: "Jul '26", platform: 4500, bounties: 27500, total: 32000 },
    { month: "Aug '26", platform: 4500, bounties: 29000, total: 33500 },
    { month: "Sep '26", platform: 4500, bounties: 33500, total: 38000 },
    { month: "Oct '26", platform: 4500, bounties: 27950, total: 32450 },
  ],
  severitySpendBreakdown: [
    { severity: "Critical (CVSS 9.0 - 10.0)", count: 4, spend: 22500, percentage: 69 },
    { severity: "High (CVSS 7.0 - 8.9)", count: 3, spend: 9000, percentage: 28 },
    { severity: "Medium (CVSS 4.0 - 6.9)", count: 2, spend: 4250, percentage: 13 },
    { severity: "Low (CVSS 0.1 - 3.9)", count: 1, spend: 500, percentage: 2 },
  ],
  topResearchersPaid: [
    { name: "vortex_sec", handle: "vortex_sec", amount: 28500, reportsCount: 4, country: "Estonia" },
    { name: "0xCyberNinja", handle: "0xCyberNinja", amount: 24000, reportsCount: 3, country: "Japan" },
    { name: "bytehunter", handle: "bytehunter", amount: 16500, reportsCount: 5, country: "Ireland" },
    { name: "alice_crypto", handle: "alice_crypto", amount: 11200, reportsCount: 6, country: "France" },
    { name: "shadow_walker", handle: "shadow_walker", amount: 9500, reportsCount: 3, country: "UAE" },
  ],
  forecast: {
    expectedMonthlySpend: 36800,
    expectedQuarterlySpend: 110400,
    projectedBudgetExhaustionDate: "January 28, 2027",
    runwayMonths: 7.8,
    estimatedROIPreventedBreachCost: "$4,250,000",
  },
};

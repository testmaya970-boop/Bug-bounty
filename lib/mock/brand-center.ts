/**
 * Realistic Mock Data & Types for Com Olho Enterprise Brand Center
 * Identity & visual governance across Public Directory, Programs, Hall of Fame, Disclosure Pages, and Emails.
 */

export interface BrandHealthCard {
  id: string;
  title: string;
  metric: string;
  status: "healthy" | "warning" | "attention";
  recommendation: string;
  quickFixLabel: string;
  targetTab: string;
}

export interface OrganizationIdentityState {
  organizationName: string;
  legalName: string;
  displayName: string;
  shortDescription: string;
  longDescription: string;
  industry: string;
  headquarters: string;
  website: string;
  supportEmail: string;
  securityContact: string;
  disclosureContact: string;
  languages: string[];
  timeZone: string;
}

export interface VisualAssetItem {
  id: string;
  name: string;
  category: "logo" | "banner" | "icon" | "social";
  description: string;
  dimensions: string;
  fileSize: string;
  format: string;
  status: "configured" | "missing";
  lastUpdated: string;
  version: string;
  previewBg: string;
  accentHex: string;
  versions: {
    version: string;
    date: string;
    author: string;
    note: string;
  }[];
}

export interface PublicProfileConfig {
  aboutUs: string;
  mission: string;
  securityPhilosophy: string;
  recognitionPolicy: string;
  responseExpectations: string;
  avgResponseTime: string;
  languagesSupported: string[];
  websiteUrl: string;
  careersUrl: string;
  securityBlogUrl: string;
  githubHandle: string;
  twitterHandle: string;
  linkedinUrl: string;
  contactEmail: string;
}

export interface ProgramBrandingConfig {
  accentColor: string;
  secondaryColor: string;
  cardStyle: "elevated" | "minimal" | "bordered";
  bannerTheme: "slate-mesh" | "cobalt-grid" | "emerald-shield" | "obsidian-dark";
  welcomeMessage: string;
  researcherGuidelines: string;
  recognitionMessage: string;
  showLiveSlaMetrics: boolean;
  showTopBountyRange: boolean;
  featuredBadgeText: string;
}

export interface HallOfFameConfig {
  pageTitle: string;
  introMessage: string;
  recognitionCriteria: string;
  showQuarterLeaderboard: boolean;
  showCriticalFinderBadges: boolean;
  certificateTitle: string;
  certificateSignatory: string;
  certificateSignatoryRole: string;
  certificateSealStyle: "gold-verified" | "platinum-shield" | "cobalt-crest";
  featuredResearchers: {
    handle: string;
    name: string;
    country: string;
    findingsCount: number;
    impactTier: string;
    badge: string;
  }[];
}

export interface DisclosurePageConfig {
  disclosureStatement: string;
  safeHarborLevel: "Full Gold Standard Safe Harbor" | "Conditional Safe Harbor" | "Custom Legal Policy";
  safeHarborStatement: string;
  legalNotice: string;
  submissionInstructions: string;
  responseSlaFirstAck: string;
  responseSlaTriage: string;
  responseSlaResolution: string;
  disclosureTimelineDays: number;
  pgpFingerprint: string;
  securityTxtEnabled: boolean;
}

export interface EmailBrandingConfig {
  senderDisplayName: string;
  replyToEmail: string;
  headerStyle: "dark-enterprise" | "clean-light" | "accent-bar";
  brandColor: string;
  footerText: string;
  signatureName: string;
  signatureRole: string;
  supportContactEmail: string;
  includePgpFooter: boolean;
  includeSocialLinks: boolean;
}

export interface BrandVersionRecord {
  id: string;
  version: string;
  eventTitle: string;
  category: "logo" | "identity" | "banner" | "theme" | "email" | "disclosure";
  author: string;
  authorRole: string;
  timestamp: string;
  changesSummary: string;
  snapshotAccent: string;
  isCurrent?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

export const INITIAL_BRAND_HEALTH: BrandHealthCard[] = [
  {
    id: "bh-1",
    title: "Profile Completion",
    metric: "94% Complete",
    status: "healthy",
    recommendation: "All core researcher-facing identity fields and SLA policies are verified.",
    quickFixLabel: "Review Identity",
    targetTab: "identity",
  },
  {
    id: "bh-2",
    title: "Brand Consistency",
    metric: "98% Aligned",
    status: "healthy",
    recommendation: "Primary cobalt palette (#2563EB) and vector logos match across 6 surfaces.",
    quickFixLabel: "Inspect Preview",
    targetTab: "preview",
  },
  {
    id: "bh-3",
    title: "Logo & Vector Quality",
    metric: "Retina SVG",
    status: "healthy",
    recommendation: "Primary, Dark, Light, and Square logos pass WCAG AA contrast checks.",
    quickFixLabel: "Manage Logos",
    targetTab: "assets",
  },
  {
    id: "bh-4",
    title: "Missing Assets",
    metric: "1 Optional",
    status: "warning",
    recommendation: "Open Graph social sharing banner is using auto-generated fallback.",
    quickFixLabel: "Configure Banner",
    targetTab: "assets",
  },
  {
    id: "bh-5",
    title: "Email Branding",
    metric: "DKIM & DMARC",
    status: "healthy",
    recommendation: "Authenticated security@northwindcloud.com template with custom header.",
    quickFixLabel: "Preview Emails",
    targetTab: "email",
  },
  {
    id: "bh-6",
    title: "Public Visibility",
    metric: "Verified & Listed",
    status: "healthy",
    recommendation: "Featured in Public Directory, Hall of Fame, and /.well-known/security.txt.",
    quickFixLabel: "Edit Public Page",
    targetTab: "public-profile",
  },
];

export const INITIAL_IDENTITY: OrganizationIdentityState = {
  organizationName: "Northwind Cloud",
  legalName: "Northwind Cloud Technologies Inc.",
  displayName: "Northwind Cloud Security",
  shortDescription:
    "Enterprise cloud infrastructure, distributed Kubernetes orchestration, and zero-trust identity services.",
  longDescription:
    "Northwind Cloud builds mission-critical distributed cloud infrastructure powering Fortune 500 financial institutions and healthcare networks. Our Security Operations & Bug Bounty team partners directly with independent security researchers worldwide to harden our APIs, hypervisors, and cryptographic control planes.",
  industry: "Cloud Infrastructure & Enterprise SaaS",
  headquarters: "San Francisco, CA, United States",
  website: "https://northwindcloud.com",
  supportEmail: "support@northwindcloud.com",
  securityContact: "security@northwindcloud.com",
  disclosureContact: "psirt@northwindcloud.com",
  languages: ["English (US)", "Japanese", "German", "French"],
  timeZone: "America/Los_Angeles (PST / UTC-8)",
};

export const INITIAL_VISUAL_ASSETS: VisualAssetItem[] = [
  {
    id: "ast-primary-logo",
    name: "Primary Logo",
    category: "logo",
    description: "Main horizontal lockup displayed on light navigation headers and directory cards.",
    dimensions: "480 × 120 px",
    fileSize: "14.2 KB",
    format: "SVG / Vector",
    status: "configured",
    lastUpdated: "2 days ago",
    version: "v3.2",
    previewBg: "bg-slate-50",
    accentHex: "#0F172A",
    versions: [
      { version: "v3.2", date: "Oct 29, 2026", author: "Elena Rostova", note: "Optimized SVG viewBox padding" },
      { version: "v3.1", date: "Sep 14, 2026", author: "Marcus Brody", note: "Updated brand wordmark kerning" },
    ],
  },
  {
    id: "ast-dark-logo",
    name: "Dark Mode Logo",
    category: "logo",
    description: "High-contrast light lockup used on dark hero banners and dark mode researcher views.",
    dimensions: "480 × 120 px",
    fileSize: "13.8 KB",
    format: "SVG / Vector",
    status: "configured",
    lastUpdated: "2 days ago",
    version: "v3.2",
    previewBg: "bg-[#0F172A]",
    accentHex: "#FFFFFF",
    versions: [
      { version: "v3.2", date: "Oct 29, 2026", author: "Elena Rostova", note: "Pure white #FFFFFF paths for dark headers" },
    ],
  },
  {
    id: "ast-light-logo",
    name: "Light Monochrome Logo",
    category: "logo",
    description: "Single-tone watermark version for certificates, PDFs, and invoice headers.",
    dimensions: "480 × 120 px",
    fileSize: "11.4 KB",
    format: "SVG / Vector",
    status: "configured",
    lastUpdated: "2 weeks ago",
    version: "v2.0",
    previewBg: "bg-blue-600",
    accentHex: "#FFFFFF",
    versions: [
      { version: "v2.0", date: "Oct 15, 2026", author: "Sarah Chen", note: "Monochrome vector export" },
    ],
  },
  {
    id: "ast-square-logo",
    name: "Square Avatar Mark",
    category: "logo",
    description: "1:1 brand glyph used in sidebar switchers, program tables, and Slack/Jira webhooks.",
    dimensions: "512 × 512 px",
    fileSize: "8.6 KB",
    format: "SVG / PNG",
    status: "configured",
    lastUpdated: "1 month ago",
    version: "v4.0",
    previewBg: "bg-[#0F172A]",
    accentHex: "#38BDF8",
    versions: [
      { version: "v4.0", date: "Sep 28, 2026", author: "Elena Rostova", note: "Rounded 24% squircle safe zone" },
    ],
  },
  {
    id: "ast-favicon",
    name: "Favicon & App Icon",
    category: "icon",
    description: "Multi-resolution browser tab icon for hosted disclosure and Hall of Fame portals.",
    dimensions: "64 × 64 px",
    fileSize: "4.1 KB",
    format: "ICO / PNG",
    status: "configured",
    lastUpdated: "1 month ago",
    version: "v1.4",
    previewBg: "bg-slate-100",
    accentHex: "#2563EB",
    versions: [
      { version: "v1.4", date: "Sep 20, 2026", author: "Alex Vance", note: "Added 32x32 and 64x64 crisp layers" },
    ],
  },
  {
    id: "ast-cover-image",
    name: "Organization Cover Image",
    category: "banner",
    description: "Wide hero backdrop displayed at the top of the Public Organization Profile.",
    dimensions: "1920 × 480 px",
    fileSize: "184 KB",
    format: "WebP / PNG",
    status: "configured",
    lastUpdated: "5 days ago",
    version: "v2.3",
    previewBg: "bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900",
    accentHex: "#60A5FA",
    versions: [
      { version: "v2.3", date: "Oct 26, 2026", author: "Elena Rostova", note: "Updated cloud topology mesh artwork" },
    ],
  },
  {
    id: "ast-program-banner",
    name: "Program Header Banner",
    category: "banner",
    description: "Displayed on Public & Private Bug Bounty engagement pages.",
    dimensions: "1600 × 400 px",
    fileSize: "142 KB",
    format: "WebP",
    status: "configured",
    lastUpdated: "1 week ago",
    version: "v1.9",
    previewBg: "bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900",
    accentHex: "#38BDF8",
    versions: [
      { version: "v1.9", date: "Oct 22, 2026", author: "Sarah Chen", note: "Added zero-trust architectural grid" },
    ],
  },
  {
    id: "ast-hof-banner",
    name: "Hall of Fame Banner",
    category: "banner",
    description: "Celebratory header graphic for the Researcher Hall of Fame & Recognition page.",
    dimensions: "1600 × 360 px",
    fileSize: "156 KB",
    format: "WebP",
    status: "configured",
    lastUpdated: "3 weeks ago",
    version: "v1.2",
    previewBg: "bg-gradient-to-r from-amber-950 via-slate-900 to-blue-950",
    accentHex: "#FBBF24",
    versions: [
      { version: "v1.2", date: "Oct 10, 2026", author: "Marcus Brody", note: "Gold crest accent banner" },
    ],
  },
  {
    id: "ast-email-header",
    name: "Email Notification Header",
    category: "banner",
    description: "Top masthead embedded in automated triage, bounty award, and invitation emails.",
    dimensions: "1200 × 240 px",
    fileSize: "48 KB",
    format: "PNG (Retina)",
    status: "configured",
    lastUpdated: "2 weeks ago",
    version: "v2.1",
    previewBg: "bg-[#1E293B]",
    accentHex: "#38BDF8",
    versions: [
      { version: "v2.1", date: "Oct 18, 2026", author: "Sarah Chen", note: "Tested across Apple Mail, Gmail, Outlook" },
    ],
  },
  {
    id: "ast-og-image",
    name: "Open Graph Social Card",
    category: "social",
    description: "Preview card shown when program links are shared on X, LinkedIn, Slack, or Discord.",
    dimensions: "1200 × 630 px",
    fileSize: "Auto-Generated",
    format: "Dynamic PNG",
    status: "missing",
    lastUpdated: "Using fallback",
    version: "v1.0",
    previewBg: "bg-gradient-to-tr from-slate-900 to-blue-900",
    accentHex: "#94A3B8",
    versions: [
      { version: "v1.0", date: "Sep 01, 2026", author: "System", note: "Default dynamic OpenGraph card" },
    ],
  },
];

export const INITIAL_PUBLIC_PROFILE: PublicProfileConfig = {
  aboutUs:
    "Northwind Cloud operates global multi-region cloud infrastructure, Kubernetes control planes, and high-throughput API gateways for enterprise organizations.",
  mission:
    "To build verifiable, transparent, and resilient cloud primitives where security is engineered into every commit and continuously validated by the world's top security researchers.",
  securityPhilosophy:
    "We believe defense-in-depth requires open collaboration with the independent security research community. Every valid report is treated as an engineering priority with direct access to our principal security architects.",
  recognitionPolicy:
    "Researchers who submit valid, in-scope vulnerabilities receive competitive monetary bounties within 48 hours of validation, permanent attribution on our Hall of Fame, and cryptographic achievement certificates.",
  responseExpectations:
    "Our 24/7 PSIRT & Managed Triage desk acknowledges critical reports within 1 hour, completes technical reproduction within 24 hours, and awards bounties immediately upon triage confirmation.",
  avgResponseTime: "< 1.4 Hours First Response",
  languagesSupported: ["English", "Japanese", "German", "French"],
  websiteUrl: "https://northwindcloud.com",
  careersUrl: "https://northwindcloud.com/careers/security",
  securityBlogUrl: "https://security.northwindcloud.com",
  githubHandle: "github.com/northwindcloud",
  twitterHandle: "@NorthwindSec",
  linkedinUrl: "linkedin.com/company/northwind-cloud",
  contactEmail: "security@northwindcloud.com",
};

export const INITIAL_PROGRAM_BRANDING: ProgramBrandingConfig = {
  accentColor: "#2563EB",
  secondaryColor: "#0F172A",
  cardStyle: "elevated",
  bannerTheme: "cobalt-grid",
  welcomeMessage:
    "Welcome to the Northwind Cloud Bug Bounty Program. We reward high-impact research targeting our production APIs, Kubernetes isolation boundaries, and identity federation services.",
  researcherGuidelines:
    "1. Always include your X-Northwind-Researcher header in automated traffic.\n2. Do not access or exfiltrate customer tenant data; use your dedicated sandbox tenant.\n3. Provide clear proof-of-concept reproduction steps or curl/HTTP traces.",
  recognitionMessage:
    "Thank you for helping secure Northwind Cloud. Valid findings qualify for our fast-track payout pool ($500 – $25,000) and Hall of Fame induction.",
  showLiveSlaMetrics: true,
  showTopBountyRange: true,
  featuredBadgeText: "Fast-Track Payouts · Gold Safe Harbor",
};

export const INITIAL_HALL_OF_FAME: HallOfFameConfig = {
  pageTitle: "Northwind Cloud Security Hall of Fame",
  introMessage:
    "We proudly recognize the independent security researchers whose ingenuity and responsible disclosures have strengthened the security posture of Northwind Cloud and our global customers.",
  recognitionCriteria:
    "Inductees have reported at least one validated Medium, High, or Critical vulnerability in accordance with our Responsible Disclosure Policy.",
  showQuarterLeaderboard: true,
  showCriticalFinderBadges: true,
  certificateTitle: "Certificate of Security Excellence & Responsible Disclosure",
  certificateSignatory: "Elena Rostova",
  certificateSignatoryRole: "VP of Security Engineering & CISO, Northwind Cloud",
  certificateSealStyle: "gold-verified",
  featuredResearchers: [
    {
      handle: "vortex_sec",
      name: "Viktor Petrov",
      country: "Estonia",
      findingsCount: 14,
      impactTier: "Critical (CVSS 9.9)",
      badge: "2026 MVP Researcher",
    },
    {
      handle: "0xCyberNinja",
      name: "Kenji Sato",
      country: "Japan",
      findingsCount: 11,
      impactTier: "Critical (CVSS 9.8)",
      badge: "RCE Specialist",
    },
    {
      handle: "bytehunter",
      name: "Liam O'Connor",
      country: "Ireland",
      findingsCount: 9,
      impactTier: "High (CVSS 8.6)",
      badge: "Auth & IAM Sentinel",
    },
    {
      handle: "alice_crypto",
      name: "Alice Dubois",
      country: "France",
      findingsCount: 8,
      impactTier: "High (CVSS 8.1)",
      badge: "Cryptography & TLS",
    },
  ],
};

export const INITIAL_DISCLOSURE_PAGE: DisclosurePageConfig = {
  disclosureStatement:
    "Northwind Cloud welcomes coordinated vulnerability reports from security researchers, customers, and industry partners. If you believe you have discovered a security vulnerability in any Northwind Cloud asset, please submit it through our encrypted intake portal.",
  safeHarborLevel: "Full Gold Standard Safe Harbor",
  safeHarborStatement:
    "Activities conducted in good faith and in accordance with this policy are considered authorized conduct under the Computer Fraud and Abuse Act (CFAA), DMCA Section 1201, and international equivalents. Northwind Cloud will not initiate legal action against researchers who abide by these guidelines.",
  legalNotice:
    "Authorized testing must not degrade service availability (DoS/DDoS), involve social engineering of Northwind employees, or intentionally retain third-party data beyond minimum proof-of-concept requirements.",
  submissionInstructions:
    "Include affected asset hostname, vulnerability classification (CWE), step-by-step HTTP request/response logs, and assessment of real-world security impact.",
  responseSlaFirstAck: "Under 2 Hours (24/7 for Critical)",
  responseSlaTriage: "Within 24 Business Hours",
  responseSlaResolution: "7 Days (Critical) / 30 Days (High)",
  disclosureTimelineDays: 90,
  pgpFingerprint: "4F9A 82C1 E03B 771D 99A0  5B2E C114 8830 D902 1E4F",
  securityTxtEnabled: true,
};

export const INITIAL_EMAIL_BRANDING: EmailBrandingConfig = {
  senderDisplayName: "Northwind Cloud PSIRT & Bug Bounty",
  replyToEmail: "security-triage@northwindcloud.com",
  headerStyle: "dark-enterprise",
  brandColor: "#2563EB",
  footerText:
    "This is an encrypted operational notification from Northwind Cloud Technologies Inc. (San Francisco, CA). Do not forward confidential vulnerability details outside authorized channels.",
  signatureName: "Northwind Cloud Security Response Team (PSIRT)",
  signatureRole: "24/7 Vulnerability Operations · Com Olho Verified Partner",
  supportContactEmail: "security@northwindcloud.com",
  includePgpFooter: true,
  includeSocialLinks: true,
};

export const INITIAL_BRAND_HISTORY: BrandVersionRecord[] = [
  {
    id: "ver-48",
    version: "v4.8",
    eventTitle: "Program Header Banner & Safe Harbor Updated",
    category: "banner",
    author: "Elena Rostova",
    authorRole: "Owner & CISO",
    timestamp: "14 minutes ago",
    changesSummary: "Published high-DPI cobalt mesh program banner and enabled Gold Standard CFAA Safe Harbor attestation.",
    snapshotAccent: "#2563EB",
    isCurrent: true,
  },
  {
    id: "ver-47",
    version: "v4.7",
    eventTitle: "Primary & Dark Mode Vector Logos Replaced",
    category: "logo",
    author: "Elena Rostova",
    authorRole: "Owner & CISO",
    timestamp: "2 days ago",
    changesSummary: "Uploaded optimized SVG lockups (14.2 KB) with improved contrast ratio for dark mode headers.",
    snapshotAccent: "#2563EB",
  },
  {
    id: "ver-46",
    version: "v4.6",
    eventTitle: "Email Notification Template & DKIM Signature Updated",
    category: "email",
    author: "Sarah Chen",
    authorRole: "Head of SecOps",
    timestamp: "1 week ago",
    changesSummary: "Added PGP fingerprint block to transactional researcher emails and updated reply-to address.",
    snapshotAccent: "#1D4ED8",
  },
  {
    id: "ver-45",
    version: "v4.5",
    eventTitle: "Public Profile Mission & SLA Expectations Revised",
    category: "identity",
    author: "Marcus Brody",
    authorRole: "AppSec Lead",
    timestamp: "2 weeks ago",
    changesSummary: "Updated published first-response SLA target from 4 hours to < 1.4 hours following Automation Center launch.",
    snapshotAccent: "#1E40AF",
  },
  {
    id: "ver-44",
    version: "v4.4",
    eventTitle: "Hall of Fame Certificate Signatory Configured",
    category: "theme",
    author: "Elena Rostova",
    authorRole: "Owner & CISO",
    timestamp: "1 month ago",
    changesSummary: "Configured automated PDF certificate issuance with digital CISO signature and gold verification seal.",
    snapshotAccent: "#0F172A",
  },
];

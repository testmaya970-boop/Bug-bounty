"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Palette,
  Globe,
  ShieldCheck,
  Sparkles,
  Upload,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
  Building2,
  Mail,
  Trophy,
  FileText,
  Layers,
  Check,
  RefreshCw,
  Trash2,
  Download,
  ExternalLink,
  Smartphone,
  Monitor,
  Lock,
  Award,
  Clock,
  Sliders,
  Plus,
  XCircle,
  Copy,
  ArrowRight,
  BadgeCheck,
  Bug,
  Users,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  INITIAL_BRAND_HEALTH,
  INITIAL_IDENTITY,
  INITIAL_VISUAL_ASSETS,
  INITIAL_PUBLIC_PROFILE,
  INITIAL_PROGRAM_BRANDING,
  INITIAL_HALL_OF_FAME,
  INITIAL_DISCLOSURE_PAGE,
  INITIAL_EMAIL_BRANDING,
  INITIAL_BRAND_HISTORY,
  type OrganizationIdentityState,
  type VisualAssetItem,
  type PublicProfileConfig,
  type ProgramBrandingConfig,
  type HallOfFameConfig,
  type DisclosurePageConfig,
  type EmailBrandingConfig,
  type BrandVersionRecord,
} from "../../../lib/mock/brand-center";

interface BrandCenterProps {
  organizationId: string;
  organizationName: string;
}

type BrandTab =
  | "overview"
  | "identity"
  | "assets"
  | "public-profile"
  | "program"
  | "hall-of-fame"
  | "disclosure"
  | "email"
  | "preview"
  | "history";

type PreviewSurface =
  | "public-profile"
  | "program-listing"
  | "program-page"
  | "hall-of-fame"
  | "disclosure-page"
  | "email";

const ACCENT_PRESETS = [
  { label: "Enterprise Cobalt", hex: "#2563EB" },
  { label: "Indigo Defense", hex: "#4F46E5" },
  { label: "Emerald Sentinel", hex: "#059669" },
  { label: "Cyber Violet", hex: "#7C3AED" },
  { label: "Obsidian Slate", hex: "#0F172A" },
  { label: "Crimson RedTeam", hex: "#DC2626" },
];

export function BrandCenter({ organizationId, organizationName }: BrandCenterProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<BrandTab>("overview");
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("public-profile");
  const [emailDevice, setEmailDevice] = useState<"desktop" | "mobile">("desktop");

  React.useEffect(() => {
    const tab = searchParams.get("tab") as BrandTab | null;
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Editable Brand State
  const [identity, setIdentity] = useState<OrganizationIdentityState>({
    ...INITIAL_IDENTITY,
    organizationName: organizationName || INITIAL_IDENTITY.organizationName,
  });
  const [assets, setAssets] = useState<VisualAssetItem[]>(INITIAL_VISUAL_ASSETS);
  const [publicProfile, setPublicProfile] = useState<PublicProfileConfig>(INITIAL_PUBLIC_PROFILE);
  const [programBrand, setProgramBrand] = useState<ProgramBrandingConfig>(INITIAL_PROGRAM_BRANDING);
  const [hofConfig, setHofConfig] = useState<HallOfFameConfig>(INITIAL_HALL_OF_FAME);
  const [disclosureConfig, setDisclosureConfig] = useState<DisclosurePageConfig>(INITIAL_DISCLOSURE_PAGE);
  const [emailConfig, setEmailConfig] = useState<EmailBrandingConfig>(INITIAL_EMAIL_BRANDING);
  const [history, setHistory] = useState<BrandVersionRecord[]>(INITIAL_BRAND_HISTORY);

  // Modals & Drawers
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<VisualAssetItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTargetAssetId, setUploadTargetAssetId] = useState<string>("ast-og-image");
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("14 minutes ago");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Computed metrics
  const configuredAssetsCount = assets.filter((a) => a.status === "configured").length;
  const completionPct = Math.min(100, Math.round((configuredAssetsCount / assets.length) * 40 + 60));

  // Handlers
  const handlePublishChanges = () => {
    const newVersionNum = `v4.${history.length + 4}`;
    const newRecord: BrandVersionRecord = {
      id: `ver-${Date.now()}`,
      version: newVersionNum,
      eventTitle: "Published Brand & Identity Configuration",
      category: "identity",
      author: "Elena Rostova",
      authorRole: "Owner & CISO",
      timestamp: "Just now",
      changesSummary: `Synchronized ${identity.displayName} branding (${programBrand.accentColor}) across Public Directory, Programs, Hall of Fame, and Disclosure pages.`,
      snapshotAccent: programBrand.accentColor,
      isCurrent: true,
    };

    setHistory((prev) => [
      newRecord,
      ...prev.map((item) => ({ ...item, isCurrent: false })),
    ]);
    setLastUpdatedLabel("Just now");
    showToast(`Published brand snapshot ${newVersionNum} across all researcher-facing surfaces.`);
  };

  const handleRestoreVersion = (record: BrandVersionRecord) => {
    setProgramBrand((prev) => ({ ...prev, accentColor: record.snapshotAccent }));
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        isCurrent: item.id === record.id,
      })),
    );
    setLastUpdatedLabel(`Restored ${record.version}`);
    showToast(`Restored brand identity to ${record.version} (${record.eventTitle}).`);
  };

  const handleReplaceAsset = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              status: "configured",
              lastUpdated: "Just now",
              fileSize: a.fileSize === "Auto-Generated" ? "96.4 KB" : a.fileSize,
              version: `v${parseInt(a.version.replace("v", ""), 10) + 1}.0`,
              versions: [
                {
                  version: `v${parseInt(a.version.replace("v", ""), 10) + 1}.0`,
                  date: "Nov 01, 2026",
                  author: "Elena Rostova",
                  note: "Uploaded high-resolution verified asset via Brand Center",
                },
                ...a.versions,
              ],
            }
          : a,
      ),
    );
    setIsUploadModalOpen(false);
    showToast("Visual asset uploaded, optimized, and synced to CDN.");
  };

  const handleRemoveAsset = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? { ...a, status: "missing", lastUpdated: "Removed (Using fallback)" }
          : a,
      ),
    );
    showToast("Asset removed. Default platform fallback enabled.");
  };

  const brandMonogram = (identity.displayName || "NC")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-semibold text-[#111827] shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="size-4 text-blue-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HERO SECTION */}
      <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: programBrand.accentColor }}
            >
              <Palette className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[#111827]">Brand Center</h1>
                <span className="text-xs font-semibold text-emerald-700">· Verified Identity</span>
              </div>
              <p className="text-xs text-[#667085] truncate">
                Manage your organization&apos;s identity across the Com Olho ecosystem.
              </p>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center lg:justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPreviewSurface("public-profile");
                setActiveTab("preview");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-xs hover:bg-[#F9FAFB] transition-colors whitespace-nowrap"
            >
              <Eye className="size-3.5 text-blue-600" />
              <span>Preview Public Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-xs hover:bg-[#F9FAFB] transition-colors whitespace-nowrap"
            >
              <Upload className="size-3.5 text-[#667085]" />
              <span>Upload Assets</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-xs hover:bg-[#F9FAFB] transition-colors whitespace-nowrap"
            >
              <History className="size-3.5 text-[#667085]" />
              <span>Restore Version</span>
            </button>

            <button
              type="button"
              onClick={handlePublishChanges}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Check className="size-3.5" />
              <span>Publish Changes</span>
            </button>
          </div>
        </div>

        {/* Hero Quick Metrics Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-5 border-t border-[#F2F4F7]">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Profile Completion</span>
            <div className="text-lg font-bold text-[#111827]">{completionPct}%</div>
            <div className="text-[11px] text-emerald-600 font-semibold">Enterprise Ready</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Logo Status</span>
            <div className="text-lg font-bold text-emerald-600">Verified SVG</div>
            <div className="text-[11px] text-[#667085]">Light + Dark variants</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Verified Brand</span>
            <div className="text-lg font-bold text-blue-600">DNS + EV</div>
            <div className="text-[11px] text-[#667085]">northwindcloud.com</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Public Programs</span>
            <div className="text-lg font-bold text-[#111827]">5 Active</div>
            <div className="text-[11px] text-[#667085]">4 Bounty · 1 VDP</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Brand Assets</span>
            <div className="text-lg font-bold text-purple-700">
              {configuredAssetsCount} / {assets.length}
            </div>
            <div className="text-[11px] text-[#667085]">Retina CDN cached</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Last Updated</span>
            <div className="text-lg font-bold text-[#111827]">{lastUpdatedLabel}</div>
            <div className="text-[11px] text-[#667085]">By Elena Rostova</div>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E7EAF0] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: "overview", label: "Brand Overview", icon: Layers },
          { id: "identity", label: "Organization Identity", icon: Building2 },
          { id: "assets", label: `Visual Assets (${configuredAssetsCount}/${assets.length})`, icon: Palette },
          { id: "public-profile", label: "Public Profile", icon: Globe },
          { id: "program", label: "Program Branding", icon: ShieldCheck },
          { id: "hall-of-fame", label: "Hall of Fame", icon: Trophy },
          { id: "disclosure", label: "Responsible Disclosure", icon: Lock },
          { id: "email", label: "Email Branding", icon: Mail },
          { id: "preview", label: "Live Brand Preview", icon: Eye },
          { id: "history", label: `Version History (${history.length})`, icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as BrandTab)}
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
      {/* TAB 1: BRAND OVERVIEW & HEALTH */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Brand Health Cards */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#111827]">Brand Health & Readiness Posture</h2>
                <p className="text-xs text-[#667085]">
                  Automated quality and consistency checks across all researcher-facing touchpoints.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INITIAL_BRAND_HEALTH.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col justify-between rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#667085]">{card.title}</span>
                      {card.status === "healthy" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          <span>Healthy</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle className="size-3.5 text-amber-600" />
                          <span>Optional Fix</span>
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-bold text-[#111827]">{card.metric}</div>
                    <p className="text-xs text-[#475467] leading-relaxed">{card.recommendation}</p>
                  </div>

                  <div className="pt-3 border-t border-[#F2F4F7] flex items-center justify-between">
                    <span className="text-[11px] text-[#98A2B3]">Real-time check</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab(card.targetTab as BrandTab)}
                      className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <span>{card.quickFixLabel}</span>
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Side-by-Side Live Surface Summary & Quick Editor */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 Cols: Live Public Directory Card & Header Preview */}
            <div className="lg:col-span-7 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">Live Researcher-Facing Identity Snapshot</h3>
                  <p className="text-xs text-[#667085]">
                    How {identity.displayName} appears in the Com Olho Public Directory and Program Header.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open 6-Surface Preview →
                </button>
              </div>

              {/* Simulated Public Hero Card */}
              <div className="overflow-hidden rounded-xl border border-[#E7EAF0] bg-[#F8FAFC]">
                <div
                  className="h-28 w-full p-5 flex items-end justify-between text-white relative"
                  style={{
                    background: `linear-gradient(135deg, ${programBrand.secondaryColor} 0%, ${programBrand.accentColor} 100%)`,
                  }}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 font-black text-lg text-white shadow-lg">
                      {brandMonogram}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-white">{identity.displayName}</h4>
                        <BadgeCheck className="size-4 text-sky-300" />
                      </div>
                      <p className="text-xs text-white/80">{identity.industry} · {identity.headquarters}</p>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-semibold text-emerald-300">{publicProfile.avgResponseTime}</div>
                    <div className="text-[11px] text-white/75">{disclosureConfig.safeHarborLevel}</div>
                  </div>
                </div>

                <div className="p-5 bg-white space-y-3">
                  <p className="text-xs text-[#344054] leading-relaxed">{identity.shortDescription}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F2F4F7] text-xs text-[#667085]">
                    <div>
                      <span>Website: </span>
                      <span className="font-semibold text-[#111827]">{identity.website}</span>
                      <span className="mx-2">·</span>
                      <span>Security: </span>
                      <span className="font-semibold text-[#111827]">{identity.securityContact}</span>
                    </div>
                    <span className="font-semibold" style={{ color: programBrand.accentColor }}>
                      $500 – $25,000 Bounties
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Surface Coverage Checklist */}
            <div className="lg:col-span-5 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#111827]">Ecosystem Brand Surfaces</h3>
                <p className="text-xs text-[#667085]">Jump directly to customize any researcher touchpoint.</p>
              </div>

              <div className="divide-y divide-[#F2F4F7]">
                {[
                  {
                    label: "Organization Identity & Contacts",
                    desc: "Legal name, PSIRT emails, headquarters, languages",
                    tab: "identity",
                    state: "Verified",
                  },
                  {
                    label: "Visual Assets & Vector Logos",
                    desc: `${configuredAssetsCount} of ${assets.length} logos, banners & icons active`,
                    tab: "assets",
                    state: `${configuredAssetsCount}/${assets.length} Ready`,
                  },
                  {
                    label: "Public Organization Profile",
                    desc: "Mission, security philosophy & response SLA",
                    tab: "public-profile",
                    state: "Published",
                  },
                  {
                    label: "Bug Bounty Program Branding",
                    desc: `Accent ${programBrand.accentColor}, welcome message & rules`,
                    tab: "program",
                    state: "Customized",
                  },
                  {
                    label: "Researcher Hall of Fame & Certificates",
                    desc: `Signed by ${hofConfig.certificateSignatory}`,
                    tab: "hall-of-fame",
                    state: "Active",
                  },
                  {
                    label: "Responsible Disclosure & Safe Harbor",
                    desc: `${disclosureConfig.disclosureTimelineDays}-day policy & security.txt`,
                    tab: "disclosure",
                    state: "Gold Standard",
                  },
                  {
                    label: "Transactional Email Templates",
                    desc: `Sender: ${emailConfig.senderDisplayName}`,
                    tab: "email",
                    state: "DKIM Aligned",
                  },
                ].map((surf) => (
                  <div
                    key={surf.tab}
                    onClick={() => setActiveTab(surf.tab as BrandTab)}
                    className="flex items-center justify-between py-2.5 cursor-pointer group"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-xs font-bold text-[#111827] group-hover:text-blue-600 transition-colors">
                        {surf.label}
                      </div>
                      <div className="text-[11px] text-[#667085] truncate">{surf.desc}</div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 shrink-0">{surf.state} →</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: ORGANIZATION IDENTITY */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "identity" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Editable Form (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Organization Identity & Core Metadata</h3>
              <p className="text-xs text-[#667085]">
                Authoritative corporate identity displayed across legal agreements, invoices, and public headers.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Organization Name</label>
                <input
                  type="text"
                  value={identity.organizationName}
                  onChange={(e) => setIdentity({ ...identity, organizationName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Legal Entity Name</label>
                <input
                  type="text"
                  value={identity.legalName}
                  onChange={(e) => setIdentity({ ...identity, legalName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Public Display Name</label>
                <input
                  type="text"
                  value={identity.displayName}
                  onChange={(e) => setIdentity({ ...identity, displayName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Industry Vertical</label>
                <input
                  type="text"
                  value={identity.industry}
                  onChange={(e) => setIdentity({ ...identity, industry: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-[#344054]">Short Tagline / Directory Summary</label>
                <input
                  type="text"
                  value={identity.shortDescription}
                  onChange={(e) => setIdentity({ ...identity, shortDescription: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-[#344054]">Long Organization Description</label>
                <textarea
                  rows={3}
                  value={identity.longDescription}
                  onChange={(e) => setIdentity({ ...identity, longDescription: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Corporate Headquarters</label>
                <input
                  type="text"
                  value={identity.headquarters}
                  onChange={(e) => setIdentity({ ...identity, headquarters: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Primary Website</label>
                <input
                  type="url"
                  value={identity.website}
                  onChange={(e) => setIdentity({ ...identity, website: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Support Email</label>
                <input
                  type="email"
                  value={identity.supportEmail}
                  onChange={(e) => setIdentity({ ...identity, supportEmail: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Security Operations Contact</label>
                <input
                  type="email"
                  value={identity.securityContact}
                  onChange={(e) => setIdentity({ ...identity, securityContact: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Responsible Disclosure (PSIRT) Email</label>
                <input
                  type="email"
                  value={identity.disclosureContact}
                  onChange={(e) => setIdentity({ ...identity, disclosureContact: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Operational Time Zone</label>
                <select
                  value={identity.timeZone}
                  onChange={(e) => setIdentity({ ...identity, timeZone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827] focus:border-blue-600 focus:outline-none"
                >
                  <option>America/Los_Angeles (PST / UTC-8)</option>
                  <option>America/New_York (EST / UTC-5)</option>
                  <option>Europe/London (GMT / UTC+0)</option>
                  <option>Europe/Berlin (CET / UTC+1)</option>
                  <option>Asia/Tokyo (JST / UTC+9)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Save & Sync Identity
              </button>
            </div>
          </div>

          {/* Real-Time Identity Card Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Live Identity Card Preview
                </span>
                <span className="text-xs font-semibold text-emerald-700">Real-Time Sync</span>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-5 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl font-black text-base text-white shadow-sm"
                    style={{ backgroundColor: programBrand.accentColor }}
                  >
                    {brandMonogram}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-sm text-[#111827] truncate">{identity.displayName}</h4>
                      <BadgeCheck className="size-4 text-blue-600 shrink-0" />
                    </div>
                    <div className="text-xs text-[#667085]">{identity.legalName}</div>
                    <div className="text-[11px] text-[#475467] mt-0.5">
                      {identity.industry} · {identity.headquarters}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#344054] leading-relaxed">{identity.shortDescription}</p>

                <div className="rounded-lg bg-white border border-[#E7EAF0] p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Official Website:</span>
                    <span className="font-medium text-blue-600">{identity.website}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Security Contact:</span>
                    <span className="font-mono text-[#111827]">{identity.securityContact}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#667085]">PSIRT Intake:</span>
                    <span className="font-mono text-[#111827]">{identity.disclosureContact}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Languages:</span>
                    <span className="font-medium text-[#111827]">{identity.languages.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Time Zone:</span>
                    <span className="text-[#475467]">{identity.timeZone}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: VISUAL ASSETS MANAGER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "assets" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Visual Brand Assets Repository</h3>
              <p className="text-xs text-[#667085]">
                Manage vector logos, dark/light lockups, favicons, program banners, email headers, and Open Graph cards.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Upload className="size-3.5" />
              <span>Upload New Asset</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col justify-between rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="space-y-3">
                  {/* Visual Preview Box */}
                  <div
                    className={cn(
                      "h-28 w-full rounded-xl border border-[#E7EAF0] flex items-center justify-center p-4 relative overflow-hidden",
                      asset.previewBg,
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex size-10 items-center justify-center rounded-xl font-black text-sm shadow-sm"
                        style={{
                          backgroundColor: asset.accentHex === "#FFFFFF" ? "rgba(255,255,255,0.18)" : asset.accentHex,
                          color: "#FFFFFF",
                        }}
                      >
                        {brandMonogram}
                      </div>
                      {asset.id !== "ast-square-logo" && asset.id !== "ast-favicon" && (
                        <span
                          className={cn(
                            "font-bold text-sm tracking-tight",
                            asset.previewBg.includes("slate-50") || asset.previewBg.includes("slate-100")
                              ? "text-[#0F172A]"
                              : "text-white",
                          )}
                        >
                          {identity.displayName}
                        </span>
                      )}
                    </div>

                    <span className="absolute top-2.5 right-2.5 rounded bg-black/50 backdrop-blur-xs px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
                      {asset.version} · {asset.format}
                    </span>
                  </div>

                  {/* Asset Metadata */}
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-[#111827]">{asset.name}</h4>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          asset.status === "configured" ? "text-emerald-700" : "text-amber-700",
                        )}
                      >
                        {asset.status === "configured" ? "Configured" : "Fallback Active"}
                      </span>
                    </div>
                    <p className="text-xs text-[#667085] mt-0.5">{asset.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#667085] pt-1 border-t border-[#F2F4F7]">
                    <span>Dimensions: <strong className="text-[#344054]">{asset.dimensions}</strong></span>
                    <span>·</span>
                    <span>Size: <strong className="text-[#344054]">{asset.fileSize}</strong></span>
                    <span>·</span>
                    <span>Updated: {asset.lastUpdated}</span>
                  </div>
                </div>

                {/* Asset Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#F2F4F7]">
                  <button
                    type="button"
                    onClick={() => setSelectedAssetHistory(asset)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#475467] hover:text-[#111827]"
                  >
                    <History className="size-3.5" />
                    <span>Version History ({asset.versions.length})</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTargetAssetId(asset.id);
                        setIsUploadModalOpen(true);
                      }}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                    >
                      Replace
                    </button>
                    {asset.status === "configured" && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(asset.id)}
                        className="rounded-lg border border-transparent px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: PUBLIC PROFILE CONFIGURATOR */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "public-profile" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Editor (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Public Profile Narrative & Researcher Expectations</h3>
              <p className="text-xs text-[#667085]">
                Configure how researchers evaluate your security maturity, mission, and response commitments.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">About Us</label>
                <textarea
                  rows={2}
                  value={publicProfile.aboutUs}
                  onChange={(e) => setPublicProfile({ ...publicProfile, aboutUs: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Security Mission Statement</label>
                <textarea
                  rows={2}
                  value={publicProfile.mission}
                  onChange={(e) => setPublicProfile({ ...publicProfile, mission: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Security Philosophy</label>
                <textarea
                  rows={2}
                  value={publicProfile.securityPhilosophy}
                  onChange={(e) => setPublicProfile({ ...publicProfile, securityPhilosophy: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Recognition & Bounty Policy</label>
                <textarea
                  rows={2}
                  value={publicProfile.recognitionPolicy}
                  onChange={(e) => setPublicProfile({ ...publicProfile, recognitionPolicy: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-semibold text-[#344054]">Published Avg Response Time</label>
                  <input
                    type="text"
                    value={publicProfile.avgResponseTime}
                    onChange={(e) => setPublicProfile({ ...publicProfile, avgResponseTime: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">Security Careers URL</label>
                  <input
                    type="url"
                    value={publicProfile.careersUrl}
                    onChange={(e) => setPublicProfile({ ...publicProfile, careersUrl: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">GitHub Organization</label>
                  <input
                    type="text"
                    value={publicProfile.githubHandle}
                    onChange={(e) => setPublicProfile({ ...publicProfile, githubHandle: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">X / Twitter Security Handle</label>
                  <input
                    type="text"
                    value={publicProfile.twitterHandle}
                    onChange={(e) => setPublicProfile({ ...publicProfile, twitterHandle: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Update Public Profile
              </button>
            </div>
          </div>

          {/* Right Live Preview (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                Real-Time Public Profile Preview
              </span>
              <span className="text-xs font-semibold text-blue-600">comolho.io/org/northwind</span>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-sm text-[#111827]">About {identity.displayName}</div>
                <p className="text-[#475467] leading-relaxed">{publicProfile.aboutUs}</p>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-[#111827]">Our Security Philosophy</div>
                <p className="text-[#475467] leading-relaxed">{publicProfile.securityPhilosophy}</p>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-[#111827]">Recognition & Rewards</div>
                <p className="text-[#475467] leading-relaxed">{publicProfile.recognitionPolicy}</p>
              </div>

              <div className="rounded-lg bg-white border border-[#E7EAF0] p-3 space-y-1.5">
                <div className="font-semibold text-[#111827]">Response Commitment: {publicProfile.avgResponseTime}</div>
                <p className="text-[11px] text-[#667085]">{publicProfile.responseExpectations}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E7EAF0] text-[11px] font-semibold text-blue-600">
                <span>{publicProfile.githubHandle}</span>
                <span>·</span>
                <span>{publicProfile.twitterHandle}</span>
                <span>·</span>
                <span>Careers</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: PROGRAM BRANDING */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "program" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Configurator (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Bug Bounty Program Branding</h3>
              <p className="text-xs text-[#667085]">
                Customize program cards, accent colors, researcher welcome messages, and submission guidelines.
              </p>
            </div>

            {/* Accent Color Picker */}
            <div className="space-y-2 text-xs">
              <label className="font-semibold text-[#344054]">Program Accent Color</label>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setProgramBrand({ ...programBrand, accentColor: preset.hex })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                      programBrand.accentColor === preset.hex
                        ? "border-[#111827] bg-slate-50 shadow-xs"
                        : "border-[#E7EAF0] bg-white hover:bg-[#F9FAFB]",
                    )}
                  >
                    <span className="size-3.5 rounded-full" style={{ backgroundColor: preset.hex }} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Featured Program Highlight Text</label>
                <input
                  type="text"
                  value={programBrand.featuredBadgeText}
                  onChange={(e) => setProgramBrand({ ...programBrand, featuredBadgeText: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Custom Researcher Welcome Message</label>
                <textarea
                  rows={3}
                  value={programBrand.welcomeMessage}
                  onChange={(e) => setProgramBrand({ ...programBrand, welcomeMessage: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Researcher Rules of Engagement Summary</label>
                <textarea
                  rows={3}
                  value={programBrand.researcherGuidelines}
                  onChange={(e) => setProgramBrand({ ...programBrand, researcherGuidelines: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs font-mono text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Submission Thank-You & Recognition Message</label>
                <textarea
                  rows={2}
                  value={programBrand.recognitionMessage}
                  onChange={(e) => setProgramBrand({ ...programBrand, recognitionMessage: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Save Program Branding
              </button>
            </div>
          </div>

          {/* Right Program Card Preview (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Live Program Card & Brief Preview
            </span>

            <div className="overflow-hidden rounded-2xl border border-[#E7EAF0] bg-white shadow-md">
              <div
                className="p-5 text-white space-y-2"
                style={{
                  background: `linear-gradient(135deg, #0F172A 0%, ${programBrand.accentColor} 100%)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-white/15 font-black text-sm text-white">
                      {brandMonogram}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{identity.displayName} Core Bounty</div>
                      <div className="text-[11px] text-white/80">{programBrand.featuredBadgeText}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3 text-xs">
                <p className="text-[#344054] leading-relaxed">{programBrand.welcomeMessage}</p>
                <div className="rounded-lg bg-slate-50 border border-[#E7EAF0] p-3 font-mono text-[11px] text-[#475467] whitespace-pre-line">
                  {programBrand.researcherGuidelines}
                </div>
                <div className="pt-2 border-t border-[#F2F4F7] flex items-center justify-between">
                  <span className="text-[#667085]">Critical Tier Reward</span>
                  <span className="font-bold text-sm" style={{ color: programBrand.accentColor }}>
                    $10,000 – $25,000 USD
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 6: HALL OF FAME & CERTIFICATE BRANDING */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "hall-of-fame" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Configurator (6 cols) */}
          <div className="lg:col-span-6 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Hall of Fame & Researcher Recognition</h3>
              <p className="text-xs text-[#667085]">
                Configure public thank-you leaderboards and verifiable achievement certificates.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Hall of Fame Page Title</label>
                <input
                  type="text"
                  value={hofConfig.pageTitle}
                  onChange={(e) => setHofConfig({ ...hofConfig, pageTitle: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Introductory Message</label>
                <textarea
                  rows={3}
                  value={hofConfig.introMessage}
                  onChange={(e) => setHofConfig({ ...hofConfig, introMessage: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Qualification & Induction Criteria</label>
                <textarea
                  rows={2}
                  value={hofConfig.recognitionCriteria}
                  onChange={(e) => setHofConfig({ ...hofConfig, recognitionCriteria: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-semibold text-[#344054]">Certificate Signatory Name</label>
                  <input
                    type="text"
                    value={hofConfig.certificateSignatory}
                    onChange={(e) => setHofConfig({ ...hofConfig, certificateSignatory: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">Signatory Title</label>
                  <input
                    type="text"
                    value={hofConfig.certificateSignatoryRole}
                    onChange={(e) => setHofConfig({ ...hofConfig, certificateSignatoryRole: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Save Hall of Fame Branding
              </button>
            </div>
          </div>

          {/* Right Live Certificate & Hall of Fame Preview (6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Branded Researcher Certificate Preview
                </span>
                <span className="text-xs font-semibold text-amber-700">Cryptographically Signed PDF</span>
              </div>

              {/* Certificate Preview Card */}
              <div className="rounded-xl border-2 border-amber-300/80 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-6 text-white shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex size-9 items-center justify-center rounded-lg font-black text-xs text-white"
                      style={{ backgroundColor: programBrand.accentColor }}
                    >
                      {brandMonogram}
                    </div>
                    <div>
                      <div className="font-bold text-xs uppercase tracking-wider text-amber-300">
                        {identity.displayName}
                      </div>
                      <div className="text-[10px] text-white/70">Official Security Attribution</div>
                    </div>
                  </div>
                  <Trophy className="size-6 text-amber-400" />
                </div>

                <div className="space-y-1 text-center py-2">
                  <div className="text-[11px] uppercase tracking-widest text-amber-300/90 font-semibold">
                    {hofConfig.certificateTitle}
                  </div>
                  <div className="text-xs text-white/70">Proudly presented to</div>
                  <div className="text-lg font-black text-white">Viktor Petrov (@vortex_sec)</div>
                  <p className="text-[11px] text-white/80 max-w-md mx-auto">
                    For the responsible disclosure of a Critical severity vulnerability that helped protect {identity.displayName} infrastructure.
                  </p>
                </div>

                <div className="flex items-end justify-between border-t border-white/15 pt-3 text-[11px]">
                  <div>
                    <div className="font-bold text-white">{hofConfig.certificateSignatory}</div>
                    <div className="text-white/70 text-[10px]">{hofConfig.certificateSignatoryRole}</div>
                  </div>
                  <div className="text-right font-mono text-[10px] text-amber-300">
                    SHA256: 9F82...441C
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 7: RESPONSIBLE DISCLOSURE PAGE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "disclosure" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Responsible Disclosure & Legal Safe Harbor</h3>
              <p className="text-xs text-[#667085]">
                Configure legal protection terms, coordinated disclosure timelines, and RFC 9116 `security.txt`.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Safe Harbor Protection Level</label>
                <select
                  value={disclosureConfig.safeHarborLevel}
                  onChange={(e) =>
                    setDisclosureConfig({
                      ...disclosureConfig,
                      safeHarborLevel: e.target.value as DisclosurePageConfig["safeHarborLevel"],
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827]"
                >
                  <option>Full Gold Standard Safe Harbor</option>
                  <option>Conditional Safe Harbor</option>
                  <option>Custom Legal Policy</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Disclosure Policy Statement</label>
                <textarea
                  rows={2}
                  value={disclosureConfig.disclosureStatement}
                  onChange={(e) => setDisclosureConfig({ ...disclosureConfig, disclosureStatement: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Legal Safe Harbor Clause (CFAA / DMCA Authorization)</label>
                <textarea
                  rows={3}
                  value={disclosureConfig.safeHarborStatement}
                  onChange={(e) => setDisclosureConfig({ ...disclosureConfig, safeHarborStatement: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="font-semibold text-[#344054]">Acknowledgement SLA</label>
                  <input
                    type="text"
                    value={disclosureConfig.responseSlaFirstAck}
                    onChange={(e) => setDisclosureConfig({ ...disclosureConfig, responseSlaFirstAck: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">Triage Validation SLA</label>
                  <input
                    type="text"
                    value={disclosureConfig.responseSlaTriage}
                    onChange={(e) => setDisclosureConfig({ ...disclosureConfig, responseSlaTriage: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">Embargo Window (Days)</label>
                  <input
                    type="number"
                    value={disclosureConfig.disclosureTimelineDays}
                    onChange={(e) =>
                      setDisclosureConfig({
                        ...disclosureConfig,
                        disclosureTimelineDays: parseInt(e.target.value, 10) || 90,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Publish Disclosure Policy
              </button>
            </div>
          </div>

          {/* Right RFC 9116 security.txt & Policy Preview (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                Generated /.well-known/security.txt
              </span>
              <button
                type="button"
                onClick={() => showToast("Copied RFC 9116 security.txt to clipboard.")}
                className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <Copy className="size-3" />
                <span>Copy</span>
              </button>
            </div>

            <pre className="rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed">
{`# Official RFC 9116 Security Policy for ${identity.legalName}
Contact: mailto:${identity.disclosureContact}
Contact: ${identity.website}/security/disclosure
Encryption: https://northwindcloud.com/.well-known/pgp-key.txt
Acknowledgments: https://comolho.io/org/northwind/hall-of-fame
Preferred-Languages: en, ja, de, fr
Canonical: https://northwindcloud.com/.well-known/security.txt
Policy: ${disclosureConfig.safeHarborLevel} (${disclosureConfig.disclosureTimelineDays}-Day Embargo)`}
            </pre>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-1 text-xs">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span>{disclosureConfig.safeHarborLevel}</span>
              </div>
              <p className="text-emerald-800 text-[11.5px] leading-relaxed">
                {disclosureConfig.safeHarborStatement}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 8: EMAIL BRANDING (With Desktop & Mobile Preview) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "email" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Email Config (6 cols) */}
          <div className="lg:col-span-6 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Transactional Email Branding</h3>
              <p className="text-xs text-[#667085]">
                Customize researcher notifications for report triage, bounty awards, and private invitations.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Sender Display Name</label>
                <input
                  type="text"
                  value={emailConfig.senderDisplayName}
                  onChange={(e) => setEmailConfig({ ...emailConfig, senderDisplayName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Reply-To PSIRT Address</label>
                <input
                  type="email"
                  value={emailConfig.replyToEmail}
                  onChange={(e) => setEmailConfig({ ...emailConfig, replyToEmail: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-semibold text-[#344054]">Sign-Off Team Name</label>
                  <input
                    type="text"
                    value={emailConfig.signatureName}
                    onChange={(e) => setEmailConfig({ ...emailConfig, signatureName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#344054]">Sign-Off Subtitle</label>
                  <input
                    type="text"
                    value={emailConfig.signatureRole}
                    onChange={(e) => setEmailConfig({ ...emailConfig, signatureRole: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#344054]">Confidentiality & Legal Footer</label>
                <textarea
                  rows={3}
                  value={emailConfig.footerText}
                  onChange={(e) => setEmailConfig({ ...emailConfig, footerText: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={() => showToast(`Dispatched test email to ${identity.securityContact}`)}
                className="rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
              >
                Send Test Email
              </button>
              <button
                type="button"
                onClick={handlePublishChanges}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Save Email Template
              </button>
            </div>
          </div>

          {/* Right Email Preview with Desktop / Mobile Switcher (6 cols) */}
          <div className="lg:col-span-6 rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                Live Email Notification Preview
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEmailDevice("desktop")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    emailDevice === "desktop" ? "bg-white text-[#111827] shadow-xs" : "text-[#667085]",
                  )}
                >
                  <Monitor className="size-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailDevice("mobile")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    emailDevice === "mobile" ? "bg-white text-[#111827] shadow-xs" : "text-[#667085]",
                  )}
                >
                  <Smartphone className="size-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="flex justify-center bg-[#F8FAFC] p-4 rounded-xl border border-[#E7EAF0]">
              <div
                className={cn(
                  "overflow-hidden rounded-xl border border-[#E7EAF0] bg-white shadow-sm transition-all",
                  emailDevice === "mobile" ? "w-[320px]" : "w-full",
                )}
              >
                <div className="border-b border-[#F2F4F7] bg-slate-50 px-4 py-2.5 text-[11px] text-[#475467]">
                  <div><strong>From:</strong> {emailConfig.senderDisplayName} &lt;{emailConfig.replyToEmail}&gt;</div>
                  <div><strong>Subject:</strong> [{identity.displayName}] Bounty Awarded: $7,500 USD for Report #CO-1049</div>
                </div>

                <div
                  className="px-5 py-4 text-white flex items-center justify-between"
                  style={{ backgroundColor: "#0F172A" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex size-8 items-center justify-center rounded-lg font-black text-xs text-white"
                      style={{ backgroundColor: programBrand.accentColor }}
                    >
                      {brandMonogram}
                    </div>
                    <span className="font-bold text-sm">{identity.displayName}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono">PGP VERIFIED</span>
                </div>

                <div className="p-5 space-y-3 text-xs text-[#344054]">
                  <p>Hi <strong>@0xCyberNinja</strong>,</p>
                  <p className="leading-relaxed">
                    {programBrand.recognitionMessage}
                  </p>
                  <div className="rounded-lg bg-slate-50 border border-[#E7EAF0] p-3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Finding:</span>
                      <span className="font-semibold text-[#111827]">CO-1049 (Critical RCE)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Bounty Award:</span>
                      <span className="font-bold text-emerald-700">$7,500.00 USD</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <span
                      className="inline-block rounded-lg px-4 py-2 text-xs font-semibold text-white"
                      style={{ backgroundColor: programBrand.accentColor }}
                    >
                      View Report & Download Certificate
                    </span>
                  </div>
                  <div className="pt-3 border-t border-[#F2F4F7] text-[11px] text-[#475467]">
                    <div className="font-bold text-[#111827]">{emailConfig.signatureName}</div>
                    <div>{emailConfig.signatureRole}</div>
                  </div>
                </div>

                <div className="bg-slate-50 px-5 py-3 text-[10px] text-[#667085] border-t border-[#F2F4F7] leading-relaxed">
                  {emailConfig.footerText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 9: LIVE 6-SURFACE BRAND PREVIEW HUB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          {/* Preview Surface Selector */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[#E7EAF0] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "public-profile", label: "1. Public Profile" },
                { id: "program-listing", label: "2. Program Directory Card" },
                { id: "program-page", label: "3. Program Engagement Page" },
                { id: "hall-of-fame", label: "4. Hall of Fame" },
                { id: "disclosure-page", label: "5. Disclosure Policy" },
                { id: "email", label: "6. Researcher Email" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPreviewSurface(s.id as PreviewSurface)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    previewSurface === s.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-[#F9FAFB] text-[#475467] hover:bg-[#F2F4F7] hover:text-[#111827]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <span className="text-xs font-semibold text-emerald-700">Live Real-Time Preview</span>
          </div>

          {/* Preview Viewport */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm">
            {previewSurface === "public-profile" && (
              <div className="space-y-5">
                <div
                  className="rounded-xl p-6 text-white flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                  style={{
                    background: `linear-gradient(135deg, #0F172A 0%, ${programBrand.accentColor} 100%)`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-white/15 border border-white/25 font-black text-2xl">
                      {brandMonogram}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">{identity.displayName}</h3>
                        <BadgeCheck className="size-5 text-sky-300" />
                      </div>
                      <p className="text-xs text-white/80">{identity.legalName} · {identity.headquarters}</p>
                      <p className="text-xs text-emerald-300 font-semibold mt-1">
                        {publicProfile.avgResponseTime} · {disclosureConfig.safeHarborLevel}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3 text-xs">
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">Organization Overview</h4>
                      <p className="text-[#475467] mt-1 leading-relaxed">{identity.longDescription}</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">Security Philosophy</h4>
                      <p className="text-[#475467] mt-1 leading-relaxed">{publicProfile.securityPhilosophy}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-4 space-y-2">
                    <div className="font-bold text-[#111827]">Verified Organization Metadata</div>
                    <div>Website: <span className="font-semibold text-blue-600">{identity.website}</span></div>
                    <div>PSIRT: <span className="font-mono">{identity.disclosureContact}</span></div>
                    <div>Languages: {identity.languages.join(", ")}</div>
                  </div>
                </div>
              </div>
            )}

            {previewSurface === "program-listing" && (
              <div className="max-w-xl mx-auto rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-md space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-12 items-center justify-center rounded-xl font-black text-white"
                      style={{ backgroundColor: programBrand.accentColor }}
                    >
                      {brandMonogram}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-base text-[#111827]">{identity.displayName}</span>
                        <BadgeCheck className="size-4 text-blue-600" />
                      </div>
                      <span className="text-xs text-[#667085]">{programBrand.featuredBadgeText}</span>
                    </div>
                  </div>
                  <span className="font-bold text-sm text-emerald-700">$500 – $25,000</span>
                </div>
                <p className="text-xs text-[#475467] leading-relaxed">{identity.shortDescription}</p>
                <div className="flex items-center justify-between pt-3 border-t border-[#F2F4F7] text-xs text-[#667085]">
                  <span>SLA: {publicProfile.avgResponseTime}</span>
                  <span>98.8% Payout Satisfaction</span>
                </div>
              </div>
            )}

            {previewSurface === "program-page" && (
              <div className="space-y-4 text-xs">
                <div
                  className="rounded-xl p-6 text-white space-y-2"
                  style={{ background: `linear-gradient(135deg, #0F172A 0%, ${programBrand.accentColor} 100%)` }}
                >
                  <div className="text-lg font-bold">{identity.displayName} Bug Bounty Program</div>
                  <p className="text-white/85 max-w-2xl">{programBrand.welcomeMessage}</p>
                </div>
                <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                  <div className="font-bold text-sm text-[#111827]">Rules of Engagement</div>
                  <pre className="font-mono text-[#475467] whitespace-pre-line">{programBrand.researcherGuidelines}</pre>
                </div>
              </div>
            )}

            {previewSurface === "hall-of-fame" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-base font-bold text-[#111827]">{hofConfig.pageTitle}</h4>
                  <p className="text-xs text-[#667085] mt-1">{hofConfig.introMessage}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {hofConfig.featuredResearchers.map((r, i) => (
                    <div key={r.handle} className="rounded-xl border border-[#E7EAF0] p-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#111827]">#{i + 1} @{r.handle}</span>
                        <Trophy className="size-4 text-amber-500" />
                      </div>
                      <div className="text-[#667085]">{r.name} ({r.country})</div>
                      <div className="font-semibold text-emerald-700">{r.findingsCount} Validated Findings</div>
                      <div className="text-[11px] text-blue-600 font-medium">{r.badge}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewSurface === "disclosure-page" && (
              <div className="space-y-4 text-xs">
                <div className="font-bold text-base text-[#111827]">
                  {identity.legalName} — Coordinated Vulnerability Disclosure Policy
                </div>
                <p className="text-[#475467] leading-relaxed">{disclosureConfig.disclosureStatement}</p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-1">
                  <div className="font-bold text-emerald-900">{disclosureConfig.safeHarborLevel}</div>
                  <p className="text-emerald-800">{disclosureConfig.safeHarborStatement}</p>
                </div>
              </div>
            )}

            {previewSurface === "email" && (
              <div className="max-w-lg mx-auto rounded-xl border border-[#E7EAF0] p-5 space-y-3 text-xs">
                <div className="font-bold text-sm text-[#111827]">{emailConfig.senderDisplayName}</div>
                <p className="text-[#475467]">{programBrand.recognitionMessage}</p>
                <div className="text-[11px] text-[#667085] pt-2 border-t border-[#F2F4F7]">
                  {emailConfig.footerText}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 10: BRAND VERSION HISTORY */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Brand Version History & Audit Timeline</h3>
            <p className="text-xs text-[#667085]">
              Every logo upload, description edit, banner replacement, and disclosure update is versioned for instant rollback.
            </p>
          </div>

          <div className="divide-y divide-[#F2F4F7] rounded-2xl border border-[#E7EAF0] bg-white shadow-sm">
            {history.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600">{rec.version}</span>
                    <span className="font-bold text-sm text-[#111827]">{rec.eventTitle}</span>
                    {rec.isCurrent && (
                      <span className="text-xs font-semibold text-emerald-700">· Active Version</span>
                    )}
                  </div>
                  <p className="text-xs text-[#475467]">{rec.changesSummary}</p>
                  <div className="text-[11px] text-[#98A2B3]">
                    Author: <strong className="text-[#475467]">{rec.author}</strong> ({rec.authorRole}) · {rec.timestamp}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!rec.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRestoreVersion(rec)}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                    >
                      Restore {rec.version}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* UPLOAD ASSET MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">Upload & Replace Brand Asset</h3>
                <p className="text-xs text-[#667085]">
                  Assets are automatically validated for contrast, dimensions, and stripped of EXIF metadata.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#344054]">Target Brand Slot</label>
                <select
                  value={uploadTargetAssetId}
                  onChange={(e) => setUploadTargetAssetId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827]"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.dimensions})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border-2 border-dashed border-[#D0D5DD] bg-[#F8FAFC] p-6 text-center space-y-2">
                <Upload className="size-6 text-blue-600 mx-auto" />
                <div className="font-semibold text-[#111827]">Drop vector SVG, WebP, or high-DPI PNG</div>
                <div className="text-[11px] text-[#667085]">Maximum file size 5 MB · SHA-256 checksum recorded</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-lg border border-[#E7EAF0] px-3.5 py-1.5 text-xs font-semibold text-[#344054]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReplaceAsset(uploadTargetAssetId)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Upload & Publish Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ASSET VERSION HISTORY MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedAssetHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">{selectedAssetHistory.name} — Revisions</h3>
                <p className="text-xs text-[#667085]">Dimensions: {selectedAssetHistory.dimensions}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssetHistory(null)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="divide-y divide-[#F2F4F7] rounded-xl border border-[#E7EAF0]">
              {selectedAssetHistory.versions.map((v, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                  <div>
                    <div className="font-bold text-[#111827]">
                      {v.version} — {v.note}
                    </div>
                    <div className="text-[11px] text-[#667085]">
                      Uploaded by {v.author} on {v.date}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssetHistory(null);
                      showToast(`Restored ${selectedAssetHistory.name} to ${v.version}.`);
                    }}
                    className="rounded-lg border border-[#E7EAF0] px-2.5 py-1 font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

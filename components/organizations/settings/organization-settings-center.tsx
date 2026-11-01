"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Globe,
  ShieldCheck,
  Users,
  Bell,
  ToggleLeft,
  Code2,
  Database,
  Lock,
  Sliders,
  AlertTriangle,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  Info,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Clock,
  ShieldAlert,
  Sparkles,
  Server,
  Eye,
  FileCode2,
  X,
  ArrowUpRight,
  HardDrive,
} from "lucide-react";
import {
  INITIAL_ORGANIZATION_SETTINGS,
  DANGER_ZONE_ACTIONS,
  type OrganizationSettingsState,
  type SettingsCategoryId,
  type DangerActionItem,
  type OrgApiKeyItem,
} from "../../../lib/mock/organization-settings";

interface OrganizationSettingsCenterProps {
  organizationId: string;
  organizationName: string;
}

interface CategoryDef {
  id: SettingsCategoryId;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isDanger?: boolean;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: "general",
    label: "General",
    shortDesc: "Identity, slug, owner & contacts",
    icon: Building2,
  },
  {
    id: "regional",
    label: "Regional Settings",
    shortDesc: "Residency, tax, SLA clock & holidays",
    icon: Globe,
  },
  {
    id: "program-defaults",
    label: "Program Defaults",
    shortDesc: "SLA targets, CVSS & intake templates",
    icon: ShieldCheck,
  },
  {
    id: "researcher-defaults",
    label: "Researcher Defaults",
    shortDesc: "Safe Harbor, disclosure & KYC rules",
    icon: Users,
  },
  {
    id: "notifications",
    label: "Notifications",
    shortDesc: "Global alert channels & digests",
    icon: Bell,
  },
  {
    id: "feature-flags",
    label: "Feature Flags",
    shortDesc: "Platform capabilities & beta rollouts",
    icon: ToggleLeft,
    badge: "9 Flags",
  },
  {
    id: "api-developer",
    label: "API & Developer",
    shortDesc: "Org keys, webhooks, CORS & rate limits",
    icon: Code2,
  },
  {
    id: "data-management",
    label: "Data Management",
    shortDesc: "Backups, KMS encryption & retention",
    icon: Database,
  },
  {
    id: "privacy",
    label: "Privacy",
    shortDesc: "PII redaction, GDPR & visibility",
    icon: Lock,
  },
  {
    id: "advanced",
    label: "Advanced",
    shortDesc: "Custom headers, metadata & sandbox",
    icon: Sliders,
  },
  {
    id: "danger",
    label: "Danger Zone",
    shortDesc: "Ownership transfer, archive & delete",
    icon: AlertTriangle,
    isDanger: true,
  },
];

function resolveCategoryFromQuery(tabParam: string | null): SettingsCategoryId {
  if (!tabParam) return "general";
  const normalized = tabParam.toLowerCase();
  if (normalized === "api-tokens" || normalized === "api" || normalized === "developer") {
    return "api-developer";
  }
  if (normalized === "preferences") {
    return "program-defaults";
  }
  const found = CATEGORIES.find((c) => c.id === normalized);
  return found ? found.id : "general";
}

export function OrganizationSettingsCenter({
  organizationId,
  organizationName,
}: OrganizationSettingsCenterProps) {
  const searchParams = useSearchParams();

  const baselineState = useMemo<OrganizationSettingsState>(() => {
    const clone = JSON.parse(JSON.stringify(INITIAL_ORGANIZATION_SETTINGS)) as OrganizationSettingsState;
    if (organizationName && organizationName !== "Organization") {
      clone.general.organizationName = organizationName;
    }
    return clone;
  }, [organizationName]);

  const [savedConfig, setSavedConfig] = useState<OrganizationSettingsState>(baselineState);
  const [draftConfig, setDraftConfig] = useState<OrganizationSettingsState>(baselineState);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("general");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modals & transient inputs
  const [newOriginInput, setNewOriginInput] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);
  const [newHeaderName, setNewHeaderName] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");
  const [newHeaderScope, setNewHeaderScope] = useState<
    "All Outbound Webhooks" | "Asset Verification Probes" | "SCIM Provisioning"
  >("All Outbound Webhooks");
  const [newMetaKey, setNewMetaKey] = useState("");
  const [newMetaValue, setNewMetaValue] = useState("");
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyEnv, setNewApiKeyEnv] = useState<"production" | "staging" | "sandbox">("production");
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Danger zone confirmation modal state
  const [activeDangerAction, setActiveDangerAction] = useState<DangerActionItem | null>(null);
  const [dangerPhraseInput, setDangerPhraseInput] = useState("");
  const [dangerMfaCode, setDangerMfaCode] = useState("");
  const [dangerOwnerEmailInput, setDangerOwnerEmailInput] = useState("");
  const [dangerError, setDangerError] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveCategory(resolveCategoryFromQuery(tab));
    }
  }, [searchParams]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedText(label);
    showToast(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Compute dirty state per section & globally
  const sectionDirtyMap = useMemo<Record<SettingsCategoryId, boolean>>(() => {
    return {
      general: JSON.stringify(draftConfig.general) !== JSON.stringify(savedConfig.general),
      regional: JSON.stringify(draftConfig.regional) !== JSON.stringify(savedConfig.regional),
      "program-defaults":
        JSON.stringify(draftConfig.programDefaults) !== JSON.stringify(savedConfig.programDefaults),
      "researcher-defaults":
        JSON.stringify(draftConfig.researcherDefaults) !==
        JSON.stringify(savedConfig.researcherDefaults),
      notifications:
        JSON.stringify(draftConfig.notifications) !== JSON.stringify(savedConfig.notifications),
      "feature-flags":
        JSON.stringify(draftConfig.featureFlags) !== JSON.stringify(savedConfig.featureFlags),
      "api-developer":
        JSON.stringify(draftConfig.apiDeveloper) !== JSON.stringify(savedConfig.apiDeveloper),
      "data-management":
        JSON.stringify(draftConfig.dataManagement) !== JSON.stringify(savedConfig.dataManagement),
      privacy: JSON.stringify(draftConfig.privacy) !== JSON.stringify(savedConfig.privacy),
      advanced: JSON.stringify(draftConfig.advanced) !== JSON.stringify(savedConfig.advanced),
      danger: false,
    };
  }, [draftConfig, savedConfig]);

  const dirtyCategoriesCount = useMemo(
    () => Object.values(sectionDirtyMap).filter(Boolean).length,
    [sectionDirtyMap]
  );
  const hasUnsavedChanges = dirtyCategoriesCount > 0;

  // Inline validation errors
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(draftConfig.general.workspaceSlug)) {
      errors.workspaceSlug =
        "Workspace slug must contain only lowercase alphanumeric characters and hyphens (e.g. northwind-cloud).";
    }
    if (!draftConfig.general.organizationName.trim()) {
      errors.organizationName = "Organization name cannot be empty.";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(draftConfig.general.supportContactEmail)) {
      errors.supportContactEmail = "Enter a valid support contact email address.";
    }
    if (
      draftConfig.apiDeveloper.rateLimitRequestsPerMinute < 60 ||
      draftConfig.apiDeveloper.rateLimitRequestsPerMinute > 25000
    ) {
      errors.rateLimit = "Rate limit must be between 60 and 25,000 requests per minute.";
    }
    if (
      draftConfig.programDefaults.defaultSlaFirstResponseHours < 1 ||
      draftConfig.programDefaults.defaultSlaFirstResponseHours > 168
    ) {
      errors.slaFirstResponse = "First response SLA must be between 1 and 168 hours.";
    }
    return errors;
  }, [draftConfig]);

  const hasValidationError = Object.keys(validationErrors).length > 0;

  const handleSaveChanges = () => {
    if (hasValidationError) {
      showToast("Please resolve inline validation errors before saving configuration.");
      return;
    }
    setSavedConfig(JSON.parse(JSON.stringify(draftConfig)));
    showToast("Organization configuration saved and propagated to all active workspaces.");
  };

  const handleDiscardChanges = () => {
    setDraftConfig(JSON.parse(JSON.stringify(savedConfig)));
    showToast("Unsaved modifications discarded.");
  };

  const handleResetDefaults = () => {
    setDraftConfig(JSON.parse(JSON.stringify(baselineState)));
    showToast("Configuration reset to enterprise baseline defaults. Click Save Changes to commit.");
  };

  const handleExportConfiguration = () => {
    const payload = JSON.stringify(savedConfig, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${savedConfig.general.workspaceSlug}-org-settings.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${savedConfig.general.workspaceSlug}-org-settings.json`);
  };

  const handleImportSubmit = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importJsonText);
      if (!parsed.general || !parsed.regional || !parsed.programDefaults) {
        setImportError(
          "Invalid schema: JSON must include general, regional, and programDefaults sections."
        );
        return;
      }
      setDraftConfig(parsed);
      setShowImportModal(false);
      setImportJsonText("");
      showToast("Configuration imported into staging draft. Review and click Save Changes.");
    } catch {
      setImportError("Unable to parse JSON payload. Check syntax and try again.");
    }
  };

  const toggleWorkingDay = (day: string) => {
    setDraftConfig((prev) => {
      const exists = prev.regional.workingDays.includes(day);
      const nextDays = exists
        ? prev.regional.workingDays.filter((d) => d !== day)
        : [...prev.regional.workingDays, day];
      return {
        ...prev,
        regional: {
          ...prev.regional,
          workingDays: nextDays,
        },
      };
    });
  };

  const toggleFeatureFlag = (flagId: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      featureFlags: prev.featureFlags.map((flag) =>
        flag.id === flagId
          ? {
              ...flag,
              enabled: !flag.enabled,
              updatedAt: "2026-04-17",
            }
          : flag
      ),
    }));
  };

  const handleAddAllowedOrigin = () => {
    setOriginError(null);
    const trimmed = newOriginInput.trim();
    if (!trimmed.startsWith("https://")) {
      setOriginError("Allowed origins must use HTTPS protocol (e.g. https://portal.example.com).");
      return;
    }
    if (draftConfig.apiDeveloper.allowedOrigins.includes(trimmed)) {
      setOriginError("This origin is already registered in the CORS policy.");
      return;
    }
    setDraftConfig((prev) => ({
      ...prev,
      apiDeveloper: {
        ...prev.apiDeveloper,
        allowedOrigins: [...prev.apiDeveloper.allowedOrigins, trimmed],
      },
    }));
    setNewOriginInput("");
  };

  const handleRemoveAllowedOrigin = (origin: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      apiDeveloper: {
        ...prev.apiDeveloper,
        allowedOrigins: prev.apiDeveloper.allowedOrigins.filter((o) => o !== origin),
      },
    }));
  };

  const handleCreateApiKey = () => {
    if (!newApiKeyName.trim()) return;
    const newKey: OrgApiKeyItem = {
      id: `key-${Date.now()}`,
      name: newApiKeyName.trim(),
      prefix:
        newApiKeyEnv === "production"
          ? "co_live_84b1e2...91c0"
          : newApiKeyEnv === "staging"
          ? "co_stg_52a9f4...30d2"
          : "co_sbx_19c4e8...77a1",
      scopes: ["reports:read", "programs:read", "webhooks:write"],
      environment: newApiKeyEnv,
      createdBy: draftConfig.general.organizationOwnerName,
      createdAt: "2026-04-17",
      expiresAt: "2027-04-17",
      lastUsedAt: "Just created",
      ipRestrictions: ["198.51.100.0/24"],
      status: "Active",
    };
    setDraftConfig((prev) => ({
      ...prev,
      apiDeveloper: {
        ...prev.apiDeveloper,
        apiKeys: [newKey, ...prev.apiDeveloper.apiKeys],
      },
    }));
    setNewApiKeyName("");
    setShowCreateKeyModal(false);
    showToast(`Created organization API token "${newKey.name}".`);
  };

  const handleRevokeApiKey = (id: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      apiDeveloper: {
        ...prev.apiDeveloper,
        apiKeys: prev.apiDeveloper.apiKeys.map((k) =>
          k.id === id ? { ...k, status: "Revoked" } : k
        ),
      },
    }));
    showToast("API key marked for immediate revocation.");
  };

  const handleAddCustomHeader = () => {
    if (!newHeaderName.trim() || !newHeaderValue.trim()) return;
    setDraftConfig((prev) => ({
      ...prev,
      advanced: {
        ...prev.advanced,
        customHeaders: [
          ...prev.advanced.customHeaders,
          {
            id: `hdr-${Date.now()}`,
            headerName: newHeaderName.trim(),
            headerValueMasked: newHeaderValue.trim(),
            scope: newHeaderScope,
            enabled: true,
          },
        ],
      },
    }));
    setNewHeaderName("");
    setNewHeaderValue("");
  };

  const handleAddMetadata = () => {
    if (!newMetaKey.trim() || !newMetaValue.trim()) return;
    setDraftConfig((prev) => ({
      ...prev,
      advanced: {
        ...prev.advanced,
        customMetadata: [
          ...prev.advanced.customMetadata,
          {
            id: `meta-${Date.now()}`,
            key: newMetaKey.trim().toLowerCase().replace(/\s+/g, "_"),
            value: newMetaValue.trim(),
            visibility: "Audit Log Tag",
          },
        ],
      },
    }));
    setNewMetaKey("");
    setNewMetaValue("");
  };

  const handleExecuteDangerAction = () => {
    if (!activeDangerAction) return;
    setDangerError(null);
    if (dangerPhraseInput.trim() !== activeDangerAction.confirmationPhrase) {
      setDangerError(`Type the exact confirmation phrase: ${activeDangerAction.confirmationPhrase}`);
      return;
    }
    if (activeDangerAction.requiresMfa && !/^\d{6}$/.test(dangerMfaCode.trim())) {
      setDangerError("Enter a valid 6-digit hardware authenticator / WebAuthn totp code.");
      return;
    }
    if (
      activeDangerAction.id === "transfer-ownership" &&
      !dangerOwnerEmailInput.trim().includes("@")
    ) {
      setDangerError("Specify the verified Organization Admin email receiving ownership.");
      return;
    }

    if (activeDangerAction.id === "transfer-ownership") {
      setDraftConfig((prev) => ({
        ...prev,
        general: {
          ...prev.general,
          organizationOwnerEmail: dangerOwnerEmailInput.trim(),
        },
      }));
    } else if (activeDangerAction.id === "delete-api-keys") {
      setDraftConfig((prev) => ({
        ...prev,
        apiDeveloper: {
          ...prev.apiDeveloper,
          apiKeys: prev.apiDeveloper.apiKeys.map((k) => ({ ...k, status: "Revoked" })),
        },
      }));
    }

    showToast(
      `Executed high-security action: ${activeDangerAction.title} (Audit event logged)`
    );
    setActiveDangerAction(null);
    setDangerPhraseInput("");
    setDangerMfaCode("");
    setDangerOwnerEmailInput("");
  };

  const enabledFlagsCount = draftConfig.featureFlags.filter((f) => f.enabled).length;
  const activeApiKeysCount = draftConfig.apiDeveloper.apiKeys.filter(
    (k) => k.status !== "Revoked"
  ).length;

  return (
    <div className="space-y-6 pb-24">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 1. Enterprise Hero Header */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white dark:bg-slate-800">
                {draftConfig.general.organizationIdentifier}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {draftConfig.advanced.environmentMode} Environment
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
                Primary Owner: {draftConfig.general.organizationOwnerName}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Organization Settings
            </h1>
            <p className="text-sm text-ink-muted">
              Configure organization-wide defaults and operational preferences.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap">
            <button
              type="button"
              onClick={handleExportConfiguration}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-muted"
            >
              <Download className="h-3.5 w-3.5 text-ink-muted" />
              Export Configuration
            </button>
            <button
              type="button"
              onClick={() => {
                setImportJsonText(JSON.stringify(draftConfig, null, 2));
                setImportError(null);
                setShowImportModal(true);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-muted"
            >
              <Upload className="h-3.5 w-3.5 text-ink-muted" />
              Import Configuration
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-muted"
            >
              <RotateCcw className="h-3.5 w-3.5 text-ink-muted" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={!hasUnsavedChanges || hasValidationError}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                hasUnsavedChanges && !hasValidationError
                  ? "bg-blue-600 text-white shadow-xs hover:bg-blue-700"
                  : "cursor-not-allowed border border-border bg-surface-muted text-ink-muted opacity-65"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              Save Changes
              {hasUnsavedChanges && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {dirtyCategoriesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Summary Telemetry Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Workspace Slug
            </div>
            <div className="mt-1 truncate font-mono text-sm font-semibold text-ink">
              /{draftConfig.general.workspaceSlug}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {draftConfig.general.defaultLanguage} • {draftConfig.general.currency}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Data Residency
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-ink">
              {draftConfig.regional.country}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-ink-muted">
              {draftConfig.regional.region}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Default Program SLA
            </div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {draftConfig.programDefaults.defaultSlaFirstResponseHours}h Response /{" "}
              {draftConfig.programDefaults.defaultSlaTriageHours}h Triage
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {draftConfig.programDefaults.defaultSeverityMatrix}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Safe Harbor & Disclosure
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-ink">
              {draftConfig.researcherDefaults.defaultSafeHarborTier}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {draftConfig.researcherDefaults.defaultDisclosureTimelineDays}-day coordinated window
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Feature Flags
            </div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {enabledFlagsCount} of {draftConfig.featureFlags.length} Enabled
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              GA, Enterprise & Beta active
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-muted/40 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              API & Backups
            </div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {activeApiKeysCount} Active Keys • {draftConfig.apiDeveloper.rateLimitRequestsPerMinute} rpm
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              KMS BYOK Backups Verified
            </div>
          </div>
        </div>
      </div>

      {/* 2. Two-Column Enterprise Workspace: Left Category Navigation + Right Configuration Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Navigation Column */}
        <aside className="lg:col-span-3">
          <div className="sticky top-6 space-y-4">
            <nav
              aria-label="Organization settings categories"
              className="rounded-xl border border-border bg-surface p-2 shadow-xs"
            >
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Configuration Domains
              </div>
              <div className="space-y-0.5">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const isActive = activeCategory === category.id;
                  const isDirty = sectionDirtyMap[category.id];
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategory(category.id)}
                      className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                        isActive
                          ? category.isDanger
                            ? "bg-red-500/10 text-red-700 dark:text-red-300"
                            : "bg-blue-600/10 text-blue-700 dark:text-blue-300"
                          : category.isDanger
                          ? "text-red-600/80 hover:bg-red-500/5 dark:text-red-400"
                          : "text-ink hover:bg-surface-muted"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isActive
                            ? category.isDanger
                              ? "text-red-600 dark:text-red-400"
                              : "text-blue-600 dark:text-blue-400"
                            : category.isDanger
                            ? "text-red-500/80"
                            : "text-ink-muted group-hover:text-ink"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{category.label}</span>
                          <div className="flex items-center gap-1.5">
                            {isDirty && (
                              <span
                                title="Unsaved changes in this section"
                                className="h-2 w-2 rounded-full bg-amber-500"
                              />
                            )}
                            {category.badge && (
                              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                                {category.badge}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {category.shortDesc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Dedicated Operational Modules Cross-Reference Card */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="text-xs font-semibold text-ink">Dedicated Operational Modules</div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Operational records are managed in their dedicated workspaces rather than global settings:
              </p>
              <div className="mt-3 space-y-1.5 text-xs">
                <Link
                  href={`/organizations/${organizationId}/members`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                >
                  <span>Team, SSO & SCIM Governance</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/organizations/${organizationId}/integrations`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                >
                  <span>Connected Integrations Hub</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/organizations/${organizationId}/payments`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                >
                  <span>Billing, Escrow & Tax Center</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/organizations/${organizationId}/branding`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                >
                  <span>Brand Center & Public Identity</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Content Panel */}
        <div className="space-y-6 lg:col-span-9">
          {/* SECTION 1: GENERAL */}
          {activeCategory === "general" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    General Organization Configuration
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Core organization identity, canonical workspace slug, localization defaults, and designated legal/administrative contacts.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Organization Display Name
                    </label>
                    <input
                      type="text"
                      value={draftConfig.general.organizationName}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, organizationName: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                    {validationErrors.organizationName ? (
                      <p className="mt-1 text-xs text-red-600">
                        {validationErrors.organizationName}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Displayed across security headers, researcher invitations, and audit exports.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Registered Legal Entity Name
                    </label>
                    <input
                      type="text"
                      value={draftConfig.general.legalEntityName}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, legalEntityName: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Used on Safe Harbor legal clauses, researcher NDAs, and tax compliance certificates.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Workspace Slug</label>
                    <div className="mt-1.5 flex rounded-lg border border-border bg-surface focus-within:border-blue-600">
                      <span className="inline-flex items-center border-r border-border bg-surface-muted px-3 font-mono text-xs text-ink-muted">
                        comolho.security/org/
                      </span>
                      <input
                        type="text"
                        value={draftConfig.general.workspaceSlug}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            general: { ...prev.general, workspaceSlug: e.target.value },
                          }))
                        }
                        className="w-full rounded-r-lg bg-transparent px-3 py-2 font-mono text-sm text-ink focus:outline-none"
                      />
                    </div>
                    {validationErrors.workspaceSlug ? (
                      <p className="mt-1 text-xs text-red-600">{validationErrors.workspaceSlug}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Changing the workspace slug automatically issues 301 redirects for legacy API and portal URLs for 90 days.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Immutable Organization Identifier
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={draftConfig.general.organizationIdentifier}
                        className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm text-ink-muted"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            draftConfig.general.organizationIdentifier,
                            "Organization ID"
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-surface-muted"
                      >
                        {copiedText === "Organization ID" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Used for SAML Audience URI, SCIM tenant routing, and AWS KMS key policies.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Default Language</label>
                    <select
                      value={draftConfig.general.defaultLanguage}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, defaultLanguage: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="en-US">English (United States) — en-US</option>
                      <option value="en-GB">English (United Kingdom) — en-GB</option>
                      <option value="pt-BR">Portuguese (Brazil) — pt-BR</option>
                      <option value="de-DE">German (Germany) — de-DE</option>
                      <option value="ja-JP">Japanese (Japan) — ja-JP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Time Zone
                    </label>
                    <select
                      value={draftConfig.general.timeZone}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, timeZone: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="America/New_York (UTC-05:00)">
                        America/New_York (UTC-05:00)
                      </option>
                      <option value="America/Los_Angeles (UTC-08:00)">
                        America/Los_Angeles (UTC-08:00)
                      </option>
                      <option value="UTC (Coordinated Universal Time)">
                        UTC (Coordinated Universal Time)
                      </option>
                      <option value="Europe/London (UTC+00:00)">Europe/London (UTC+00:00)</option>
                      <option value="Europe/Frankfurt (UTC+01:00)">
                        Europe/Frankfurt (UTC+01:00)
                      </option>
                      <option value="Asia/Singapore (UTC+08:00)">Asia/Singapore (UTC+08:00)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Date Format</label>
                    <select
                      value={draftConfig.general.dateFormat}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, dateFormat: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="YYYY-MM-DD (ISO 8601)">YYYY-MM-DD (ISO 8601)</option>
                      <option value="MMM DD, YYYY (US Standard)">MMM DD, YYYY (US Standard)</option>
                      <option value="DD MMM YYYY (EU/UK)">DD MMM YYYY (EU/UK)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Accounting Currency
                    </label>
                    <select
                      value={draftConfig.general.currency}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, currency: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="USD ($)">USD ($) — US Dollar</option>
                      <option value="EUR (€)">EUR (€) — Euro</option>
                      <option value="GBP (£)">GBP (£) — British Pound</option>
                      <option value="BRL (R$)">BRL (R$) — Brazilian Real</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Business Hours Start
                    </label>
                    <input
                      type="time"
                      value={draftConfig.general.businessHoursStart}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, businessHoursStart: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Business Hours End
                    </label>
                    <input
                      type="time"
                      value={draftConfig.general.businessHoursEnd}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, businessHoursEnd: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Organization Owner & Operational Contacts */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      Organization Owner & Escalation Contacts
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Designated legal owner and 24/7 incident escalation endpoints for platform security notices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCategory("danger")}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
                  >
                    Reassign Ownership in Danger Zone
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-5 rounded-lg border border-border bg-surface-muted/40 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        Primary Organization Owner
                      </div>
                      <div className="mt-1 text-sm font-semibold text-ink">
                        {draftConfig.general.organizationOwnerName} (
                        {draftConfig.general.organizationOwnerEmail})
                      </div>
                      <div className="text-xs text-ink-muted">
                        {draftConfig.general.organizationOwnerRole} • Hardware WebAuthn MFA Enforced
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 self-start rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verified Root Authority
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      SecOps Support Contact
                    </label>
                    <input
                      type="email"
                      value={draftConfig.general.supportContactEmail}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, supportContactEmail: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                    {validationErrors.supportContactEmail && (
                      <p className="mt-1 text-xs text-red-600">
                        {validationErrors.supportContactEmail}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      PSIRT / 24x7 Escalation Contact
                    </label>
                    <input
                      type="email"
                      value={draftConfig.general.securityEscalationEmail}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, securityEscalationEmail: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      FinOps & Billing Notice Contact
                    </label>
                    <input
                      type="email"
                      value={draftConfig.general.billingContactEmail}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          general: { ...prev.general, billingContactEmail: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: REGIONAL SETTINGS */}
          {activeCategory === "regional" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    Regional & Jurisdiction Settings
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Configure data residency regions, tax jurisdiction defaults, working days, and holiday calendars used to compute SLA timers.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Headquarters Country
                    </label>
                    <select
                      value={draftConfig.regional.country}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: { ...prev.regional, country: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Germany">Germany</option>
                      <option value="Brazil">Brazil</option>
                      <option value="Singapore">Singapore</option>
                      <option value="Japan">Japan</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Cloud Data Residency Region
                    </label>
                    <select
                      value={draftConfig.regional.region}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: { ...prev.regional, region: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="US-East (Northern Virginia / Ashburn)">
                        US-East (Northern Virginia / Ashburn)
                      </option>
                      <option value="US-West (Oregon)">US-West (Oregon)</option>
                      <option value="EU-Central (Frankfurt Sovereign)">
                        EU-Central (Frankfurt Sovereign)
                      </option>
                      <option value="UK-South (London)">UK-South (London)</option>
                      <option value="SA-East (São Paulo)">SA-East (São Paulo)</option>
                      <option value="AP-Southeast (Singapore)">AP-Southeast (Singapore)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Vulnerability attachments and PoC videos are pinned exclusively to this storage region.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Formatting Locale
                    </label>
                    <select
                      value={draftConfig.regional.locale}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: { ...prev.regional, locale: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="en-US (United States)">en-US (United States)</option>
                      <option value="en-GB (United Kingdom)">en-GB (United Kingdom)</option>
                      <option value="de-DE (Germany)">de-DE (Germany)</option>
                      <option value="pt-BR (Brazil)">pt-BR (Brazil)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Tax Jurisdiction & Withholding Regime
                    </label>
                    <select
                      value={draftConfig.regional.taxRegion}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: { ...prev.regional, taxRegion: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="US Federal (IRS W-9 / W-8BEN Jurisdiction)">
                        US Federal (IRS W-9 / W-8BEN Jurisdiction)
                      </option>
                      <option value="European Union VAT Reverse-Charge">
                        European Union VAT Reverse-Charge
                      </option>
                      <option value="UK HMRC Corporation Tax">UK HMRC Corporation Tax</option>
                      <option value="Brazil Receita Federal (CNPJ)">
                        Brazil Receita Federal (CNPJ)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      SLA Clock Calculation Mode
                    </label>
                    <select
                      value={draftConfig.regional.slaClockMode}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: {
                            ...prev.regional,
                            slaClockMode: e.target.value as OrganizationSettingsState["regional"]["slaClockMode"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Severity-Tiered (P1 24x7, P2-P4 Business)">
                        Severity-Tiered (P1 24x7, P2-P4 Business Hours)
                      </option>
                      <option value="Business Hours Only">Business Hours Only (All Severities)</option>
                      <option value="24x7 Continuous">24x7 Continuous Clock</option>
                    </select>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Determines whether weekend and holiday hours count against triage SLA targets.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Holiday Calendar Schedule
                    </label>
                    <select
                      value={draftConfig.regional.holidayCalendar}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          regional: { ...prev.regional, holidayCalendar: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="NYSE / US Federal + 2 Security Stand-Down Days">
                        NYSE / US Federal + 2 Security Stand-Down Days (9 holidays)
                      </option>
                      <option value="UK Bank Holidays">UK Bank Holidays (8 holidays)</option>
                      <option value="EU Target2 Banking Calendar">
                        EU Target2 Banking Calendar (10 holidays)
                      </option>
                      <option value="No Holiday Pause (365 Operations)">
                        No Holiday Pause (365 Operations)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Working Days Selector */}
                <div className="mt-6 border-t border-border pt-5">
                  <label className="block text-xs font-semibold text-ink">
                    Active SecOps Working Days
                  </label>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Select days when standard P2–P4 SLA clocks run and automated triage digests are dispatched.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day) => {
                      const active = draftConfig.regional.workingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWorkingDay(day)}
                          className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
                            active
                              ? "border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300"
                              : "border-border bg-surface text-ink-muted hover:bg-surface-muted"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: PROGRAM DEFAULTS */}
          {activeCategory === "program-defaults" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    New Program Baseline Defaults
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Every newly created Bug Bounty or VDP program inherits these baseline SLA targets, scoring standards, and workflow templates.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Program Visibility
                    </label>
                    <select
                      value={draftConfig.programDefaults.defaultVisibility}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultVisibility: e.target
                              .value as OrganizationSettingsState["programDefaults"]["defaultVisibility"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Private Invite-Only">Private Invite-Only (Recommended)</option>
                      <option value="Public Listed">Public Listed in Directory</option>
                      <option value="Unlisted Application">Unlisted Application Gate</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Severity Scoring Matrix
                    </label>
                    <select
                      value={draftConfig.programDefaults.defaultSeverityMatrix}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultSeverityMatrix: e.target
                              .value as OrganizationSettingsState["programDefaults"]["defaultSeverityMatrix"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="CVSS v4.0 Enterprise">CVSS v4.0 Enterprise + Environmental</option>
                      <option value="CVSS v3.1 Standard">CVSS v3.1 Base Standard</option>
                      <option value="Business Risk Contextual">
                        Business Risk Contextual Matrix (P1–P4)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Intake & Triage Workflow
                    </label>
                    <select
                      value={draftConfig.programDefaults.defaultIntakeWorkflow}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultIntakeWorkflow: e.target
                              .value as OrganizationSettingsState["programDefaults"]["defaultIntakeWorkflow"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Hybrid Co-Triage">
                        Hybrid Co-Triage (Com Olho Triage + SecOps Approval)
                      </option>
                      <option value="Com Olho Managed Triage">Com Olho Fully Managed Triage</option>
                      <option value="Internal SecOps Queue">Internal SecOps Direct Queue</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Reward Currency
                    </label>
                    <select
                      value={draftConfig.programDefaults.defaultRewardCurrency}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultRewardCurrency: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="USD ($)">USD ($) — US Dollar</option>
                      <option value="EUR (€)">EUR (€) — Euro</option>
                      <option value="GBP (£)">GBP (£) — British Pound</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Asset Scope Template
                    </label>
                    <input
                      type="text"
                      value={draftConfig.programDefaults.defaultScopeTemplate}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultScopeTemplate: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Automation Pack
                    </label>
                    <input
                      type="text"
                      value={draftConfig.programDefaults.defaultAutomationPack}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          programDefaults: {
                            ...prev.programDefaults,
                            defaultAutomationPack: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* SLA Targets Grid */}
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Default SLA Targets for New Programs
                  </h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border bg-surface-muted/30 p-3.5">
                      <label className="block text-xs font-medium text-ink-muted">
                        First Response (Hours)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={draftConfig.programDefaults.defaultSlaFirstResponseHours}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            programDefaults: {
                              ...prev.programDefaults,
                              defaultSlaFirstResponseHours: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm font-semibold text-ink"
                      />
                      {validationErrors.slaFirstResponse && (
                        <p className="mt-1 text-[11px] text-red-600">
                          {validationErrors.slaFirstResponse}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted/30 p-3.5">
                      <label className="block text-xs font-medium text-ink-muted">
                        Triage Decision (Hours)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={336}
                        value={draftConfig.programDefaults.defaultSlaTriageHours}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            programDefaults: {
                              ...prev.programDefaults,
                              defaultSlaTriageHours: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm font-semibold text-ink"
                      />
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted/30 p-3.5">
                      <label className="block text-xs font-medium text-ink-muted">
                        Bounty Determination (Hours)
                      </label>
                      <input
                        type="number"
                        min={12}
                        max={720}
                        value={draftConfig.programDefaults.defaultSlaBountyHours}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            programDefaults: {
                              ...prev.programDefaults,
                              defaultSlaBountyHours: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm font-semibold text-ink"
                      />
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted/30 p-3.5">
                      <label className="block text-xs font-medium text-ink-muted">
                        Remediation Target (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={draftConfig.programDefaults.defaultSlaResolutionDays}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            programDefaults: {
                              ...prev.programDefaults,
                              defaultSlaResolutionDays: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm font-semibold text-ink"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: RESEARCHER DEFAULTS */}
          {activeCategory === "researcher-defaults" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    Researcher Engagement & Governance Defaults
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Define organization-wide policies for Hall of Fame attribution, coordinated disclosure timelines, legal Safe Harbor, and researcher verification gates.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Hall of Fame Visibility
                    </label>
                    <select
                      value={draftConfig.researcherDefaults.defaultHallOfFameVisibility}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            defaultHallOfFameVisibility: e.target
                              .value as OrganizationSettingsState["researcherDefaults"]["defaultHallOfFameVisibility"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Public Opt-In">Public Opt-In (Researcher Chooses)</option>
                      <option value="Public By Default">Public By Default</option>
                      <option value="Private Verified Only">Private Verified Directory Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Safe Harbor Protection Tier
                    </label>
                    <select
                      value={draftConfig.researcherDefaults.defaultSafeHarborTier}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            defaultSafeHarborTier: e.target
                              .value as OrganizationSettingsState["researcherDefaults"]["defaultSafeHarborTier"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Full Gold Safe Harbor">
                        Full Gold Safe Harbor (CFAA / DMCA Authorization)
                      </option>
                      <option value="Standard Good-Faith Protection">
                        Standard Good-Faith Protection
                      </option>
                      <option value="Custom Legal Addendum">Custom Legal Counsel Addendum</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Coordinated Disclosure Policy
                    </label>
                    <select
                      value={draftConfig.researcherDefaults.disclosurePolicyMode}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            disclosurePolicyMode: e.target
                              .value as OrganizationSettingsState["researcherDefaults"]["disclosurePolicyMode"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Coordinated Mutual Agreement">
                        Coordinated Mutual Agreement Post-Fix
                      </option>
                      <option value="Scheduled 90-Day Standard">
                        Scheduled 90-Day Standard Window
                      </option>
                      <option value="Restricted / No Public Disclosure">
                        Restricted / No Public Disclosure Permitted
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Disclosure Timeline (Days)
                    </label>
                    <input
                      type="number"
                      min={14}
                      max={365}
                      value={draftConfig.researcherDefaults.defaultDisclosureTimelineDays}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            defaultDisclosureTimelineDays: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Standard industry benchmark is 90 days after vulnerability validation.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Communication Preferences
                    </label>
                    <select
                      value={draftConfig.researcherDefaults.defaultCommunicationMode}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            defaultCommunicationMode: e.target
                              .value as OrganizationSettingsState["researcherDefaults"]["defaultCommunicationMode"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Structured Thread + Markdown">
                        Structured Thread + Markdown & Attachments
                      </option>
                      <option value="Strict Milestone Updates Only">
                        Strict Milestone Status Updates Only
                      </option>
                      <option value="PGP Encrypted Allowed">
                        PGP Encrypted Thread Payloads Allowed
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Minimum Signal Score for Private Invites
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={1}
                      max={7}
                      value={draftConfig.researcherDefaults.minSignalScoreForPrivateInvite}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          researcherDefaults: {
                            ...prev.researcherDefaults,
                            minSignalScoreForPrivateInvite: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Reputation & KYC Switches */}
                <div className="mt-6 space-y-3 border-t border-border pt-5">
                  {[
                    {
                      key: "requireIdentityKycForPayout" as const,
                      title: "Require Identity KYC & Sanctions Screening Before Payout",
                      desc: "Researchers must complete government ID verification and OFAC screening before receiving bounty disbursements.",
                    },
                    {
                      key: "requireBackgroundCheckForCriticalAssets" as const,
                      title: "Require Cleared Background Check for Tier-0 Critical Assets",
                      desc: "Restricts access to production payment/core-infra scopes to background-checked researchers.",
                    },
                    {
                      key: "reputationPenaltyOnNdaBreach" as const,
                      title: "Automatic Reputation Penalty & Program Removal on NDA Violation",
                      desc: "Immediately revokes private program access if unauthorized disclosure or scope violation is confirmed.",
                    },
                    {
                      key: "allowCollaborativeSplitBounties" as const,
                      title: "Allow Collaborative Submissions & Split Bounty Payouts",
                      desc: "Permits up to 3 researchers to co-author a single vulnerability report and define custom reward split percentages.",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-surface-muted/30 p-4"
                    >
                      <div>
                        <div className="text-xs font-semibold text-ink">{item.title}</div>
                        <p className="mt-0.5 text-xs text-ink-muted">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draftConfig.researcherDefaults[item.key]}
                        onClick={() =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            researcherDefaults: {
                              ...prev.researcherDefaults,
                              [item.key]: !prev.researcherDefaults[item.key],
                            },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          draftConfig.researcherDefaults[item.key]
                            ? "bg-blue-600"
                            : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                            draftConfig.researcherDefaults[item.key]
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: NOTIFICATIONS */}
          {activeCategory === "notifications" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    Global Notification Routing & Alert Channels
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Control organization-wide delivery channels, executive digest cadence, and SLA breach pre-warning thresholds.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    {
                      key: "emailEnabled" as const,
                      title: "Encrypted Email Notifications",
                      desc: "Send TLS-enforced notification emails (with optional PGP key encryption) to subscribed workspace members.",
                    },
                    {
                      key: "inAppEnabled" as const,
                      title: "In-App Real-Time Inbox & Toast Alerts",
                      desc: "Stream live triage events, researcher replies, and bounty approvals inside the Com Olho console.",
                    },
                    {
                      key: "slackEnabled" as const,
                      title: "Slack Security Operations Bridge",
                      desc: `Dispatch structured Block Kit alerts to ${draftConfig.notifications.slackDefaultChannel}.`,
                    },
                    {
                      key: "teamsEnabled" as const,
                      title: "Microsoft Teams Adaptive Cards",
                      desc: "Post report lifecycle events to the configured Teams SecOps webhook channel.",
                    },
                    {
                      key: "maintenanceAlerts" as const,
                      title: "Platform Maintenance & Release Advisories",
                      desc: "Notify administrators 72 hours prior to scheduled infrastructure maintenance windows.",
                    },
                    {
                      key: "securityAlerts" as const,
                      title: "Critical Security & Anomalous Login Alerts",
                      desc: "Immediate notification on new API token creation, SSO drift, or impossible-travel admin sign-ins.",
                    },
                    {
                      key: "billingAlerts" as const,
                      title: "Escrow Low-Balance & Invoice Threshold Alerts",
                      desc: "Notify FinOps when bounty escrow drops below 20% of monthly burn rate.",
                    },
                    {
                      key: "criticalP1PagerDutyEscalation" as const,
                      title: "Auto-Page On-Call Engineer for P1 Critical Submissions",
                      desc: "Trigger high-urgency PagerDuty incident within 60 seconds of a CVSS 9.0+ submission.",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4"
                    >
                      <div>
                        <div className="text-xs font-semibold text-ink">{item.title}</div>
                        <p className="mt-1 text-xs text-ink-muted">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draftConfig.notifications[item.key]}
                        onClick={() =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              [item.key]: !prev.notifications[item.key],
                            },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          draftConfig.notifications[item.key]
                            ? "bg-blue-600"
                            : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                            draftConfig.notifications[item.key]
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-border pt-5 md:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Summary Digest Frequency
                    </label>
                    <select
                      value={draftConfig.notifications.digestFrequency}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          notifications: {
                            ...prev.notifications,
                            digestFrequency: e.target
                              .value as OrganizationSettingsState["notifications"]["digestFrequency"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Real-Time">Real-Time Immediate</option>
                      <option value="Hourly Batch">Hourly Batch Rollup</option>
                      <option value="Daily Executive Digest">Daily Executive Digest (08:00)</option>
                      <option value="Weekly Rollup">Weekly Monday Rollup</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Default Slack Routing Channel
                    </label>
                    <input
                      type="text"
                      value={draftConfig.notifications.slackDefaultChannel}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          notifications: {
                            ...prev.notifications,
                            slackDefaultChannel: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      SLA Breach Pre-Warning (Minutes)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={1440}
                      value={draftConfig.notifications.slaBreachPreWarningMinutes}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          notifications: {
                            ...prev.notifications,
                            slaBreachPreWarningMinutes: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: FEATURE FLAGS */}
          {activeCategory === "feature-flags" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Organization Feature Flags & Rollout Gates
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      Enable or disable core modules, enterprise intelligence capabilities, beta sandboxes, and experimental features across this workspace.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
                      {enabledFlagsCount} Active
                    </span>
                    <span className="rounded-md bg-surface-muted px-2.5 py-1 font-medium text-ink-muted">
                      {draftConfig.featureFlags.length - enabledFlagsCount} Disabled
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {draftConfig.featureFlags.map((flag) => {
                    const badgeStyle =
                      flag.rolloutStatus === "GA"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : flag.rolloutStatus === "Enterprise"
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                        : flag.rolloutStatus === "Beta"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300";

                    return (
                      <div
                        key={flag.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface-muted/25 p-4 transition hover:border-border/90 sm:flex-row sm:items-center"
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{flag.name}</span>
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeStyle}`}
                            >
                              {flag.rolloutStatus}
                            </span>
                            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                              {flag.key}
                            </span>
                          </div>
                          <p className="text-xs text-ink-muted">{flag.description}</p>
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-ink-muted">
                            <span className="inline-flex items-center gap-1 font-medium text-ink">
                              <Info className="h-3 w-3 text-blue-500" />
                              {flag.impactNote}
                            </span>
                            <span>•</span>
                            <span>Category: {flag.category}</span>
                            <span>•</span>
                            <span>Last updated {flag.updatedAt}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span
                            className={`text-xs font-semibold ${
                              flag.enabled
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-ink-muted"
                            }`}
                          >
                            {flag.enabled ? "Enabled" : "Disabled"}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={flag.enabled}
                            onClick={() => toggleFeatureFlag(flag.id)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                              flag.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                                flag.enabled ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 7: API & DEVELOPER */}
          {activeCategory === "api-developer" && (
            <div className="space-y-6">
              {/* Organization API Keys */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Organization API Keys & Service Tokens
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      Manage scoped bearer tokens for SIEM forwarding, CI/CD scope synchronization, and programmatic report triage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateKeyModal(true)}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Generate API Key
                  </button>
                </div>

                {showCreateKeyModal && (
                  <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                    <div className="text-xs font-semibold text-ink">
                      Provision New Scoped Organization Token
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="Token description (e.g. Datadog SIEM Sync)"
                        value={newApiKeyName}
                        onChange={(e) => setNewApiKeyName(e.target.value)}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink sm:col-span-2"
                      />
                      <select
                        value={newApiKeyEnv}
                        onChange={(e) =>
                          setNewApiKeyEnv(
                            e.target.value as "production" | "staging" | "sandbox"
                          )
                        }
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink"
                      >
                        <option value="production">Production (co_live_)</option>
                        <option value="staging">Staging (co_stg_)</option>
                        <option value="sandbox">Sandbox (co_sbx_)</option>
                      </select>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateKeyModal(false)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateApiKey}
                        className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                      >
                        Issue Token
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  {draftConfig.apiDeveloper.apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface-muted/25 p-4 lg:flex-row lg:items-center"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-ink-muted" />
                          <span className="text-sm font-semibold text-ink">{apiKey.name}</span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              apiKey.status === "Active"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : apiKey.status === "Expiring Soon"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "bg-red-500/10 text-red-700 dark:text-red-300"
                            }`}
                          >
                            {apiKey.status}
                          </span>
                          <span className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-ink">
                            {apiKey.prefix}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                          <span>Created by {apiKey.createdBy}</span>
                          <span>•</span>
                          <span>Expires {apiKey.expiresAt}</span>
                          <span>•</span>
                          <span>Last used {apiKey.lastUsedAt}</span>
                          <span>•</span>
                          <span>CIDR: {apiKey.ipRestrictions.join(", ")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {apiKey.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded bg-slate-900/5 px-2 py-0.5 font-mono text-[10px] font-medium text-ink dark:bg-white/10"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end lg:self-center">
                        <button
                          type="button"
                          onClick={() => handleCopy(apiKey.prefix, apiKey.name)}
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
                        >
                          Copy Prefix
                        </button>
                        {apiKey.status !== "Revoked" && (
                          <button
                            type="button"
                            onClick={() => handleRevokeApiKey(apiKey.id)}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-400"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Webhooks, Rate Limits & Allowed Origins */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <h3 className="text-base font-semibold text-ink">
                  Webhook Defaults, Rate Limits & CORS Origins
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Configure cryptographic webhook signing, per-minute API quotas, and allowed browser origins.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Webhook Signature Algorithm
                    </label>
                    <select
                      value={draftConfig.apiDeveloper.webhookSignatureAlgorithm}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          apiDeveloper: {
                            ...prev.apiDeveloper,
                            webhookSignatureAlgorithm: e.target
                              .value as OrganizationSettingsState["apiDeveloper"]["webhookSignatureAlgorithm"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="HMAC-SHA256 (v2)">HMAC-SHA256 (v2 Timestamped)</option>
                      <option value="Ed25519 Asymmetric">Ed25519 Asymmetric Public Key</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Webhook Delivery Retry Policy
                    </label>
                    <select
                      value={draftConfig.apiDeveloper.webhookRetryPolicy}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          apiDeveloper: {
                            ...prev.apiDeveloper,
                            webhookRetryPolicy: e.target
                              .value as OrganizationSettingsState["apiDeveloper"]["webhookRetryPolicy"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Exponential Backoff (7 attempts / 24h)">
                        Exponential Backoff (7 attempts / 24h)
                      </option>
                      <option value="Linear (5 attempts / 1h)">Linear (5 attempts / 1h)</option>
                      <option value="Fail Fast (No Retry)">Fail Fast (No Retry)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Rate Limit (Requests / Minute)
                    </label>
                    <input
                      type="number"
                      min={60}
                      max={25000}
                      value={draftConfig.apiDeveloper.rateLimitRequestsPerMinute}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          apiDeveloper: {
                            ...prev.apiDeveloper,
                            rateLimitRequestsPerMinute: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink"
                    />
                    {validationErrors.rateLimit && (
                      <p className="mt-1 text-xs text-red-600">{validationErrors.rateLimit}</p>
                    )}
                  </div>
                </div>

                {/* Allowed CORS Origins */}
                <div className="mt-6 border-t border-border pt-5">
                  <label className="block text-xs font-semibold text-ink">
                    Allowed CORS Origins
                  </label>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Browser origins permitted to invoke authenticated Com Olho SDK endpoints on behalf of this organization.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="url"
                      placeholder="https://secops-portal.northwindcloud.io"
                      value={newOriginInput}
                      onChange={(e) => setNewOriginInput(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                    <button
                      type="button"
                      onClick={handleAddAllowedOrigin}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Origin
                    </button>
                  </div>
                  {originError && <p className="mt-1 text-xs text-red-600">{originError}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {draftConfig.apiDeveloper.allowedOrigins.map((origin) => (
                      <span
                        key={origin}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 font-mono text-xs text-ink"
                      >
                        {origin}
                        <button
                          type="button"
                          onClick={() => handleRemoveAllowedOrigin(origin)}
                          className="text-ink-muted hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Developer Mode & SDK Toggles */}
                <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 md:grid-cols-2">
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
                    <div>
                      <div className="text-xs font-semibold text-ink">
                        Developer Mode & Verbose Webhook Trace Inspector
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        Retain full HTTP request/response bodies for outbound webhooks for 72 hours to assist debugging.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draftConfig.apiDeveloper.developerMode}
                      onClick={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          apiDeveloper: {
                            ...prev.apiDeveloper,
                            developerMode: !prev.apiDeveloper.developerMode,
                          },
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        draftConfig.apiDeveloper.developerMode
                          ? "bg-blue-600"
                          : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                          draftConfig.apiDeveloper.developerMode
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
                    <div>
                      <div className="text-xs font-semibold text-ink">
                        TypeScript / Python CLI SDK Access
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        Allow engineers to authenticate via `@comolho/sdk` and automate triage workflows from terminal pipelines.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draftConfig.apiDeveloper.sdkAccessEnabled}
                      onClick={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          apiDeveloper: {
                            ...prev.apiDeveloper,
                            sdkAccessEnabled: !prev.apiDeveloper.sdkAccessEnabled,
                          },
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        draftConfig.apiDeveloper.sdkAccessEnabled
                          ? "bg-blue-600"
                          : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                          draftConfig.apiDeveloper.sdkAccessEnabled
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 8: DATA MANAGEMENT */}
          {activeCategory === "data-management" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Data Management, KMS Backups & Retention Policy
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      Manage encrypted point-in-time backups, compliance retention horizons, and full organization data exports.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        "Started full encrypted compliance archive export (estimated completion: 4 minutes)."
                      )
                    }
                    className="inline-flex items-center gap-1.5 self-start rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Trigger Full Data Export
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Automated Backup Schedule
                    </label>
                    <select
                      value={draftConfig.dataManagement.backupFrequency}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          dataManagement: {
                            ...prev.dataManagement,
                            backupFrequency: e.target
                              .value as OrganizationSettingsState["dataManagement"]["backupFrequency"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Every 6 Hours">Every 6 Hours (RPO 6h Enterprise)</option>
                      <option value="Daily at 02:00 UTC">Daily at 02:00 UTC</option>
                      <option value="Weekly Snapshot">Weekly Sunday Snapshot</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Encryption Key Management (KMS)
                    </label>
                    <select
                      value={draftConfig.dataManagement.backupEncryptionKeyMode}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          dataManagement: {
                            ...prev.dataManagement,
                            backupEncryptionKeyMode: e.target
                              .value as OrganizationSettingsState["dataManagement"]["backupEncryptionKeyMode"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Customer-Managed Key (AWS KMS BYOK)">
                        Customer-Managed Key (AWS KMS BYOK)
                      </option>
                      <option value="Platform KMS (AES-256-GCM)">
                        Platform KMS (AES-256-GCM Hardware HSM)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Vulnerability Report & Audit Retention Policy
                    </label>
                    <select
                      value={draftConfig.dataManagement.reportRetentionPolicy}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          dataManagement: {
                            ...prev.dataManagement,
                            reportRetentionPolicy: e.target
                              .value as OrganizationSettingsState["dataManagement"]["reportRetentionPolicy"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="7 Years (Compliance Standard)">
                        7 Years (SOC 2 / PCI-DSS / FedRAMP Standard)
                      </option>
                      <option value="5 Years">5 Years</option>
                      <option value="3 Years">3 Years</option>
                      <option value="Indefinite">Indefinite Archival</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Compliance Vault S3 Destination
                    </label>
                    <input
                      type="text"
                      value={draftConfig.dataManagement.auditLogExportS3Bucket}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          dataManagement: {
                            ...prev.dataManagement,
                            auditLogExportS3Bucket: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                  </div>
                </div>

                {/* Verified Snapshots Table */}
                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Recent Encrypted Recovery Snapshots
                    </h3>
                    <span className="text-xs text-ink-muted">
                      Last export: {draftConfig.dataManagement.lastExportCompletedAt}
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border bg-surface-muted/60 text-[11px] font-semibold uppercase text-ink-muted">
                        <tr>
                          <th className="px-4 py-2.5">Snapshot ID</th>
                          <th className="px-4 py-2.5">Timestamp</th>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5">Size</th>
                          <th className="px-4 py-2.5">Region</th>
                          <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {draftConfig.dataManagement.snapshots.map((snap) => (
                          <tr key={snap.id} className="hover:bg-surface-muted/30">
                            <td className="px-4 py-3 font-mono font-medium text-ink">{snap.id}</td>
                            <td className="px-4 py-3 text-ink-muted">{snap.timestamp}</td>
                            <td className="px-4 py-3 text-ink">{snap.type}</td>
                            <td className="px-4 py-3 font-mono text-ink-muted">{snap.size}</td>
                            <td className="px-4 py-3 text-ink-muted">{snap.region}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  showToast(
                                    `Initiated dry-run integrity check for snapshot ${snap.id}.`
                                  )
                                }
                                className="rounded border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-muted"
                              >
                                Restore / Verify
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 9: PRIVACY */}
          {activeCategory === "privacy" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    Privacy, PII Sanitization & Researcher Anonymity
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Enforce automated PII redaction in proof-of-concept uploads, EXIF stripping, GDPR consent policies, and researcher identity protection.
                  </p>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    {
                      key: "piiAutoRedactionInAttachments" as const,
                      title: "Automated PII & Credential Redaction in Report Attachments",
                      desc: "Scan inbound HAR files, HTTP traces, and screenshots to mask customer SSNs, payment cards, and bearer JWTs before storage.",
                    },
                    {
                      key: "exifMetadataStripping" as const,
                      title: "Automatic EXIF & Geolocation Stripping on Media Uploads",
                      desc: "Strip GPS coordinates, device serial numbers, and author metadata from all uploaded images and videos.",
                    },
                    {
                      key: "researcherIpAnonymization" as const,
                      title: "Researcher IP Address Truncation in Triage Views",
                      desc: "Mask the final octet of researcher IP addresses in standard analyst views while preserving cryptographic hashes for abuse prevention.",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4"
                    >
                      <div>
                        <div className="text-xs font-semibold text-ink">{item.title}</div>
                        <p className="mt-1 text-xs text-ink-muted">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draftConfig.privacy[item.key]}
                        onClick={() =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            privacy: {
                              ...prev.privacy,
                              [item.key]: !prev.privacy[item.key],
                            },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          draftConfig.privacy[item.key]
                            ? "bg-blue-600"
                            : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                            draftConfig.privacy[item.key] ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-border pt-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Consent & Regional Privacy Framework
                    </label>
                    <select
                      value={draftConfig.privacy.consentBannerEnforcement}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          privacy: {
                            ...prev.privacy,
                            consentBannerEnforcement: e.target
                              .value as OrganizationSettingsState["privacy"]["consentBannerEnforcement"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Strict GDPR / UK-GDPR">
                        Strict GDPR / UK-GDPR + LGPD Explicit Consent
                      </option>
                      <option value="CCPA / CPRA Notice">CCPA / CPRA Notice & Opt-Out</option>
                      <option value="Global Minimal">Global Minimal Essential Notice</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Cookie & Session Storage Policy
                    </label>
                    <select
                      value={draftConfig.privacy.cookiePreferencePolicy}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          privacy: {
                            ...prev.privacy,
                            cookiePreferencePolicy: e.target
                              .value as OrganizationSettingsState["privacy"]["cookiePreferencePolicy"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Essential Security Cookies Only">
                        Essential Security & Auth Cookies Only (Zero 3rd-Party)
                      </option>
                      <option value="Essential + Telemetry">
                        Essential + First-Party Performance Telemetry
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Researcher Identity Exposure to Analysts
                    </label>
                    <select
                      value={draftConfig.privacy.researcherProfilePrivacy}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          privacy: {
                            ...prev.privacy,
                            researcherProfilePrivacy: e.target
                              .value as OrganizationSettingsState["privacy"]["researcherProfilePrivacy"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Pseudonymous Handle Only">
                        Pseudonymous Handle Only (Tax Identity Isolated to FinOps)
                      </option>
                      <option value="Verified Legal Name to Org Admins">
                        Show Verified Legal Name to Organization Admins
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Organization Directory Visibility
                    </label>
                    <select
                      value={draftConfig.privacy.organizationDirectoryVisibility}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          privacy: {
                            ...prev.privacy,
                            organizationDirectoryVisibility: e.target
                              .value as OrganizationSettingsState["privacy"]["organizationDirectoryVisibility"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Public Verified Enterprise">
                        Public Verified Enterprise Profile
                      </option>
                      <option value="Authenticated Researchers Only">
                        Authenticated Researchers Only
                      </option>
                      <option value="Stealth / Invite-Only">
                        Stealth Mode (Hidden from Public Search)
                      </option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-ink">
                      Data Protection Officer (DPO) Contact Email
                    </label>
                    <input
                      type="email"
                      value={draftConfig.privacy.dpoContactEmail}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          privacy: { ...prev.privacy, dpoContactEmail: e.target.value },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 10: ADVANCED */}
          {activeCategory === "advanced" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-ink">
                    Advanced Infrastructure, Custom Headers & Metadata
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Configure environment isolation, maintenance windows, custom outbound HTTP headers, and structured audit metadata tags.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Workspace Environment Mode
                    </label>
                    <select
                      value={draftConfig.advanced.environmentMode}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          advanced: {
                            ...prev.advanced,
                            environmentMode: e.target
                              .value as OrganizationSettingsState["advanced"]["environmentMode"],
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="Production">Production (Live Bounty & SLA Enforcement)</option>
                      <option value="Staging Mirror">Staging Mirror (Dry-Run Webhooks)</option>
                      <option value="Hybrid Evaluation">Hybrid Evaluation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">
                      Maintenance Banner Message
                    </label>
                    <input
                      type="text"
                      value={draftConfig.advanced.maintenanceBannerMessage}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          advanced: {
                            ...prev.advanced,
                            maintenanceBannerMessage: e.target.value,
                          },
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    {
                      key: "sandboxModeEnabled" as const,
                      title: "Enable Isolated Triage Sandbox Mode",
                      desc: "Route simulated researcher submissions into an isolated test queue without triggering production PagerDuty or ledger payouts.",
                    },
                    {
                      key: "maintenanceModeEnabled" as const,
                      title: "Activate Organization Maintenance Mode",
                      desc: "Display maintenance banner on all public disclosure portals and pause SLA countdown clocks globally.",
                    },
                    {
                      key: "strictIpAllowlistEnforcement" as const,
                      title: "Strict Corporate CIDR IP Allowlist Enforcement",
                      desc: "Require admin and analyst sessions to originate from verified corporate VPN CIDR blocks.",
                    },
                    {
                      key: "enforceHardwareWebAuthnForAdmins" as const,
                      title: "Require FIDO2 / WebAuthn Hardware Keys for Admins",
                      desc: "Disallow SMS or TOTP fallback for users holding Organization Owner or Security Admin roles.",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4"
                    >
                      <div>
                        <div className="text-xs font-semibold text-ink">{item.title}</div>
                        <p className="mt-1 text-xs text-ink-muted">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draftConfig.advanced[item.key]}
                        onClick={() =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            advanced: {
                              ...prev.advanced,
                              [item.key]: !prev.advanced[item.key],
                            },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          draftConfig.advanced[item.key]
                            ? "bg-blue-600"
                            : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                            draftConfig.advanced[item.key] ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Custom Headers */}
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Custom Outbound HTTP Headers
                  </h3>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Injected into outbound webhook deliveries and asset ownership verification probes to traverse enterprise WAFs.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input
                      type="text"
                      placeholder="Header-Name (e.g. X-WAF-Bypass)"
                      value={newHeaderName}
                      onChange={(e) => setNewHeaderName(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                    <input
                      type="text"
                      placeholder="Header Value / Secret"
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                    <select
                      value={newHeaderScope}
                      onChange={(e) =>
                        setNewHeaderScope(
                          e.target.value as
                            | "All Outbound Webhooks"
                            | "Asset Verification Probes"
                            | "SCIM Provisioning"
                        )
                      }
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink"
                    >
                      <option value="All Outbound Webhooks">All Outbound Webhooks</option>
                      <option value="Asset Verification Probes">Asset Verification Probes</option>
                      <option value="SCIM Provisioning">SCIM Provisioning</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddCustomHeader}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Header
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {draftConfig.advanced.customHeaders.map((hdr) => (
                      <div
                        key={hdr.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/30 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold text-ink">{hdr.headerName}:</span>
                          <span className="font-mono text-ink-muted">{hdr.headerValueMasked}</span>
                          <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                            {hdr.scope}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              advanced: {
                                ...prev.advanced,
                                customHeaders: prev.advanced.customHeaders.filter(
                                  (h) => h.id !== hdr.id
                                ),
                              },
                            }))
                          }
                          className="text-ink-muted hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Metadata Tags */}
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Organization Custom Metadata Key-Value Pairs
                  </h3>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Attached to SIEM audit events, cost center exports, and GraphQL organization queries.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="key (e.g. business_unit)"
                      value={newMetaKey}
                      onChange={(e) => setNewMetaKey(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                    <input
                      type="text"
                      placeholder="value (e.g. cloud_platform_sec)"
                      value={newMetaValue}
                      onChange={(e) => setNewMetaValue(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
                    />
                    <button
                      type="button"
                      onClick={handleAddMetadata}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Metadata Tag
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {draftConfig.advanced.customMetadata.map((meta) => (
                      <div
                        key={meta.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs"
                      >
                        <div className="truncate font-mono">
                          <span className="font-semibold text-ink">{meta.key}</span>
                          <span className="text-ink-muted"> = {meta.value}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              advanced: {
                                ...prev.advanced,
                                customMetadata: prev.advanced.customMetadata.filter(
                                  (m) => m.id !== meta.id
                                ),
                              },
                            }))
                          }
                          className="ml-2 text-ink-muted hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 11: DANGER ZONE */}
          {activeCategory === "danger" && (
            <div className="space-y-6">
              <div className="rounded-xl border-2 border-red-500/40 bg-surface p-6 shadow-xs">
                <div className="flex items-start gap-3 border-b border-red-500/20 pb-4">
                  <div className="rounded-lg bg-red-500/10 p-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-red-600 dark:text-red-400">
                      Danger Zone — High-Impact Administrative Actions
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      Actions in this section affect the entire organization workspace, active bounty programs, and cryptographic keys. Every operation requires explicit phrase confirmation and hardware MFA verification.
                    </p>
                  </div>
                </div>

                <div className="mt-5 divide-y divide-border">
                  {DANGER_ZONE_ACTIONS.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{item.title}</span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              item.severity === "critical"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {item.severity === "critical" ? "Irreversible / Critical" : "High Risk"}
                          </span>
                          {item.requiresMfa && (
                            <span className="rounded border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                              MFA + Owner Verification
                            </span>
                          )}
                        </div>
                        <p className="max-w-2xl text-xs text-ink-muted">{item.description}</p>
                        <p className="text-[11px] font-medium text-red-600/90 dark:text-red-400">
                          Impact: {item.impactSummary}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveDangerAction(item);
                          setDangerPhraseInput("");
                          setDangerMfaCode("");
                          setDangerOwnerEmailInput("");
                          setDangerError(null);
                        }}
                        className={`shrink-0 self-start rounded-lg border px-4 py-2 text-xs font-semibold transition sm:self-center ${
                          item.severity === "critical"
                            ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                            : "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300"
                        }`}
                      >
                        {item.buttonLabel}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Unsaved Changes Bar */}
      {hasUnsavedChanges && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-slate-900/95 px-6 py-3.5 text-white shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              <div>
                <div className="text-xs font-semibold">
                  Unsaved Organization Configuration Changes ({dirtyCategoriesCount}{" "}
                  {dirtyCategoriesCount === 1 ? "category" : "categories"} modified)
                </div>
                <div className="text-[11px] text-slate-300">
                  {hasValidationError
                    ? "Resolve highlighted validation errors before committing changes."
                    : "Review modified policies and save to propagate across all organization programs."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Discard Changes
              </button>
              <button
                type="button"
                disabled={hasValidationError}
                onClick={handleSaveChanges}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${
                  hasValidationError
                    ? "cursor-not-allowed bg-slate-700 text-slate-400"
                    : "bg-blue-600 text-white hover:bg-blue-500"
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Configuration Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-ink">
                Import Organization Configuration JSON
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-ink-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Paste a valid Com Olho organization configuration manifest to stage changes across all settings categories.
            </p>
            <textarea
              rows={10}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs text-ink focus:border-blue-600 focus:outline-none"
            />
            {importError && <p className="mt-2 text-xs text-red-600">{importError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Stage Imported Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Security Danger Zone Confirmation Modal */}
      {activeDangerAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-xl border-2 border-red-500/40 bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-red-500/10 p-2 text-red-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">{activeDangerAction.title}</h3>
                  <p className="text-xs text-ink-muted">
                    Root Owner & Hardware MFA Verification Required
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDangerAction(null)}
                className="text-ink-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <strong>Warning:</strong> {activeDangerAction.impactSummary}
              </div>

              {activeDangerAction.id === "transfer-ownership" && (
                <div>
                  <label className="block text-xs font-semibold text-ink">
                    New Primary Owner Email (Verified Organization Admin)
                  </label>
                  <input
                    type="email"
                    placeholder="m.thorne@northwindcloud.io"
                    value={dangerOwnerEmailInput}
                    onChange={(e) => setDangerOwnerEmailInput(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink">
                  Type{" "}
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-red-600">
                    {activeDangerAction.confirmationPhrase}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  type="text"
                  value={dangerPhraseInput}
                  onChange={(e) => setDangerPhraseInput(e.target.value)}
                  placeholder={activeDangerAction.confirmationPhrase}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink">
                  6-Digit Hardware Authenticator / WebAuthn Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={dangerMfaCode}
                  onChange={(e) => setDangerMfaCode(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm tracking-widest text-ink"
                />
              </div>

              {dangerError && <p className="text-xs font-medium text-red-600">{dangerError}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setActiveDangerAction(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDangerAction}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Confirm & Execute {activeDangerAction.buttonLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

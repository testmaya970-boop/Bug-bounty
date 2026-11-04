"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Coins,
  Eye,
  FileCheck2,
  FolderGit2,
  Globe,
  GripVertical,
  Layers,
  LayoutDashboard,
  Lock,
  Mail,
  Network,
  Package,
  Plus,
  Rocket,
  Save,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  UserPlus,
  Webhook,
  X,
} from "lucide-react";
import { launchProgramFromStudioAction, type LaunchStep } from "../../actions/launch-studio";
import {
  ASSET_CATEGORIES,
  PROGRAM_BLUEPRINTS,
  STUDIO_AUTOMATION_MODULES,
  STUDIO_TARGET_TYPES,
  makeStudioAsset,
  type StudioResearcher,
  type StudioTargetType,
  STUDIO_STEPS,
  WELCOME_ENGAGEMENT_OPTIONS,
  calculateReadinessReport,
  calculateRewardForecast,
  calculateScopeTelemetry,
  createInitialStudioState,
  type StudioDefaults,
  type AssetCategory,
  type AutomationCategory,
  type LaunchStudioState,
  type ProgramBlueprint,
  type ResearcherCohortTab,
  type StudioAsset,
  type StudioLifecycleMode,
  type StudioStepId,
  type WelcomeEngagementOptionId,
} from "../../lib/launch-program-studio";
import { engagementTypeLabel } from "../../lib/program-status";
import type { ProgramSummary } from "../../types/program";
import { ProgramStatusBadge } from "../ui/badge";
import { DeleteDraftProgramDialog } from "./delete-draft-program-dialog";
import { BUSINESS_UNITS, type BusinessUnit } from "../../lib/business-units";

export interface LaunchProgramStudioProps {
  organizationId: string;
  organizationName: string;
  existingPrograms: ProgramSummary[];
  /** The organization's real asset inventory, as studio assets. */
  assets: StudioAsset[];
  /** Researcher suggestions from the public leaderboard and past participants. */
  researchers: StudioResearcher[];
  /** Integration modules the organization has connected. */
  connectedModuleIds: string[];
  /** Active organization members, for the product owner picker. */
  members: { id: string; name: string }[];
  /** Organization-wide defaults a new engagement starts from. */
  defaults: StudioDefaults & { rewardCurrency: "USD" | "INR" };
  canCreate: boolean;
  initialMode?: "studio" | "directory";
  onCloseModal?: () => void;
}

const STORAGE_KEY_PREFIX = "unpatched-launch-studio-v1:";

function CategoryIcon({ category, className = "size-4" }: { category: AssetCategory; className?: string }) {
  switch (category) {
    case "Domains":
      return <Globe className={className} />;
    case "APIs":
      return <Webhook className={className} />;
    case "Mobile Apps":
      return <Smartphone className={className} />;
    case "Web Apps":
      return <LayoutDashboard className={className} />;
    case "Repositories":
      return <FolderGit2 className={className} />;
    case "Cloud Accounts":
      return <Cloud className={className} />;
    case "IP Ranges":
      return <Network className={className} />;
    case "Containers":
      return <Package className={className} />;
    case "Kubernetes":
      return <Server className={className} />;
    case "AI Models":
      return <Bot className={className} />;
  }
}

export function LaunchProgramStudio({
  organizationId,
  organizationName,
  existingPrograms,
  assets: inventoryAssets,
  researchers,
  connectedModuleIds,
  members,
  defaults,
  canCreate,
  initialMode = "studio",
  onCloseModal,
}: LaunchProgramStudioProps) {
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<"studio" | "directory">(initialMode);
  const [state, setState] = useState<LaunchStudioState>(() => createInitialStudioState(defaults));

  const [lastSavedLabel, setLastSavedLabel] = useState<string>("Autosaved just now");
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Targets typed in on the Scope step: validated by the scope rules when the program is created.
  const [customAssets, setCustomAssets] = useState<StudioAsset[]>([]);
  // Kept with the draft, so a reload mid-flow doesn't drop them. Loaded after mount (the server
  // has no storage) and saved only once loaded, so the first render never overwrites them.
  const skipTargetsSave = useRef(true);
  const skipDraftSave = useRef(true);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}:targets`);
      if (raw) setCustomAssets(JSON.parse(raw) as StudioAsset[]);
    } catch {
      // Ignore storage issues
    }
    skipTargetsSave.current = true;
  }, [organizationId]);
  useEffect(() => {
    if (skipTargetsSave.current) {
      skipTargetsSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${organizationId}:targets`, JSON.stringify(customAssets));
    } catch {
      // Ignore storage issues
    }
  }, [organizationId, customAssets]);
  const [newTargetType, setNewTargetType] = useState<StudioTargetType>("domain");
  const [newTarget, setNewTarget] = useState("");
  const assets = useMemo(() => [...inventoryAssets, ...customAssets], [inventoryAssets, customAssets]);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchedSuccess, setLaunchedSuccess] = useState<{
    programId: string;
    programName: string;
    mode: "launched" | "scheduled" | "draft";
    steps: LaunchStep[];
    submitted: boolean;
  } | null>(null);
  const [pendingLaunch, startLaunchTransition] = useTransition();

  // Step 4 — Scope Studio filters & drag state
  const [activeAssetCategory, setActiveAssetCategory] = useState<AssetCategory | "All">("All");
  const [assetSearch, setAssetSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("All");
  const [verificationFilter, setVerificationFilter] = useState<"All" | "Verified" | "Pending">("All");
  const [riskFilter, setRiskFilter] = useState<string>("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);

  // Step 5 — Rewards & Policies sub-view & new rule input
  const [newOutOfScopeRule, setNewOutOfScopeRule] = useState("");

  // Step 6 — Researcher Access state
  const [activeCohortTab, setActiveCohortTab] = useState<ResearcherCohortTab>("Recommended Researchers");
  const [researcherSearch, setResearcherSearch] = useState("");
  const countryFilter: string = "All";
  const skillFilter: string = "All";
  const [minReputationFilter, setMinReputationFilter] = useState<number>(0);
  const minSignalFilter = 0;
  const languageFilter: string = "All";
  const industryFilter: string = "All";
  const availabilityFilter: string = "All";
  const [bulkSelectedResearcherIds, setBulkSelectedResearcherIds] = useState<string[]>([]);
  const [emailInviteInput, setEmailInviteInput] = useState("");

  // Step 7 — Automation category filter
  const [activeAutomationCategory, setActiveAutomationCategory] = useState<AutomationCategory | "All">("All");

  // Sync URL query params (`?step=`, `?view=`) after hydration
  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "directory" || viewParam === "list") {
      setViewMode("directory");
    } else if (viewParam === "studio") {
      setViewMode("studio");
    }
    const stepParam = searchParams.get("step") as StudioStepId | null;
    if (stepParam && STUDIO_STEPS.some((s) => s.id === stepParam)) {
      setState((prev) => ({ ...prev, currentStep: stepParam }));
    }
  }, [searchParams]);

  // Load saved draft from localStorage on mount if available
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}`);
      skipDraftSave.current = true;
      // A draft that only holds the untouched starting state isn't worth restoring (or announcing).
      if (raw && raw !== JSON.stringify(state)) {
        const parsed = JSON.parse(raw) as Partial<LaunchStudioState>;
        if (parsed && typeof parsed.programName === "string") {
          setState((prev) => ({
            ...prev,
            ...parsed,
            // Always start at welcome unless URL step param overrides
            currentStep: (searchParams.get("step") as StudioStepId) || parsed.currentStep || "welcome",
          }));
          setLastSavedLabel("Restored saved studio draft");
        }
      }
    } catch {
      // Ignore storage access issues
    }
  }, [organizationId, searchParams]);

  // Autosave to localStorage on state changes; the run in the same commit as the restore still
  // sees the starting state, so it is skipped rather than writing over the saved draft.
  useEffect(() => {
    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${organizationId}`, JSON.stringify(state));
    } catch {
      // Ignore storage quota issues
    }
  }, [organizationId, state]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = window.setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, []);

  const currentStepMeta = useMemo(
    () => STUDIO_STEPS.find((s) => s.id === state.currentStep) ?? STUDIO_STEPS[0],
    [state.currentStep],
  );

  const businessUnitLabel = BUSINESS_UNITS.find((b) => b.value === state.businessUnit)?.label ?? "";
  const productOwnerName = members.find((m) => m.id === state.productOwner)?.name ?? "";
  const [confirmReset, setConfirmReset] = useState(false);
  // Clears the saved draft and any targets added to it, so the next program starts clean.
  function handleStartOver() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    try {
      window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${organizationId}`);
      window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${organizationId}:targets`);
    } catch {
      // Ignore storage issues
    }
    setCustomAssets([]);
    setState(createInitialStudioState(defaults));
    setConfirmReset(false);
  }

  const selectedBlueprint = useMemo(
    () => PROGRAM_BLUEPRINTS.find((b) => b.id === state.blueprintId) ?? PROGRAM_BLUEPRINTS[0],
    [state.blueprintId],
  );

  const scopeTelemetry = useMemo(
    () => calculateScopeTelemetry(state.selectedAssetIds, assets),
    [state.selectedAssetIds],
  );

  const rewardForecast = useMemo(
    () => calculateRewardForecast(state.rewardMatrix, state.visibility, state.selectedAssetIds.length),
    [state.rewardMatrix, state.visibility, state.selectedAssetIds.length],
  );

  const readinessReport = useMemo(
    () => calculateReadinessReport(state, assets, connectedModuleIds),
    [state],
  );

  const goToStep = useCallback((stepId: StudioStepId) => {
    setInlineError(null);
    setState((prev) => ({ ...prev, currentStep: stepId }));
    setLastSavedLabel("Autosaved step progress");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleNextStep = useCallback(() => {
    if (state.currentStep === "details" && !state.programName.trim()) {
      setInlineError("Please enter a Program Name before continuing.");
      return;
    }
    if (state.currentStep === "scope" && state.selectedAssetIds.length === 0) {
      setInlineError("Select at least one asset in Scope Studio before continuing.");
      return;
    }
    const idx = STUDIO_STEPS.findIndex((s) => s.id === state.currentStep);
    if (idx >= 0 && idx < STUDIO_STEPS.length - 1) {
      goToStep(STUDIO_STEPS[idx + 1].id);
    }
  }, [goToStep, state.currentStep, state.programName, state.selectedAssetIds.length]);

  const handlePreviousStep = useCallback(() => {
    const idx = STUDIO_STEPS.findIndex((s) => s.id === state.currentStep);
    if (idx > 0) {
      goToStep(STUDIO_STEPS[idx - 1].id);
    }
  }, [goToStep, state.currentStep]);

  // Keyboard navigation (Alt + ArrowRight / Alt + ArrowLeft)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        handleNextStep();
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        handlePreviousStep();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNextStep, handlePreviousStep]);

  function handleSelectWelcomeOption(optionId: WelcomeEngagementOptionId) {
    const option = WELCOME_ENGAGEMENT_OPTIONS.find((o) => o.id === optionId);
    if (!option) return;
    setState((prev) => ({
      ...prev,
      welcomeChoice: optionId,
      visibility: option.defaultVisibility,
      lifecycle: optionId === "pentest_campaign" ? "Scheduled" : "Active",
      endDate: optionId === "pentest_campaign" ? "2026-12-15" : "",
    }));
    setLastSavedLabel(`Selected ${option.title}`);
  }

  function handleApplyBlueprint(blueprint: ProgramBlueprint) {
    setState((prev) => ({
      ...prev,
      blueprintId: blueprint.id,
      programName: blueprint.recommendedProgramName,
      shortDescription: blueprint.recommendedDescription,
      selectedAssetIds: [...blueprint.defaultAssetIds],
      rewardMatrix: structuredClone(blueprint.rewardMatrix),
      monthlyBudgetReserve: blueprint.monthlyBudgetEstimate,
      policy: structuredClone(blueprint.policy),
      enabledModuleIds: [...blueprint.defaultIntegrations, ...blueprint.defaultAutomations],
    }));
    showToast(`Applied ${blueprint.name} blueprint (${blueprint.estimatedSetupMinutes} min preset)`);
    setLastSavedLabel(`Applied ${blueprint.name} template`);
  }

  function toggleAssetInScope(assetId: string) {
    setState((prev) => {
      const exists = prev.selectedAssetIds.includes(assetId);
      const nextIds = exists
        ? prev.selectedAssetIds.filter((id) => id !== assetId)
        : [...prev.selectedAssetIds, assetId];
      return { ...prev, selectedAssetIds: nextIds };
    });
    setInlineError(null);
    setLastSavedLabel("Updated scope assets");
  }

  function handleDropAssetIntoScope(e: React.DragEvent) {
    e.preventDefault();
    setIsDropZoneActive(false);
    const assetId = e.dataTransfer.getData("text/plain") || draggedAssetId;
    if (assetId && !state.selectedAssetIds.includes(assetId)) {
      setState((prev) => ({
        ...prev,
        selectedAssetIds: [...prev.selectedAssetIds, assetId],
      }));
      const asset = assets.find((a) => a.id === assetId);
      if (asset) showToast(`Added ${asset.identifier} to Program Scope`);
    }
    setDraggedAssetId(null);
  }

  function handleSaveDraftSnapshot() {
    setIsSavingDraft(true);
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${organizationId}`, JSON.stringify(state));
    } catch {
      // Ignore
    }
    window.setTimeout(() => {
      setIsSavingDraft(false);
      setLastSavedLabel("Saved on this device");
      showToast("Draft saved on this device. It is created in Unpatched when you launch or save it as a draft below.");
    }, 250);
  }

  function handleExecuteLaunch(mode: "launched" | "scheduled" | "draft") {
    const trimmedName = state.programName.trim();
    if (!trimmedName) {
      setLaunchError("Give the program a name on the Details step.");
      return;
    }
    const welcomeOption = WELCOME_ENGAGEMENT_OPTIONS.find((o) => o.id === state.welcomeChoice) ?? WELCOME_ENGAGEMENT_OPTIONS[0];
    const isVdp = state.visibility === "VDP";
    const selected = assets.filter((a) => state.selectedAssetIds.includes(a.id));
    const rules = [
      `Duplicates: ${state.policy.duplicateHandling}.`,
      `Severity scoring: ${state.policy.severityScoring}.`,
      `Reports with no response from the researcher close after ${state.policy.autoCloseDays} days.`,
      "",
      "Out of scope:",
      ...state.policy.outOfScopeRules.map((r) => `- ${r}`),
    ].join("\n");
    setLaunchError(null);
    startLaunchTransition(async () => {
      const result = await launchProgramFromStudioAction({
        organizationId,
        name: trimmedName,
        description: state.shortDescription,
        // Drafts saved before these became pickers can hold free text; send only real values.
        businessUnit: businessUnitLabel ? (state.businessUnit as BusinessUnit) : null,
        productOwnerId: productOwnerName ? state.productOwner : null,
        securityContact: state.securityContact.trim() || null,
        programType: isVdp ? "vdp" : welcomeOption.programType,
        engagementType: welcomeOption.engagementType,
        visibility: state.visibility === "Public" || isVdp ? "public" : "private",
        scope: selected.map((a) => ({ assetType: a.targetType, target: a.identifier })),
        rewards: isVdp ? null : { currency: defaults.rewardCurrency, ...state.rewardMatrix },
        policy: {
          rulesOfEngagement: rules,
          safeHarbor: state.policy.safeHarborType !== "Standard Authorization",
          disclosureDays: state.policy.disclosureTimelineDays,
          firstResponseTargetHours: state.policy.responseSlaHours,
          triageTargetHours: state.policy.triageSlaHours,
          resolutionTargetDays: state.policy.resolutionSlaDays,
        },
        inviteUsernames: [
          ...researchers.filter((r) => state.invitedResearcherIds.includes(r.id)).map((r) => r.handle),
          ...state.invitedEmails,
        ],
        submitForReview: mode === "launched",
      });
      if (!result.ok) {
        setLaunchError(result.message);
        return;
      }
      try {
        window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${organizationId}`);
        window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${organizationId}:targets`);
      } catch {
        // Ignore
      }
      setLaunchedSuccess({ programId: result.programId, programName: trimmedName, mode: result.submitted ? "launched" : "draft", steps: result.steps, submitted: result.submitted });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Filtered assets for Step 4 Middle Panel
  const allOwnerTeams = useMemo(
    () => Array.from(new Set(assets.map((a) => a.ownerTeam))),
    [],
  );
  const allAssetTags = useMemo(
    () => Array.from(new Set(assets.flatMap((a) => a.tags))).slice(0, 14),
    [],
  );

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (activeAssetCategory !== "All" && asset.category !== activeAssetCategory) return false;
      if (envFilter !== "All" && asset.environment !== envFilter) return false;
      if (verificationFilter === "Verified" && !asset.verified) return false;
      if (verificationFilter === "Pending" && asset.verified) return false;
      if (riskFilter !== "All" && asset.riskTier !== riskFilter) return false;
      if (ownerFilter !== "All" && asset.ownerTeam !== ownerFilter) return false;
      if (tagFilter !== "All" && !asset.tags.includes(tagFilter)) return false;
      if (assetSearch.trim()) {
        const q = assetSearch.toLowerCase();
        const match =
          asset.identifier.toLowerCase().includes(q) ||
          asset.title.toLowerCase().includes(q) ||
          asset.ownerTeam.toLowerCase().includes(q) ||
          asset.tags.some((t) => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [
    activeAssetCategory,
    assetSearch,
    envFilter,
    ownerFilter,
    riskFilter,
    tagFilter,
    verificationFilter,
  ]);

  const selectedAssetsList = useMemo(() => {
    const set = new Set(state.selectedAssetIds);
    return assets.filter((a) => set.has(a.id));
  }, [state.selectedAssetIds]);

  // Filtered researchers for Step 6
  const filteredResearchers = useMemo(() => {
    return researchers.filter((r) => {
      if (
        activeCohortTab !== "Invite by Email" &&
        activeCohortTab !== "Invite by Link" &&
        r.cohortCategory !== activeCohortTab
      ) {
        return false;
      }
      if (countryFilter !== "All" && r.country !== countryFilter) return false;
      if (skillFilter !== "All" && !r.skills.includes(skillFilter)) return false;
      if (r.reputation < minReputationFilter) return false;
      if (r.signalScore < minSignalFilter) return false;
      if (languageFilter !== "All" && !r.languages.includes(languageFilter)) return false;
      if (industryFilter !== "All" && !r.industryExperience.includes(industryFilter)) return false;
      if (availabilityFilter !== "All" && r.availability !== availabilityFilter) return false;
      if (researcherSearch.trim()) {
        const q = researcherSearch.toLowerCase();
        const match =
          r.name.toLowerCase().includes(q) ||
          r.handle.toLowerCase().includes(q) ||
          r.skills.some((s) => s.toLowerCase().includes(q)) ||
          r.country.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    activeCohortTab,
    availabilityFilter,
    countryFilter,
    industryFilter,
    languageFilter,
    minReputationFilter,
    minSignalFilter,
    researcherSearch,
    skillFilter,
  ]);

  // Filtered automation modules for Step 7
  const filteredAutomationModules = useMemo(() => {
    if (activeAutomationCategory === "All") return STUDIO_AUTOMATION_MODULES;
    return STUDIO_AUTOMATION_MODULES.filter((m) => m.category === activeAutomationCategory);
  }, [activeAutomationCategory]);

  // ---------------------------------------------------------------------------
  // SUCCESS SCREEN RENDER
  // ---------------------------------------------------------------------------
  if (launchedSuccess) {
    const programUrl = `/organizations/${organizationId}/programs/${launchedSuccess.programId}` as Route;
    const dashboardUrl = `/organizations/${organizationId}` as Route;
    const assetsUrl = `/organizations/${organizationId}/assets` as Route;
    const rewardsUrl = `/organizations/${organizationId}/rewards` as Route;
    const researchersUrl = `/organizations/${organizationId}/researchers` as Route;

    return (
      <div className="min-h-screen bg-[#F6F8FB] px-4 py-8 text-[#111827] sm:px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto max-w-5xl overflow-hidden rounded-[24px] border border-[#E7EAF0] bg-white shadow-[0_20px_50px_rgba(16,24,40,0.08)]"
        >
          {/* Top celebratory banner */}
          <div className="border-b border-[#E7EAF0] bg-[linear-gradient(135deg,#EFF6FF_0%,#ECFDF3_52%,#FFFFFF_100%)] px-6 py-8 sm:px-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-3.5 py-1 text-[12px] font-semibold text-[#027A48]">
                <CheckCircle2 className="size-4 text-[#12B76A]" />
                {launchedSuccess.submitted ? "Submitted for launch review" : "Saved as a draft"}
              </span>
              <span className="font-mono text-[12px] text-[#475467]">
                Readiness Score: <strong className="text-[#111827]">{readinessReport.score}%</strong> · Blueprint:{" "}
                <strong className="text-[#111827]">{selectedBlueprint.name}</strong>
              </span>
            </div>

            <h1 className="mt-5 text-[30px] font-bold tracking-tight text-[#111827] sm:text-[36px]">
              {launchedSuccess.submitted ? "🎉 Program submitted for launch" : "Program saved as a draft"}
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-[#475467]">
              <strong className="font-semibold text-[#111827]">{launchedSuccess.programName}</strong> was created for <strong className="font-semibold text-[#111827]">{organizationName}</strong>. {launchedSuccess.submitted ? "Unpatched reviews scope and policy before it goes live; you are notified when it does." : "Finish anything below on the program page, then submit it for launch review."}
            </p>

            <ul className="mt-4 space-y-1 text-[13px]">
              {launchedSuccess.steps.map((step) => (
                <li key={step.step} className={step.ok ? "text-[#027A48]" : "text-[#B42318]"}>
                  {step.ok ? "✓" : "✕"} {step.step}
                  {step.message && <span className="text-[#667085]"> : {step.message}</span>}
                </li>
              ))}
            </ul>
            {/* Key deployment telemetry strip */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-[14px] border border-[#E7EAF0] bg-white/90 p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-[#667085] uppercase">Visibility</p>
                <p className="mt-1 font-mono text-[16px] font-bold text-[#111827]">{state.visibility}</p>
              </div>
              <div className="rounded-[14px] border border-[#E7EAF0] bg-white/90 p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-[#667085] uppercase">Attack Surface</p>
                <p className="mt-1 font-mono text-[16px] font-bold text-[#111827]">
                  {state.selectedAssetIds.length} Assets ({scopeTelemetry.verificationPercent}% Verified)
                </p>
              </div>
              <div className="rounded-[14px] border border-[#E7EAF0] bg-white/90 p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-[#667085] uppercase">Researcher Cohort</p>
                <p className="mt-1 font-mono text-[16px] font-bold text-[#111827]">
                  {state.invitedResearcherIds.length + state.invitedEmails.length} Invited
                </p>
              </div>
              <div className="rounded-[14px] border border-[#E7EAF0] bg-white/90 p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-[#667085] uppercase">Est. Monthly Spend</p>
                <p className="mt-1 font-mono text-[16px] font-bold text-[#12B76A]">
                  ${rewardForecast.estimatedMonthlySpend.toLocaleString("en-US")}/mo
                </p>
              </div>
            </div>
          </div>

          {/* 7 Quick Actions Grid */}
          <div className="p-6 sm:p-10">
            <h2 className="text-[14px] font-semibold tracking-wider text-[#475467] uppercase">
              Post-Launch Quick Actions
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                prefetch={false}
                href={dashboardUrl}
                className="group flex items-start justify-between rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563EB] hover:shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#EFF6FF] text-[#2563EB]">
                    <LayoutDashboard className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      Open Dashboard
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#667085]">
                      Return to {organizationName} executive command center
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-[#98A2B3] group-hover:text-[#2563EB]" />
              </Link>

              <Link
                prefetch={false}
                href={programUrl}
                className="group flex items-start justify-between rounded-[16px] border border-[#2563EB]/30 bg-[#EFF6FF]/40 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563EB] hover:bg-[#EFF6FF]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#2563EB] text-white">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      View Program
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#475467]">
                      Inspect live program operations &amp; triage queue
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-[#2563EB]" />
              </Link>

              <Link
                prefetch={false}
                href={researchersUrl}
                className="group flex items-start justify-between rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563EB] hover:shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F8FAFC] text-[#111827]">
                    <UserPlus className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      Invite More Researchers
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#667085]">
                      Expand private cohort from global leaderboard
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-[#98A2B3] group-hover:text-[#2563EB]" />
              </Link>

              <Link
                prefetch={false}
                href={assetsUrl}
                className="group flex items-start justify-between rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563EB] hover:shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F8FAFC] text-[#111827]">
                    <Target className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      Add Assets
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#667085]">
                      Sync additional domains, APIs &amp; cloud accounts
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-[#98A2B3] group-hover:text-[#2563EB]" />
              </Link>

              <Link
                prefetch={false}
                href={rewardsUrl}
                className="group flex items-start justify-between rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563EB] hover:shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F8FAFC] text-[#111827]">
                    <Coins className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      Create First Reward Group
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#667085]">
                      Configure tier-specific bonus multipliers
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-[#98A2B3] group-hover:text-[#2563EB]" />
              </Link>


            </div>

            {toastMessage && (
              <div className="mt-4 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-[13px] font-medium text-[#1E40AF]">
                {toastMessage}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN STUDIO EXPERIENCE
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#111827]">
      {/* 1. STICKY STUDIO TOP NAVIGATION & 9-STEP PROGRESS BAR */}
      <header className="sticky top-0 z-30 border-b border-[#E7EAF0] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Left: Studio Identity & Active Engagements Directory Toggle */}
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-[10px] bg-[#111827] text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]">
              <Rocket className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-tight text-[#111827]">
                  Launch Program Studio
                </span>
                <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#2563EB]">
                  Step {currentStepMeta.index} of {STUDIO_STEPS.length}
                </span>
              </div>
              <p className="text-[12px] text-[#667085]">
                {organizationName} · <span className="font-mono text-[11px] text-[#12B76A]">{lastSavedLabel}</span>
              </p>
            </div>
          </div>

          {/* Right: Mode Switcher + Save Draft + Exit */}
          <div className="flex flex-wrap items-center gap-2">
            {existingPrograms.length > 0 && (
              <button
                type="button"
                onClick={() => setViewMode((v) => (v === "studio" ? "directory" : "studio"))}
                className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors ${
                  viewMode === "directory"
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                    : "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467] hover:border-[#D0D5DD] hover:bg-white hover:text-[#111827]"
                }`}
              >
                <Briefcase className="size-3.5" />
                <span>
                  {viewMode === "directory"
                    ? "Back to Launch Studio"
                    : `Existing Engagements (${existingPrograms.length})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleStartOver}
              onBlur={() => setConfirmReset(false)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors ${confirmReset ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" : "border-[#E7EAF0] bg-white text-[#475467] hover:bg-[#F8FAFC]"}`}
            >
              {confirmReset ? "Click again to clear the draft" : "Start over"}
            </button>

            <button
              type="button"
              onClick={handleSaveDraftSnapshot}
              disabled={isSavingDraft}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-3 text-[12px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:bg-[#F8FAFC]"
            >
              <Save className="size-3.5 text-[#475467]" />
              <span>{isSavingDraft ? "Saving..." : "Save Draft"}</span>
            </button>

            {onCloseModal ? (
              <button
                type="button"
                onClick={onCloseModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-3 text-[12px] font-semibold text-[#475467] transition-colors hover:bg-[#F8FAFC] hover:text-[#111827]"
              >
                <X className="size-3.5" />
                <span>Exit</span>
              </button>
            ) : (
              <Link
                prefetch={false}
                href={`/organizations/${organizationId}` as Route}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-3 text-[12px] font-semibold text-[#475467] transition-colors hover:bg-[#F8FAFC] hover:text-[#111827]"
              >
                <X className="size-3.5" />
                <span>Exit</span>
              </Link>
            )}
          </div>
        </div>

        {/* Sticky 9-Step Progress Stepper */}
        {viewMode === "studio" && (
          <div className="border-t border-[#E7EAF0] bg-[#F8FAFC]/90">
            <div className="mx-auto max-w-[1440px] px-4 py-2 sm:px-6">
              <nav aria-label="Launch Program Studio Steps" className="grid grid-cols-3 gap-1.5 sm:grid-cols-9">
                {STUDIO_STEPS.map((step) => {
                  const isCurrent = step.id === state.currentStep;
                  const isCompleted = step.index < currentStepMeta.index;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => goToStep(step.id)}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`group flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-all ${
                        isCurrent
                          ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E40AF] shadow-[0_1px_2px_rgba(37,99,235,0.10)]"
                          : isCompleted
                            ? "border-[#A6F4C5] bg-[#ECFDF3]/70 text-[#027A48] hover:bg-[#ECFDF3]"
                            : "border-transparent bg-white/70 text-[#667085] hover:border-[#E7EAF0] hover:bg-white hover:text-[#111827]"
                      }`}
                    >
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                          isCurrent
                            ? "bg-[#2563EB] text-white"
                            : isCompleted
                              ? "bg-[#12B76A] text-white"
                              : "bg-[#E7EAF0] text-[#475467]"
                        }`}
                      >
                        {isCompleted ? <Check className="size-3" /> : step.index}
                      </span>
                      <span className="truncate text-[12px] font-semibold">{step.shortLabel}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}
      </header>

      {/* Optional Toast Banner */}
      {toastMessage && (
        <div className="mx-auto max-w-[1440px] px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-[13px] font-medium text-[#1E40AF]">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#2563EB]" />
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-[#1E40AF] hover:opacity-75"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Optional Inline Validation Alert */}
      {inlineError && (
        <div className="mx-auto max-w-[1440px] px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-[13px] font-medium text-[#B42318]">
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-[#EF4444]" />
              {inlineError}
            </span>
            <button
              type="button"
              onClick={() => setInlineError(null)}
              className="text-[#B42318] hover:opacity-75"
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* DIRECTORY VIEW (if toggled to inspect existing programs) */}
      {viewMode === "directory" ? (
        <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
            <div>
              <h1 className="text-[22px] font-bold text-[#111827]">
                Active Organization Engagements ({existingPrograms.length})
              </h1>
              <p className="mt-1 text-[13px] text-[#475467]">
                Select an existing engagement below to open its Program Operations Center, or return to the Launch
                Program Studio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode("studio")}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#111827] px-4 text-[13px] font-semibold text-white hover:bg-[#1F2937]"
            >
              <Plus className="size-4" />
              <span>Launch New Program in Studio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {existingPrograms.map((program) => (
              <div
                key={program.id}
                className="flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      prefetch={false}
                      href={`/organizations/${organizationId}/programs/${program.id}` as Route}
                      className="text-[16px] font-bold text-[#111827] hover:text-[#2563EB]"
                    >
                      {program.name}
                    </Link>
                    <ProgramStatusBadge status={program.status} />
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-[#667085]">
                    {engagementTypeLabel(program.engagementType)} · Type: {program.programType.toUpperCase()}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#E7EAF0] pt-3">
                  <Link
                    prefetch={false}
                    href={`/organizations/${organizationId}/programs/${program.id}` as Route}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2563EB] hover:underline"
                  >
                    <span>Open Operations Center</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                  {canCreate && program.status === "draft" && (
                    <DeleteDraftProgramDialog
                      organizationId={organizationId}
                      programId={program.id}
                      programName={program.name}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      ) : (
        /* STUDIO STEP CONTENT */
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
          <AnimatePresence initial={false}>
            <motion.div
              key={state.currentStep}
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="space-y-6"
            >
              {/* ===============================================================
                  STEP 1 — WELCOME SCREEN
                  =============================================================== */}
              {state.currentStep === "welcome" && (
                <div className="space-y-6">
                  <div className="rounded-[20px] border border-[#E7EAF0] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-6 shadow-[0_2px_8px_rgba(16,24,40,0.04)] sm:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          <Sparkles className="size-3.5" /> Guided Security Program Deployment
                        </span>
                        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[#111827] sm:text-[34px]">
                          Launch a New Security Program
                        </h1>
                        <p className="mt-1.5 max-w-2xl text-[15px] text-[#475467]">
                          Create a professional security program in minutes using guided best practices.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextStep}
                        className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#111827] px-5 text-[14px] font-semibold text-white shadow-[0_2px_6px_rgba(16,24,40,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#1F2937]"
                      >
                        <span>Continue</span>
                        <ArrowRight className="size-4" />
                      </button>
                    </div>

                    {/* 4 Engagement Architecture Cards */}
                    <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {WELCOME_ENGAGEMENT_OPTIONS.map((option) => {
                        const selected = state.welcomeChoice === option.id;
                        return (
                          <motion.button
                            key={option.id}
                            type="button"
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.995 }}
                            onClick={() => handleSelectWelcomeOption(option.id)}
                            className={`group relative flex flex-col justify-between rounded-[18px] border p-5 text-left transition-all sm:p-6 ${
                              selected
                                ? "border-[#2563EB] bg-[#EFF6FF]/40 shadow-[0_12px_28px_rgba(37,99,235,0.10)] ring-2 ring-[#2563EB]/20"
                                : "border-[#E7EAF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] hover:border-[#D0D5DD]"
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`inline-flex size-11 items-center justify-center rounded-[12px] border transition-colors ${
                                      selected
                                        ? "border-[#2563EB] bg-[#2563EB] text-white"
                                        : "border-[#E7EAF0] bg-[#F8FAFC] text-[#111827] group-hover:border-[#BFDBFE]"
                                    }`}
                                  >
                                    {option.id === "continuous_bug_bounty" && <ShieldCheck className="size-5" />}
                                    {option.id === "vdp" && <FileCheck2 className="size-5" />}
                                    {option.id === "private_engagement" && <Lock className="size-5" />}
                                    {option.id === "pentest_campaign" && <Target className="size-5" />}
                                  </span>
                                  <div>
                                    <span className="inline-block rounded-full border border-[#E7EAF0] bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#475467]">
                                      {option.badge}
                                    </span>
                                    <h2 className="mt-1 text-[18px] font-bold text-[#111827]">{option.title}</h2>
                                  </div>
                                </div>
                                <span
                                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
                                    selected
                                      ? "border-[#2563EB] bg-[#2563EB] text-white"
                                      : "border-[#D0D5DD] bg-white text-transparent"
                                  }`}
                                >
                                  <Check className="size-3.5" />
                                </span>
                              </div>

                              <p className="mt-3 text-[13px] leading-relaxed text-[#475467]">{option.description}</p>
                            </div>

                            <div className="mt-5 space-y-2.5 border-t border-[#E7EAF0] pt-4">
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-[10px] bg-[#F8FAFC] px-3 py-2">
                                  <p className="text-[11px] font-semibold text-[#667085] uppercase">Typical Duration</p>
                                  <p className="mt-0.5 font-mono text-[12px] font-semibold text-[#111827]">
                                    {option.typicalDuration}
                                  </p>
                                </div>
                                <div className="rounded-[10px] bg-[#F8FAFC] px-3 py-2">
                                  <p className="text-[11px] font-semibold text-[#667085] uppercase">Default Posture</p>
                                  <p className="mt-0.5 font-mono text-[12px] font-semibold text-[#111827]">
                                    {option.defaultVisibility}
                                  </p>
                                </div>
                              </div>
                              <div className="rounded-[10px] bg-[#F8FAFC] px-3 py-2">
                                <p className="text-[11px] font-semibold text-[#667085] uppercase">
                                  Recommended Use Case
                                </p>
                                <p className="mt-0.5 text-[12px] font-medium text-[#111827]">
                                  {option.recommendedUseCase}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {option.highlights.map((h) => (
                                  <span
                                    key={h}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#E7EAF0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#475467]"
                                  >
                                    <Check className="size-3 text-[#12B76A]" /> {h}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 2 — BLUEPRINT LIBRARY
                  =============================================================== */}
              {state.currentStep === "blueprint" && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                    <div>
                      <span className="font-mono text-[11px] font-semibold tracking-wider text-[#2563EB] uppercase">
                        Step 2 · Blueprint Library
                      </span>
                      <h1 className="mt-1 text-[24px] font-bold text-[#111827]">{currentStepMeta.title}</h1>
                      <p className="mt-1 text-[14px] text-[#475467]">{currentStepMeta.subtitle}</p>
                    </div>
                    <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-right">
                      <p className="text-[11px] font-semibold text-[#1E40AF] uppercase">Active Blueprint</p>
                      <p className="font-mono text-[14px] font-bold text-[#111827]">
                        {selectedBlueprint.name} (~{selectedBlueprint.estimatedSetupMinutes} min setup)
                      </p>
                    </div>
                  </div>

                  {/* Grid of 10 Industry Blueprints + Start Blank */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {PROGRAM_BLUEPRINTS.map((bp) => {
                      const isSelected = state.blueprintId === bp.id;
                      const isBlank = bp.id === "blank";
                      return (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => handleApplyBlueprint(bp)}
                          className={`flex flex-col justify-between rounded-[16px] border p-5 text-left transition-all ${
                            isSelected
                              ? "border-[#2563EB] bg-[#EFF6FF]/40 shadow-[0_10px_24px_rgba(37,99,235,0.10)] ring-2 ring-[#2563EB]/20"
                              : isBlank
                                ? "border-dashed border-[#D0D5DD] bg-white/80 hover:border-[#111827] hover:bg-white"
                                : "border-[#E7EAF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#D0D5DD]"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-mono text-[11px] font-semibold text-[#667085] uppercase">
                                  {bp.category}
                                </span>
                                <h2 className="mt-0.5 text-[16px] font-bold text-[#111827]">{bp.name}</h2>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                                  isSelected
                                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                                    : "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]"
                                }`}
                              >
                                <Clock className="size-3" /> {bp.estimatedSetupMinutes} min
                              </span>
                            </div>

                            <p className="mt-2.5 text-[13px] leading-relaxed text-[#475467]">{bp.summary}</p>
                          </div>

                          <div className="mt-4 space-y-2.5 border-t border-[#E7EAF0] pt-3.5 text-[12px]">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-[8px] bg-[#F8FAFC] px-2.5 py-1.5">
                                <span className="block text-[10px] font-semibold text-[#667085] uppercase">
                                  Critical Cap
                                </span>
                                <span className="font-mono font-bold text-[#111827]">
                                  ${bp.rewardMatrix.critical.max.toLocaleString("en-US")}
                                </span>
                              </div>
                              <div className="rounded-[8px] bg-[#F8FAFC] px-2.5 py-1.5">
                                <span className="block text-[10px] font-semibold text-[#667085] uppercase">
                                  Response SLA
                                </span>
                                <span className="font-mono font-bold text-[#111827]">
                                  {bp.policy.responseSlaHours}h / {bp.severityScoring}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-[8px] bg-[#F8FAFC] px-2.5 py-1.5">
                              <span className="block text-[10px] font-semibold text-[#667085] uppercase">
                                Preconfigured Workflow
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-[11px] text-[#475467]">
                                {bp.defaultWorkflowSummary}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
                              <div className="flex flex-wrap gap-1">
                                {bp.complianceTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded border border-[#E7EAF0] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475467]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
                                {isSelected ? "Selected ✓" : "Apply →"}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 3 — PROGRAM DETAILS
                  =============================================================== */}
              {state.currentStep === "details" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left 8 Columns: Grouped Clean Sections */}
                  <div className="space-y-5 lg:col-span-8">
                    {/* Group 1: Program Information */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                      <div className="border-b border-[#E7EAF0] pb-4">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          Section 1 of 4
                        </span>
                        <h2 className="mt-0.5 text-[18px] font-bold text-[#111827]">Program Information</h2>
                        <p className="text-[13px] text-[#667085]">
                          Core identity, executive sponsorship, and triage routing contacts.
                        </p>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[13px] font-semibold text-[#111827]">
                            Program Name <span className="text-[#EF4444]">*</span>
                          </label>
                          <input
                            type="text"
                            value={state.programName}
                            onChange={(e) => {
                              setInlineError(null);
                              setState((prev) => ({ ...prev, programName: e.target.value }));
                            }}
                            placeholder="e.g. Cloud Platform Bug Bounty"
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-[13px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[13px] font-semibold text-[#111827]">Short Description</label>
                          <input
                            type="text"
                            value={state.shortDescription}
                            onChange={(e) => setState((prev) => ({ ...prev, shortDescription: e.target.value }))}
                            placeholder="One line on what researchers will test"
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-[13px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                          />
                          <p className="mt-1 text-[12px] text-[#667085]">{state.shortDescription && state.shortDescription === selectedBlueprint?.recommendedDescription ? "Filled in from the template you picked. Change it to describe your own program." : "Shown on the program card and at the top of the program page."}</p>
                        </div>

                        <div>
                          <label htmlFor="studio-business-unit" className="block text-[13px] font-semibold text-[#111827]">Business Unit</label>
                          <select
                            id="studio-business-unit"
                            value={state.businessUnit}
                            onChange={(e) => setState((prev) => ({ ...prev, businessUnit: e.target.value }))}
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-[13px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                          >
                            <option value="">Choose a category</option>
                            {BUSINESS_UNITS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                          </select>
                          <p className="mt-1 text-[12px] text-[#667085]">The part of your company that owns what is being tested. Used to group findings.</p>
                        </div>

                        <div>
                          <label htmlFor="studio-product-owner" className="block text-[13px] font-semibold text-[#111827]">Product Owner</label>
                          <select
                            id="studio-product-owner"
                            value={state.productOwner}
                            onChange={(e) => setState((prev) => ({ ...prev, productOwner: e.target.value }))}
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-[13px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                          >
                            <option value="">No owner yet</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          <p className="mt-1 text-[12px] text-[#667085]">The member responsible for fixing what researchers find.</p>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="studio-security-contact" className="block text-[13px] font-semibold text-[#111827]">Security Contact</label>
                          <input
                            id="studio-security-contact"
                            type="email"
                            placeholder="security@yourcompany.com"
                            value={state.securityContact}
                            onChange={(e) => setState((prev) => ({ ...prev, securityContact: e.target.value }))}
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 font-mono text-[13px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                          />
                          <p className="mt-1 text-[12px] text-[#667085]">Where Unpatched sends urgent security notices about this program.</p>
                        </div>
                      </div>
                    </section>

                    {/* Group 2: Program Type & Visibility */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                      <div className="border-b border-[#E7EAF0] pb-4">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          Section 2 of 4
                        </span>
                        <h2 className="mt-0.5 text-[18px] font-bold text-[#111827]">Program Type</h2>
                        <p className="text-[13px] text-[#667085]">
                          Control how researchers discover, join, and receive recognition for this program.
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                        {(["Public", "Private", "Invite Only", "VDP"] as const).map((mode) => {
                          const active = state.visibility === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setState((prev) => ({ ...prev, visibility: mode }))}
                              className={`rounded-[12px] border p-3.5 text-left transition-all ${
                                active
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E40AF] ring-2 ring-[#2563EB]/15"
                                  : "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467] hover:bg-white hover:text-[#111827]"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[14px] font-bold">{mode}</span>
                                {active && <CheckCircle2 className="size-4 text-[#2563EB]" />}
                              </div>
                              <p className="mt-1 text-[11px] text-[#667085]">
                                {mode === "Public" && "Discoverable in directory with cash bounties"}
                                {mode === "Private" && "Hidden from public directory; vetted access"}
                                {mode === "Invite Only" && "Strict named-researcher invitations only"}
                                {mode === "VDP" && "Compliance intake with Safe Harbor (no bounty)"}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Group 3 & 4: Lifecycle & Scheduling */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                      <div className="border-b border-[#E7EAF0] pb-4">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          Sections 3 &amp; 4 of 4
                        </span>
                        <h2 className="mt-0.5 text-[18px] font-bold text-[#111827]">Lifecycle &amp; Scheduling</h2>
                        <p className="text-[13px] text-[#667085]">
                          Choose initial operational state and configure launch / optional sunset dates.
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(["Draft", "Scheduled", "Active"] as const).map((lc: StudioLifecycleMode) => {
                          const active = state.lifecycle === lc;
                          return (
                            <button
                              key={lc}
                              type="button"
                              onClick={() => setState((prev) => ({ ...prev, lifecycle: lc }))}
                              className={`rounded-[12px] border p-3.5 text-left transition-all ${
                                active
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E40AF]"
                                  : "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467] hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[14px] font-bold">{lc}</span>
                                {active && <CheckCircle2 className="size-4 text-[#2563EB]" />}
                              </div>
                              <p className="mt-1 text-[11px] text-[#667085]">
                                {lc === "Draft" && "Internal sandbox review before researcher access"}
                                {lc === "Scheduled" && "Automatically activates on Launch Date"}
                                {lc === "Active" && "Immediate intake upon studio completion"}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-[13px] font-semibold text-[#111827]">Launch Date</label>
                          <input
                            type="date"
                            value={state.launchDate}
                            onChange={(e) => setState((prev) => ({ ...prev, launchDate: e.target.value }))}
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 font-mono text-[13px] text-[#111827] outline-none focus:border-[#2563EB]"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] font-semibold text-[#111827]">
                            End Date <span className="font-normal text-[#667085]">(Optional — for timeboxed campaigns)</span>
                          </label>
                          <input
                            type="date"
                            value={state.endDate}
                            onChange={(e) => setState((prev) => ({ ...prev, endDate: e.target.value }))}
                            className="mt-1.5 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 font-mono text-[13px] text-[#111827] outline-none focus:border-[#2563EB]"
                          />
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Right 4 Columns: Sticky Live Summary Card */}
                  <aside className="lg:col-span-4">
                    <div className="sticky top-28 rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
                      <div className="flex items-center justify-between border-b border-[#E7EAF0] pb-4">
                        <span className="font-mono text-[11px] font-semibold tracking-wider text-[#2563EB] uppercase">
                          Live Program Summary
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#027A48]">
                          {state.lifecycle}
                        </span>
                      </div>

                      <h3 className="mt-4 text-[18px] font-bold text-[#111827]">
                        {state.programName || "Untitled Security Program"}
                      </h3>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
                        {state.shortDescription || "No description provided yet."}
                      </p>

                      <dl className="mt-5 space-y-3 border-t border-[#E7EAF0] pt-4 text-[13px]">
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Blueprint</dt>
                          <dd className="font-semibold text-[#111827]">{selectedBlueprint.name}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Business Unit</dt>
                          <dd className="font-semibold text-[#111827]">{businessUnitLabel || "Not set"}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Product Owner</dt>
                          <dd className="max-w-[180px] truncate font-medium text-[#111827]">{productOwnerName || "Not set"}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Security Contact</dt>
                          <dd className="font-mono text-[12px] text-[#111827]">{state.securityContact || "Not set"}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Program Type</dt>
                          <dd className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 font-mono text-[12px] font-semibold text-[#2563EB]">
                            {state.visibility}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-[#667085]">Launch Window</dt>
                          <dd className="font-mono text-[12px] font-semibold text-[#111827]">
                            {state.launchDate} {state.endDate ? `→ ${state.endDate}` : "→ Continuous"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </aside>
                </div>
              )}

              {/* ===============================================================
                  STEP 4 — SCOPE STUDIO (3-PANEL INTERACTIVE BUILDER, NO TEXTAREAS)
                  =============================================================== */}
              {state.currentStep === "scope" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#E7EAF0] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div>
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                        Step 4 · Interactive Scope Studio
                      </span>
                      <h1 className="text-[20px] font-bold text-[#111827]">
                        Assemble Verified Attack Surface Assets
                      </h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 font-mono">
                        Catalog: <strong>{assets.length}</strong> assets
                      </span>
                      <span className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 font-mono text-[#1E40AF]">
                        In Scope: <strong>{state.selectedAssetIds.length}</strong> assets
                      </span>
                    </div>
                  </div>

                  {/* Add a target that isn't in the inventory yet; the scope rules check it at creation. */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const identifier = newTarget.trim();
                      if (!identifier) return;
                      const asset = makeStudioAsset(`new:${newTargetType}:${identifier}`, newTargetType, identifier, false);
                      setCustomAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]));
                      setState((prev) => ({ ...prev, selectedAssetIds: prev.selectedAssetIds.includes(asset.id) ? prev.selectedAssetIds : [...prev.selectedAssetIds, asset.id] }));
                      setNewTarget("");
                    }}
                    className="flex flex-col gap-2 rounded-[16px] border border-[#E7EAF0] bg-white p-4 sm:flex-row sm:items-center"
                  >
                    <select aria-label="Target type" value={newTargetType} onChange={(e) => setNewTargetType(e.target.value as StudioTargetType)} className="h-10 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px]">
                      {STUDIO_TARGET_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <input aria-label="Target" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="app.example.com" className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#E7EAF0] px-3 font-mono text-[13px]" />
                    <button type="submit" className="h-10 rounded-[10px] bg-[#111827] px-4 text-[13px] font-semibold text-white">Add to scope</button>
                    <span className="text-[12px] text-[#667085] sm:max-w-[16rem]">To import a HackerOne scope CSV, use the program&apos;s Scope tab after it is created.</span>
                  </form>

                  {/* 3-PANEL SCOPE BUILDER */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* LEFT PANEL (3 cols): Available Verified Asset Categories */}
                    <div className="rounded-[18px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.04)] lg:col-span-3">
                      <div className="flex items-center justify-between border-b border-[#E7EAF0] pb-3">
                        <h2 className="text-[13px] font-bold tracking-wider text-[#111827] uppercase">
                          Asset Categories
                        </h2>
                        <span className="font-mono text-[11px] text-[#667085]">10 Classes</span>
                      </div>

                      <div className="mt-3 space-y-1">
                        <button
                          type="button"
                          onClick={() => setActiveAssetCategory("All")}
                          className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors ${
                            activeAssetCategory === "All"
                              ? "bg-[#111827] text-white"
                              : "text-[#475467] hover:bg-[#F8FAFC] hover:text-[#111827]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Layers className="size-4" />
                            All Verified Assets
                          </span>
                          <span className="font-mono text-[11px]">{assets.length}</span>
                        </button>

                        {ASSET_CATEGORIES.map((category) => {
                          const totalInCat = assets.filter((a) => a.category === category).length;
                          const selectedInCat = selectedAssetsList.filter((a) => a.category === category).length;
                          const active = activeAssetCategory === category;
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setActiveAssetCategory(category)}
                              className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors ${
                                active
                                  ? "bg-[#EFF6FF] font-semibold text-[#2563EB]"
                                  : "text-[#475467] hover:bg-[#F8FAFC] hover:text-[#111827]"
                              }`}
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <CategoryIcon category={category} className="size-4 shrink-0" />
                                <span className="truncate">{category}</span>
                              </span>
                              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                                {selectedInCat > 0 && (
                                  <span className="rounded bg-[#ECFDF3] px-1.5 py-0.5 font-bold text-[#027A48]">
                                    {selectedInCat} in
                                  </span>
                                )}
                                <span className="text-[#98A2B3]">{totalInCat}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* MIDDLE PANEL (5 cols): Search, 5 Filters & Draggable/Clickable Asset Cards */}
                    <div className="flex flex-col rounded-[18px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.04)] lg:col-span-5">
                      {/* Search & Multi-Faceted Filter Bar */}
                      <div className="space-y-2.5 border-b border-[#E7EAF0] pb-3.5">
                        <div className="flex items-center gap-2 rounded-[10px] border border-[#D0D5DD] bg-[#F8FAFC] px-3 py-2 focus-within:border-[#2563EB] focus-within:bg-white">
                          <Search className="size-4 text-[#667085]" />
                          <input
                            type="search"
                            value={assetSearch}
                            onChange={(e) => setAssetSearch(e.target.value)}
                            placeholder="Search your assets..."
                            className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#98A2B3]"
                          />
                        </div>

                        {/* 5 Required Filter Controls: Tags, Environment, Verification, Risk, Ownership */}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <select
                            aria-label="Filter by Environment"
                            value={envFilter}
                            onChange={(e) => setEnvFilter(e.target.value)}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px] font-medium text-[#475467]"
                          >
                            <option value="All">Env: All</option>
                            <option value="Production">Production</option>
                            <option value="Staging">Staging</option>
                            <option value="Sandbox">Sandbox</option>
                            <option value="Disaster Recovery">Disaster Recovery</option>
                          </select>

                          <select
                            aria-label="Filter by Verification"
                            value={verificationFilter}
                            onChange={(e) => setVerificationFilter(e.target.value as "All" | "Verified" | "Pending")}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px] font-medium text-[#475467]"
                          >
                            <option value="All">Verification: All</option>
                            <option value="Verified">Verified Only</option>
                            <option value="Pending">Unverified / Pending</option>
                          </select>

                          <select
                            aria-label="Filter by Risk"
                            value={riskFilter}
                            onChange={(e) => setRiskFilter(e.target.value)}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px] font-medium text-[#475467]"
                          >
                            <option value="All">Risk: All Tiers</option>
                            <option value="Critical">Critical Risk</option>
                            <option value="High">High Risk</option>
                            <option value="Medium">Medium Risk</option>
                          </select>

                          <select
                            aria-label="Filter by Ownership"
                            value={ownerFilter}
                            onChange={(e) => setOwnerFilter(e.target.value)}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px] font-medium text-[#475467]"
                          >
                            <option value="All">Owner: All Teams</option>
                            {allOwnerTeams.map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                          </select>

                          <select
                            aria-label="Filter by Tag"
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px] font-medium text-[#475467] sm:col-span-2"
                          >
                            <option value="All">Tag: All Tags</option>
                            {allAssetTags.map((tag) => (
                              <option key={tag} value={tag}>
                                #{tag}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Asset Cards List (Click or Drag into Scope) */}
                      <div className="mt-3 space-y-2.5">
                        {filteredAssets.map((asset) => {
                          const isSelected = state.selectedAssetIds.includes(asset.id);
                          return (
                            <div
                              key={asset.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggedAssetId(asset.id);
                                e.dataTransfer.setData("text/plain", asset.id);
                              }}
                              onDragEnd={() => setDraggedAssetId(null)}
                              onClick={() => toggleAssetInScope(asset.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleAssetInScope(asset.id);
                                }
                              }}
                              className={`group flex cursor-pointer items-start justify-between gap-3 rounded-[14px] border p-3.5 transition-all ${
                                isSelected
                                  ? "border-[#2563EB] bg-[#EFF6FF]/45 shadow-[0_2px_8px_rgba(37,99,235,0.08)]"
                                  : "border-[#E7EAF0] bg-white hover:border-[#D0D5DD] hover:bg-[#F8FAFC]"
                              }`}
                            >
                              <div className="flex min-w-0 items-start gap-2.5">
                                <GripVertical className="mt-1 size-4 shrink-0 text-[#98A2B3] group-hover:text-[#475467]" />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate font-mono text-[13px] font-bold text-[#111827]">
                                      {asset.identifier}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                        asset.verified
                                          ? "bg-[#ECFDF3] text-[#027A48]"
                                          : "bg-[#FFFAEB] text-[#B54708]"
                                      }`}
                                    >
                                      {asset.verified ? "Verified" : "Unverified"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                        asset.riskTier === "Critical"
                                          ? "bg-[#FEF3F2] text-[#B42318]"
                                          : "bg-[#F8FAFC] text-[#475467]"
                                      }`}
                                    >
                                      {asset.riskTier}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-[12px] text-[#475467]">{asset.title}</p>
                                </div>
                              </div>

                              <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2.5 py-1 font-mono text-[11px] font-semibold ${
                                  isSelected
                                    ? "bg-[#2563EB] text-white"
                                    : "border border-[#E7EAF0] bg-[#F8FAFC] text-[#111827] group-hover:border-[#2563EB] group-hover:text-[#2563EB]"
                                }`}
                              >
                                {isSelected ? (
                                  <>
                                    <Check className="size-3" /> In Scope
                                  </>
                                ) : (
                                  <>
                                    <Plus className="size-3" /> Add
                                  </>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT PANEL (4 cols): Program Scope Telemetry & Intelligent Warnings */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDropZoneActive(true);
                      }}
                      onDragLeave={() => setIsDropZoneActive(false)}
                      onDrop={handleDropAssetIntoScope}
                      className={`rounded-[18px] border p-5 transition-all lg:col-span-4 ${
                        isDropZoneActive
                          ? "border-2 border-dashed border-[#2563EB] bg-[#EFF6FF]/60"
                          : "border-[#E7EAF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-[#E7EAF0] pb-3">
                        <div>
                          <h2 className="text-[15px] font-bold text-[#111827]">Program Scope</h2>
                          <p className="text-[11px] text-[#667085]">
                            Drag assets here or click to toggle inclusion
                          </p>
                        </div>
                        <span className="rounded-full bg-[#111827] px-2.5 py-1 font-mono text-[11px] font-bold text-white">
                          {scopeTelemetry.totalSelected} Assets
                        </span>
                      </div>

                      {/* 5 Required Telemetry Metrics */}
                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                          <span className="text-[11px] font-semibold text-[#667085] uppercase">Coverage</span>
                          <p className="mt-1 font-mono text-[20px] font-bold text-[#111827]">
                            {scopeTelemetry.coveragePercent}%
                          </p>
                          <span className="text-[11px] text-[#475467]">
                            {scopeTelemetry.categoriesCovered} of 10 classes
                          </span>
                        </div>

                        <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                          <span className="text-[11px] font-semibold text-[#667085] uppercase">Verification %</span>
                          <p
                            className={`mt-1 font-mono text-[20px] font-bold ${
                              scopeTelemetry.verificationPercent === 100 ? "text-[#12B76A]" : "text-[#F59E0B]"
                            }`}
                          >
                            {scopeTelemetry.verificationPercent}%
                          </p>
                          <span className="text-[11px] text-[#475467]">DNS / Attestation</span>
                        </div>

                        <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                          <span className="text-[11px] font-semibold text-[#667085] uppercase">
                            Est. Attack Surface
                          </span>
                          <p className="mt-1 font-mono text-[16px] font-bold text-[#111827]">
                            {scopeTelemetry.estimatedAttackSurfaceEndpoints} endpoints
                          </p>
                          <span className="text-[11px] text-[#2563EB] font-medium">
                            {scopeTelemetry.attackSurfaceRating}
                          </span>
                        </div>

                        <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                          <span className="text-[11px] font-semibold text-[#667085] uppercase">Critical Assets</span>
                          <p className="mt-1 font-mono text-[16px] font-bold text-[#EF4444]">
                            {scopeTelemetry.criticalAssetsCount} Tier-0
                          </p>
                          <span className="text-[11px] text-[#475467]">High-priority targets</span>
                        </div>

                        <div className="col-span-2 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3.5 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#667085] uppercase">Business Impact</span>
                            <span className="font-mono text-[12px] font-bold text-[#111827]">
                              {scopeTelemetry.businessImpactLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Scope Guardrails & Warnings (Unverified, Duplicate, Conflicting, Missing Prod) */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold tracking-wider text-[#475467] uppercase">
                            Scope Advisories &amp; Guardrails
                          </span>
                          {scopeTelemetry.warnings.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                // Auto-resolve warnings by keeping verified non-duplicate production assets
                                setState((prev) => ({
                                  ...prev,
                                  selectedAssetIds: ["asset-dom-1", "asset-dom-2", "asset-api-1", "asset-web-1", "asset-repo-1"],
                                }));
                                showToast("Resolved scope advisories: removed unverified/overlapping targets.");
                              }}
                              className="font-mono text-[11px] font-semibold text-[#2563EB] hover:underline"
                            >
                              Auto-Fix Advisories
                            </button>
                          )}
                        </div>

                        {scopeTelemetry.warnings.length === 0 ? (
                          <div className="flex items-center gap-2 rounded-[12px] border border-[#A6F4C5] bg-[#ECFDF3] p-3 text-[12px] font-medium text-[#027A48]">
                            <CheckCircle2 className="size-4 shrink-0 text-[#12B76A]" />
                            <span>
                              All {scopeTelemetry.totalSelected} in-scope assets are verified Production targets with
                              zero conflicts.
                            </span>
                          </div>
                        ) : (
                          scopeTelemetry.warnings.map((warn) => (
                            <div
                              key={warn.id}
                              className={`rounded-[12px] border p-3 text-[12px] ${
                                warn.severity === "critical"
                                  ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
                                  : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 font-semibold">
                                <span className="flex items-center gap-1.5">
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                  {warn.title}
                                </span>
                                {warn.affectedAssetIds.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setState((prev) => ({
                                        ...prev,
                                        selectedAssetIds: prev.selectedAssetIds.filter(
                                          (id) => !warn.affectedAssetIds.includes(id),
                                        ),
                                      }))
                                    }
                                    className="underline hover:opacity-80"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-[11px] opacity-90">{warn.detail}</p>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Active In-Scope Asset Pills */}
                      <div className="mt-4 border-t border-[#E7EAF0] pt-3">
                        <p className="text-[11px] font-semibold text-[#667085] uppercase">
                          Selected Scope Manifest ({selectedAssetsList.length})
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {selectedAssetsList.map((asset) => (
                            <div
                              key={asset.id}
                              className="flex items-center justify-between rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-[12px]"
                            >
                              <span className="truncate font-mono font-semibold text-[#111827]">
                                {asset.identifier}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleAssetInScope(asset.id)}
                                className="ml-2 text-[#667085] hover:text-[#EF4444]"
                                aria-label={`Remove ${asset.identifier}`}
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 5 — REWARDS & POLICIES
                  =============================================================== */}
              {state.currentStep === "rewards" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left 7 Columns: Visual Reward Builder + Policy Configuration */}
                  <div className="space-y-6 lg:col-span-7">
                    {/* Part A: Visual Reward Builder */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7EAF0] pb-4">
                        <div>
                          <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                            Part 1 · Visual Reward Builder
                          </span>
                          <h2 className="mt-0.5 text-[18px] font-bold text-[#111827]">
                            Interactive Severity Reward Matrix
                          </h2>
                        </div>
                        <span className="rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-3 py-1 font-mono text-[11px] font-semibold text-[#027A48]">
                          {rewardForecast.competitivenessTier}
                        </span>
                      </div>

                      <div className="mt-5 space-y-4">
                        {(
                          [
                            {
                              key: "critical",
                              label: "Critical (P1)",
                              badgeClass: "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]",
                              maxCeiling: 35000,
                              step: 500,
                            },
                            {
                              key: "high",
                              label: "High (P2)",
                              badgeClass: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
                              maxCeiling: 15000,
                              step: 250,
                            },
                            {
                              key: "medium",
                              label: "Medium (P3)",
                              badgeClass: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]",
                              maxCeiling: 5000,
                              step: 100,
                            },
                            {
                              key: "low",
                              label: "Low (P4)",
                              badgeClass: "bg-[#F8FAFC] text-[#475467] border-[#E7EAF0]",
                              maxCeiling: 1500,
                              step: 50,
                            },
                            {
                              key: "informational",
                              label: "Informational (P5)",
                              badgeClass: "bg-[#F8FAFC] text-[#667085] border-[#E7EAF0]",
                              maxCeiling: 500,
                              step: 25,
                            },
                          ] as const
                        ).map((tier) => {
                          const range = state.rewardMatrix[tier.key];
                          return (
                            <div
                              key={tier.key}
                              className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span
                                  className={`inline-flex items-center rounded-md border px-2.5 py-0.5 font-mono text-[12px] font-bold ${tier.badgeClass}`}
                                >
                                  {tier.label}
                                </span>
                                <span className="font-mono text-[15px] font-bold text-[#111827]">
                                  ${range.min.toLocaleString("en-US")} – ${range.max.toLocaleString("en-US")}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="flex justify-between text-[11px] font-medium text-[#667085]">
                                    <span>Minimum Bounty</span>
                                    <span className="font-mono text-[#111827]">
                                      ${range.min.toLocaleString("en-US")}
                                    </span>
                                  </label>
                                  <input
                                    type="range"
                                    min={0}
                                    max={tier.maxCeiling}
                                    step={tier.step}
                                    value={range.min}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setState((prev) => ({
                                        ...prev,
                                        rewardMatrix: {
                                          ...prev.rewardMatrix,
                                          [tier.key]: {
                                            min: val,
                                            max: Math.max(val, prev.rewardMatrix[tier.key].max),
                                          },
                                        },
                                      }));
                                    }}
                                    className="mt-1 w-full accent-[#2563EB]"
                                  />
                                </div>
                                <div>
                                  <label className="flex justify-between text-[11px] font-medium text-[#667085]">
                                    <span>Maximum Bounty</span>
                                    <span className="font-mono text-[#111827]">
                                      ${range.max.toLocaleString("en-US")}
                                    </span>
                                  </label>
                                  <input
                                    type="range"
                                    min={0}
                                    max={tier.maxCeiling}
                                    step={tier.step}
                                    value={range.max}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setState((prev) => ({
                                        ...prev,
                                        rewardMatrix: {
                                          ...prev.rewardMatrix,
                                          [tier.key]: {
                                            min: Math.min(val, prev.rewardMatrix[tier.key].min),
                                            max: val,
                                          },
                                        },
                                      }));
                                    }}
                                    className="mt-1 w-full accent-[#2563EB]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Part B: Policies Configuration */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                      <div className="border-b border-[#E7EAF0] pb-4">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          Part 2 · Governance &amp; Disclosure Policies
                        </span>
                        <h2 className="mt-0.5 text-[18px] font-bold text-[#111827]">
                          SLAs, Safe Harbor &amp; Rules of Engagement
                        </h2>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">
                            Disclosure Timeline (Days)
                          </label>
                          <select
                            value={state.policy.disclosureTimelineDays}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: { ...prev.policy, disclosureTimelineDays: Number(e.target.value) },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-[13px]"
                          >
                            <option value={30}>30 Days (Accelerated)</option>
                            <option value={60}>60 Days (Agile Standard)</option>
                            <option value={90}>90 Days (Industry Standard)</option>
                            <option value={120}>120 Days (Extended Enterprise)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">Safe Harbor Posture</label>
                          <select
                            value={state.policy.safeHarborType}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: {
                                  ...prev.policy,
                                  safeHarborType: e.target.value as LaunchStudioState["policy"]["safeHarborType"],
                                },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-[13px]"
                          >
                            <option value="Full Legal Safe Harbor">Full Legal Safe Harbor (Gold Standard)</option>
                            <option value="Conditional Safe Harbor">Conditional Safe Harbor</option>
                            <option value="Standard Authorization">Standard CFAA Authorization</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">
                            First Response SLA (Hours)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={168}
                            value={state.policy.responseSlaHours}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: { ...prev.policy, responseSlaHours: Number(e.target.value) },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 font-mono text-[13px]"
                          />
                        </div>

                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">
                            Resolution SLA (Days)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={180}
                            value={state.policy.resolutionSlaDays}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: { ...prev.policy, resolutionSlaDays: Number(e.target.value) },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 font-mono text-[13px]"
                          />
                        </div>

                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">Duplicate Handling</label>
                          <select
                            value={state.policy.duplicateHandling}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: {
                                  ...prev.policy,
                                  duplicateHandling: e.target.value as LaunchStudioState["policy"]["duplicateHandling"],
                                },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-[13px]"
                          >
                            <option value="First valid reporter receives 100% reward">
                              First valid reporter receives 100% reward
                            </option>
                            <option value="Split bounty within 24h window">Split bounty within 24h window</option>
                            <option value="Reputation credit for duplicates">Reputation credit for duplicates</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[12px] font-semibold text-[#111827]">
                            Auto-Close Policy (Stale Info Days)
                          </label>
                          <input
                            type="number"
                            min={7}
                            max={90}
                            value={state.policy.autoCloseDays}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                policy: { ...prev.policy, autoCloseDays: Number(e.target.value) },
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 font-mono text-[13px]"
                          />
                        </div>
                      </div>

                      {/* Out-of-scope rules pills */}
                      <div className="mt-5 border-t border-[#E7EAF0] pt-4">
                        <label className="block text-[12px] font-semibold text-[#111827]">
                          Out-of-Scope Exclusions
                        </label>
                        <div className="mt-2 space-y-1.5">
                          {state.policy.outOfScopeRules.map((rule, idx) => (
                            <div
                              key={rule}
                              className="flex items-center justify-between gap-2 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-2 text-[12px]"
                            >
                              <span>• {rule}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setState((prev) => ({
                                    ...prev,
                                    policy: {
                                      ...prev.policy,
                                      outOfScopeRules: prev.policy.outOfScopeRules.filter((_, i) => i !== idx),
                                    },
                                  }))
                                }
                                className="text-[#98A2B3] hover:text-[#EF4444]"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2.5 flex gap-2">
                          <input
                            type="text"
                            value={newOutOfScopeRule}
                            onChange={(e) => setNewOutOfScopeRule(e.target.value)}
                            placeholder="Add custom out-of-scope rule..."
                            className="h-9 flex-1 rounded-[10px] border border-[#D0D5DD] px-3 text-[12px]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newOutOfScopeRule.trim()) return;
                              setState((prev) => ({
                                ...prev,
                                policy: {
                                  ...prev.policy,
                                  outOfScopeRules: [...prev.policy.outOfScopeRules, newOutOfScopeRule.trim()],
                                },
                              }));
                              setNewOutOfScopeRule("");
                            }}
                            className="rounded-[10px] bg-[#111827] px-3.5 text-[12px] font-semibold text-white"
                          >
                            Add Rule
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Right 5 Columns: Budget Forecast + Live Researcher Policy Preview */}
                  <div className="space-y-6 lg:col-span-5">
                    {/* Budget Forecast Card */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_4px_16px_rgba(16,24,40,0.05)]">
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                        Financial Telemetry &amp; Forecast
                      </span>
                      <h3 className="mt-0.5 text-[18px] font-bold text-[#111827]">
                        Budget Forecast &amp; Peer Benchmark
                      </h3>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3.5">
                          <span className="text-[11px] font-semibold text-[#667085] uppercase">Average Payout</span>
                          <p className="mt-1 font-mono text-[22px] font-bold text-[#111827]">
                            ${rewardForecast.averagePayout.toLocaleString("en-US")}
                          </p>
                          <span className="text-[11px] text-[#475467]">Weighted by severity</span>
                        </div>

                        <div className="rounded-[12px] border border-[#A6F4C5] bg-[#ECFDF3]/60 p-3.5">
                          <span className="text-[11px] font-semibold text-[#027A48] uppercase">Monthly Estimate</span>
                          <p className="mt-1 font-mono text-[22px] font-bold text-[#027A48]">
                            ${rewardForecast.estimatedMonthlySpend.toLocaleString("en-US")}
                          </p>
                          <span className="text-[11px] text-[#027A48]">
                            ~{rewardForecast.expectedMonthlyValidReports} valid reports/mo
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3.5">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">
                          Historical Comparison
                        </span>
                        <p className="mt-1 text-[13px] font-semibold text-[#111827]">
                          {rewardForecast.historicalComparisonLabel}
                        </p>
                      </div>

                      <div className="mt-4 space-y-2">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">
                          Reward Recommendations
                        </span>
                        {rewardForecast.recommendations.map((rec) => (
                          <div
                            key={rec}
                            className="flex items-start gap-2 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF]/60 p-3 text-[12px] text-[#1E40AF]"
                          >
                            <Sparkles className="mt-0.5 size-4 shrink-0 text-[#2563EB]" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Live Preview of Policy Shown to Researchers */}
                    <section className="rounded-[18px] border border-[#E7EAF0] bg-white p-6 shadow-[0_4px_16px_rgba(16,24,40,0.05)]">
                      <div className="flex items-center justify-between border-b border-[#E7EAF0] pb-3">
                        <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                          <Eye className="size-3.5" /> Live Researcher Policy Preview
                        </span>
                        <span className="rounded bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px] text-[#475467]">
                          {state.policy.severityScoring}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3 rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4 text-[12px] leading-relaxed text-[#111827]">
                        <p className="font-bold text-[14px]">{state.programName}</p>
                        <p className="text-[#475467]">{state.shortDescription}</p>

                        <div className="rounded-[10px] border border-[#A6F4C5] bg-[#ECFDF3] p-2.5 text-[#027A48]">
                          <strong>{state.policy.safeHarborType}:</strong> Good-faith security research conducted within
                          this policy is authorized by {organizationName} and exempt from DMCA/CFAA claims.
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                          <div className="rounded bg-white p-2 border border-[#E7EAF0]">
                            <span className="block text-[#667085]">Ack SLA</span>
                            <strong>{state.policy.responseSlaHours} hours</strong>
                          </div>
                          <div className="rounded bg-white p-2 border border-[#E7EAF0]">
                            <span className="block text-[#667085]">Fix SLA</span>
                            <strong>{state.policy.resolutionSlaDays} days</strong>
                          </div>
                          <div className="rounded bg-white p-2 border border-[#E7EAF0]">
                            <span className="block text-[#667085]">Disclosure</span>
                            <strong>{state.policy.disclosureTimelineDays} days</strong>
                          </div>
                        </div>

                        <div className="pt-1">
                          <p className="font-semibold text-[#111827]">Duplicate &amp; Stale Rules:</p>
                          <p className="text-[#475467]">
                            {state.policy.duplicateHandling}. Reports awaiting reporter info auto-close after{" "}
                            {state.policy.autoCloseDays} days.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 6 — RESEARCHER ACCESS
                  =============================================================== */}
              {state.currentStep === "access" && (
                <div className="space-y-5">
                  {/* Top Header & Bulk Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                    <div>
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                        Step 6 · Researcher Access Workspace
                      </span>
                      <h1 className="mt-0.5 text-[22px] font-bold text-[#111827]">
                        Curate Your Security Researcher Cohort
                      </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 font-mono text-[12px] font-semibold text-[#1E40AF]">
                        Invited: {state.invitedResearcherIds.length} Researchers + {state.invitedEmails.length} Email(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const visibleIds = filteredResearchers.map((r) => r.id);
                          setBulkSelectedResearcherIds(visibleIds);
                        }}
                        className="rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-white"
                      >
                        Select Visible ({filteredResearchers.length})
                      </button>
                      {bulkSelectedResearcherIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setState((prev) => ({
                              ...prev,
                              invitedResearcherIds: Array.from(
                                new Set([...prev.invitedResearcherIds, ...bulkSelectedResearcherIds]),
                              ),
                            }));
                            showToast(`Added ${bulkSelectedResearcherIds.length} researchers to the invite list. Invitations go out when you launch.`);
                            setBulkSelectedResearcherIds([]);
                          }}
                          className="rounded-[10px] bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white"
                        >
                          Invite Selected ({bulkSelectedResearcherIds.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 6 Required Section Tabs */}
                  <div className="flex flex-wrap gap-1.5 rounded-[14px] border border-[#E7EAF0] bg-white p-1.5">
                    {(
                      [
                        "Recommended Researchers",
                        "Past Participants",
                        "Top Performers",
                        "Invite by Email",
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveCohortTab(tab)}
                        className={`rounded-[10px] px-3.5 py-2 text-[12px] font-semibold transition-all ${
                          activeCohortTab === tab
                            ? "bg-[#111827] text-white"
                            : "text-[#475467] hover:bg-[#F8FAFC] hover:text-[#111827]"
                        }`}
                      >
                        {tab === "Invite by Email" ? "Invite by @username" : tab}
                      </button>
                    ))}
                  </div>

                  {activeCohortTab === "Invite by Email" ? (
                    <div className="rounded-[18px] border border-[#E7EAF0] bg-white p-6">
                      <h2 className="text-[16px] font-bold text-[#111827]">Invite by @username</h2>
                      <p className="mt-1 text-[13px] text-[#667085]">Researchers are invited by their Unpatched @username; the invitation reaches their inbox and their email stays private.</p>
                      <div className="mt-4 flex gap-2">
                        <input
                          type="email"
                          value={emailInviteInput}
                          onChange={(e) => setEmailInviteInput(e.target.value)}
                          placeholder="@username"
                          className="h-10 flex-1 rounded-[10px] border border-[#D0D5DD] px-3.5 font-mono text-[13px]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!emailInviteInput.trim()) return;
                            setState((prev) => ({
                              ...prev,
                              invitedEmails: [...prev.invitedEmails, emailInviteInput.trim()],
                            }));
                            setEmailInviteInput("");
                            showToast("Added to the invite list. Invitations go out when you launch.");
                          }}
                          className="rounded-[10px] bg-[#111827] px-4 text-[13px] font-semibold text-white"
                        >
                          Queue Invite
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {state.invitedEmails.map((em) => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-2 rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1 font-mono text-[12px]"
                          >
                            <Mail className="size-3.5 text-[#2563EB]" /> {em}
                            <button
                              type="button"
                              onClick={() =>
                                setState((prev) => ({
                                  ...prev,
                                  invitedEmails: prev.invitedEmails.filter((x) => x !== em),
                                }))
                              }
                            >
                              <X className="size-3.5 text-[#667085]" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 7 Required Filters: Country, Skills, Reputation, Signal Score, Languages, Industry Experience, Availability */}
                      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                          <div className="col-span-2 flex items-center gap-2 rounded-[10px] border border-[#D0D5DD] bg-[#F8FAFC] px-3">
                            <Search className="size-3.5 text-[#667085]" />
                            <input
                              type="search"
                              value={researcherSearch}
                              onChange={(e) => setResearcherSearch(e.target.value)}
                              placeholder="Search name or @username..."
                              className="h-8 w-full bg-transparent text-[12px] outline-none"
                            />
                          </div>

                          <select
                            aria-label="Filter by Reputation"
                            value={minReputationFilter}
                            onChange={(e) => setMinReputationFilter(Number(e.target.value))}
                            className="h-8 rounded-[8px] border border-[#E7EAF0] bg-[#F8FAFC] px-2 text-[11px]"
                          >
                            <option value={0}>Reputation: Any</option>
                            <option value={50}>50+ points</option>
                            <option value={200}>200+ points</option>
                            <option value={500}>500+ points</option>
                          </select>

                        </div>
                      </div>

                      {/* Researcher Cards Grid */}
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {filteredResearchers.map((researcher) => {
                          const isInvited = state.invitedResearcherIds.includes(researcher.id);
                          const isBulkChecked = bulkSelectedResearcherIds.includes(researcher.id);
                          return (
                            <div
                              key={researcher.id}
                              className={`rounded-[16px] border p-5 transition-all ${
                                isInvited
                                  ? "border-[#2563EB] bg-[#EFF6FF]/35 shadow-[0_4px_14px_rgba(37,99,235,0.08)]"
                                  : "border-[#E7EAF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${researcher.name}`}
                                    checked={isBulkChecked}
                                    onChange={() =>
                                      setBulkSelectedResearcherIds((prev) =>
                                        prev.includes(researcher.id)
                                          ? prev.filter((id) => id !== researcher.id)
                                          : [...prev, researcher.id],
                                      )
                                    }
                                    className="mt-2.5 size-4 rounded border-[#D0D5DD] accent-[#2563EB]"
                                  />
                                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#111827] font-mono text-[13px] font-bold text-white">
                                    {researcher.avatarInitials}
                                  </span>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <h3 className="text-[15px] font-bold text-[#111827]">{researcher.name}</h3>
                                      <span className="font-mono text-[12px] text-[#2563EB]">
                                        @{researcher.handle}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setState((prev) => ({
                                      ...prev,
                                      invitedResearcherIds: isInvited
                                        ? prev.invitedResearcherIds.filter((id) => id !== researcher.id)
                                        : [...prev.invitedResearcherIds, researcher.id],
                                    }))
                                  }
                                  className={`shrink-0 rounded-[10px] px-3 py-1.5 font-mono text-[12px] font-semibold transition-colors ${
                                    isInvited
                                      ? "border border-[#A6F4C5] bg-[#ECFDF3] text-[#027A48]"
                                      : "bg-[#111827] text-white hover:bg-[#1F2937]"
                                  }`}
                                >
                                  {isInvited ? "✓ Invited" : "+ Invite"}
                                </button>
                              </div>

                              {/* Required Researcher Card Telemetry: Reputation, Acceptance Rate, Avg Severity, Response Time */}
                              <div className="mt-4 grid grid-cols-4 gap-2 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-2.5 text-center font-mono">
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase">Reputation</span>
                                  <strong className="text-[13px] text-[#111827]">
                                    {researcher.reputation.toLocaleString("en-US")}
                                  </strong>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase">Resolved</span>
                                  <strong className="text-[13px] text-[#12B76A]">{researcher.pastValidReports}</strong>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase">Bounties</span>
                                  <strong className="text-[12px] text-[#B42318]">{researcher.bountiesFinalized}</strong>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===============================================================
                  STEP 7 — AUTOMATION & INTEGRATIONS
                  =============================================================== */}
              {state.currentStep === "automation" && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                    <div>
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                        Step 7 · Automation &amp; Ecosystem Integrations
                      </span>
                      <h1 className="mt-0.5 text-[22px] font-bold text-[#111827]">
                        Issue Sync, Chat Alerts &amp; Notifications
                      </h1>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-[#A6F4C5] bg-[#ECFDF3] px-3 py-1.5 font-mono text-[12px] font-semibold text-[#027A48]">
                        {state.enabledModuleIds.length} Active Modules
                      </span>
                    </div>
                  </div>

                  {/* 6 Required Category Tabs */}
                  <div className="flex flex-wrap gap-1.5 rounded-[14px] border border-[#E7EAF0] bg-white p-1.5">
                    {(
                      [
                        "All",
                        "Issue Tracking",
                        "Communication",
                        "Developer",
                        "Notifications",
                        // "AI",  (AI modules are not built yet)
                        "Workflow",
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveAutomationCategory(cat)}
                        className={`rounded-[10px] px-3.5 py-2 text-[12px] font-semibold transition-all ${
                          activeAutomationCategory === cat
                            ? "bg-[#111827] text-white"
                            : "text-[#475467] hover:bg-[#F8FAFC] hover:text-[#111827]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Modules Grid */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredAutomationModules.map((mod) => {
                      const isEnabled = !mod.comingSoon && connectedModuleIds.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          className={`flex flex-col justify-between rounded-[16px] border p-5 transition-all ${
                            isEnabled
                              ? "border-[#2563EB] bg-white shadow-[0_6px_18px_rgba(37,99,235,0.07)]"
                              : "border-[#E7EAF0] bg-white/80"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="rounded border border-[#E7EAF0] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#475467]">
                                  {mod.category} · {mod.provider}
                                </span>
                                <h3 className="mt-1.5 text-[15px] font-bold text-[#111827]">{mod.name}</h3>
                              </div>
                              {mod.comingSoon ? (
                                <span className="shrink-0 rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[11px] font-semibold text-[#475467]">Coming soon</span>
                              ) : isEnabled ? (
                                <span className="shrink-0 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-semibold text-[#027A48]">Connected</span>
                              ) : (
                                <Link href={`/organizations/${organizationId}/integrations` as Route} prefetch={false} className="shrink-0 rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-semibold text-[#2563EB]">Set up</Link>
                              )}
                            </div>
                            <p className="mt-2 text-[12px] leading-relaxed text-[#475467]">{mod.description}</p>
                          </div>

                          <div className="mt-4 flex items-center justify-between border-t border-[#E7EAF0] pt-3 font-mono text-[11px]">
                            <span className="inline-flex items-center gap-1.5 text-[#027A48]">
                              <span className="size-2 rounded-full bg-[#12B76A]" />
                              {mod.comingSoon ? "Not available yet" : isEnabled ? "Connected for your organization" : "Not connected"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 8 — REVIEW & PROGRAM READINESS SCORE
                  =============================================================== */}
              {state.currentStep === "review" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left 4 Columns: Program Readiness Score & Interactive Checklist */}
                  <div className="space-y-5 lg:col-span-4">
                    <div className="rounded-[20px] border border-[#E7EAF0] bg-white p-6 shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB] uppercase">
                        Pre-Flight Verification
                      </span>
                      <h2 className="mt-1 text-[20px] font-bold text-[#111827]">Program Readiness Score</h2>

                      <div className="mt-5 flex items-center gap-4 rounded-[16px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <div className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-[#12B76A] bg-white font-mono text-[24px] font-bold text-[#111827]">
                          {readinessReport.score}%
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#027A48]">
                            {readinessReport.gradeLabel}
                          </span>
                          <p className="mt-1.5 text-[12px] text-[#475467]">
                            {readinessReport.items.filter((i) => i.status === "complete").length} of{" "}
                            {readinessReport.items.length} operational checks passed.
                          </p>
                        </div>
                      </div>

                      {/* Checklist */}
                      <div className="mt-5 space-y-2.5">
                        <p className="text-[11px] font-bold tracking-wider text-[#667085] uppercase">
                          Launch Checklist
                        </p>
                        {readinessReport.items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start justify-between gap-2 rounded-[12px] border p-3 text-[12px] ${
                              item.status === "complete"
                                ? "border-[#E7EAF0] bg-white"
                                : "border-[#FEDF89] bg-[#FFFAEB]"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {item.status === "complete" ? (
                                <span className="mt-0.5 font-bold text-[#12B76A]">✓</span>
                              ) : (
                                <span className="mt-0.5 font-bold text-[#F59E0B]">⚠</span>
                              )}
                              <div>
                                <p className="font-semibold text-[#111827]">{item.label}</p>
                                <p className="text-[11px] text-[#667085]">{item.detail}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => goToStep(item.targetStep)}
                              className="shrink-0 font-mono text-[11px] font-semibold text-[#2563EB] hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right 8 Columns: 9 Large Summary Cards with Direct Step Jump */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
                    {(
                      [
                        {
                          title: "Program",
                          step: "details" as StudioStepId,
                          primary: state.programName,
                          secondary: `${selectedBlueprint.name} Blueprint${businessUnitLabel ? ` · ${businessUnitLabel}` : ""}`,
                        },
                        {
                          title: "Visibility",
                          step: "details" as StudioStepId,
                          primary: `${state.visibility} (${state.lifecycle})`,
                          secondary: `Owner: ${productOwnerName || "not set"}`,
                        },
                        {
                          title: "Assets",
                          step: "scope" as StudioStepId,
                          primary: `${state.selectedAssetIds.length} In-Scope Targets`,
                          secondary: `${scopeTelemetry.coveragePercent}% coverage · ${scopeTelemetry.verificationPercent}% verified · ${scopeTelemetry.criticalAssetsCount} Critical`,
                        },
                        {
                          title: "Researchers",
                          step: "access" as StudioStepId,
                          primary: `${state.invitedResearcherIds.length} Curated + ${state.invitedEmails.length} Email Invites`,
                          secondary: `Signed claim link: ${state.inviteLinkEnabled ? "Active" : "Disabled"}`,
                        },
                        {
                          title: "Budget",
                          step: "rewards" as StudioStepId,
                          primary: `$${rewardForecast.estimatedMonthlySpend.toLocaleString("en-US")}/mo Est. Spend`,
                          secondary: `Avg payout $${rewardForecast.averagePayout.toLocaleString("en-US")} · Critical cap $${state.rewardMatrix.critical.max.toLocaleString("en-US")}`,
                        },
                        {
                          title: "Automation",
                          step: "automation" as StudioStepId,
                          primary: `${connectedModuleIds.filter((id) => id !== "email").length} integrations connected`,
                          secondary: "Organization-wide; set up in Integrations",
                        },
                        {
                          title: "Integrations",
                          step: "automation" as StudioStepId,
                          primary: `${
                            state.enabledModuleIds.filter((id) =>
                              ["jira", "azure_devops", "linear", "slack", "teams", "discord", "github", "gitlab", "email", "webhooks"].includes(id),
                            ).length
                          } Connected Systems`,
                          secondary: state.enabledModuleIds.slice(0, 5).join(", ").toUpperCase(),
                        },
                        {
                          title: "Policies",
                          step: "rewards" as StudioStepId,
                          primary: state.policy.safeHarborType,
                          secondary: `${state.policy.responseSlaHours}h Ack · ${state.policy.resolutionSlaDays}d Fix · ${state.policy.disclosureTimelineDays}d Disclosure`,
                        },
                        {
                          title: "Timeline",
                          step: "details" as StudioStepId,
                          primary: `Launch: ${state.launchDate}`,
                          secondary: state.endDate ? `Scheduled End: ${state.endDate}` : "Continuous ongoing operation",
                        },
                      ] as const
                    ).map((card) => (
                      <div
                        key={card.title}
                        className="flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-semibold tracking-wider text-[#667085] uppercase">
                              {card.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => goToStep(card.step)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#2563EB] hover:border-[#2563EB] hover:bg-[#EFF6FF]"
                            >
                              Edit →
                            </button>
                          </div>
                          <h3 className="mt-2 text-[16px] font-bold text-[#111827]">{card.primary}</h3>
                          <p className="mt-1 text-[12px] text-[#475467]">{card.secondary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===============================================================
                  STEP 9 — LAUNCH CONFIRMATION SCREEN
                  =============================================================== */}
              {state.currentStep === "launch" && (
                <div className="mx-auto max-w-4xl">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden rounded-[24px] border border-[#E7EAF0] bg-white shadow-[0_20px_50px_rgba(16,24,40,0.08)]"
                  >
                    <div className="border-b border-[#E7EAF0] bg-[linear-gradient(135deg,#EFF6FF_0%,#FFFFFF_65%,#ECFDF3_100%)] p-8 text-center">
                      <motion.div
                        initial={{ scale: 0.85 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="mx-auto inline-flex size-16 items-center justify-center rounded-[20px] bg-[#111827] text-white shadow-[0_12px_28px_rgba(16,24,40,0.18)]"
                      >
                        <Rocket className="size-8 text-[#60A5FA]" />
                      </motion.div>
                      <span className="mt-4 block font-mono text-[11px] font-semibold tracking-wider text-[#2563EB] uppercase">
                        Step 9 · Final Deployment Confirmation
                      </span>
                      <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111827] sm:text-[32px]">
                        Ready to Deploy Security Program
                      </h1>
                      <p className="mx-auto mt-2 max-w-xl text-[14px] text-[#475467]">
                        Review the final telemetry below and choose whether to launch immediately, schedule for{" "}
                        <span className="font-mono font-semibold text-[#111827]">{state.launchDate}</span>, or save as a
                        verified draft.
                      </p>
                    </div>

                    {/* 6 Required Launch Confirmation Fields */}
                    <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 sm:p-8">
                      <div className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">Program Name</span>
                        <p className="mt-1 text-[15px] font-bold text-[#111827]">{state.programName}</p>
                      </div>

                      <div className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">Launch Date</span>
                        <p className="mt-1 font-mono text-[15px] font-bold text-[#111827]">{state.launchDate}</p>
                      </div>

                      <div className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">Visibility</span>
                        <p className="mt-1 font-mono text-[15px] font-bold text-[#2563EB]">{state.visibility}</p>
                      </div>

                      <div className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">Scope</span>
                        <p className="mt-1 font-mono text-[15px] font-bold text-[#111827]">
                          {state.selectedAssetIds.length} Assets ({scopeTelemetry.estimatedAttackSurfaceEndpoints}{" "}
                          endpoints)
                        </p>
                      </div>

                      <div className="rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC] p-4">
                        <span className="text-[11px] font-semibold text-[#667085] uppercase">Researchers</span>
                        <p className="mt-1 font-mono text-[15px] font-bold text-[#111827]">
                          {state.invitedResearcherIds.length + state.invitedEmails.length} Cohort Invites
                        </p>
                      </div>

                      <div className="rounded-[14px] border border-[#A6F4C5] bg-[#ECFDF3]/70 p-4">
                        <span className="text-[11px] font-semibold text-[#027A48] uppercase">
                          Estimated Monthly Cost
                        </span>
                        <p className="mt-1 font-mono text-[16px] font-bold text-[#027A48]">
                          ${rewardForecast.estimatedMonthlySpend.toLocaleString("en-US")}/mo
                        </p>
                      </div>
                    </div>

                    <p className="text-[13px] text-[#667085]">Launch creates the program and submits it for review; Unpatched checks scope and policy before it goes live. Create as Draft creates it without submitting.</p>
                    {launchError && (
                      <p role="alert" className="rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[13px] font-medium text-[#B42318]">{launchError}</p>
                    )}
                    {/* 3 Required Primary/Secondary Launch Buttons */}
                    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-[#E7EAF0] bg-[#F8FAFC] px-6 py-5 sm:px-8">
                      <button
                        type="button"
                        disabled={pendingLaunch}
                        onClick={() => handleExecuteLaunch("launched")}
                        className="inline-flex h-12 items-center gap-2.5 rounded-[12px] bg-[#2563EB] px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#1D4ED8] disabled:opacity-60"
                      >
                        <Rocket className="size-4" />
                        <span>{pendingLaunch ? "Creating program..." : "Launch Program"}</span>
                      </button>

                      {/* Scheduled launches need a scheduler that doesn't exist yet. */}
                      <button type="button" disabled className="inline-flex h-12 items-center gap-2 rounded-[12px] border border-[#D0D5DD] bg-white px-5 text-[14px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all hover:bg-[#F8FAFC] disabled:opacity-60" title="Coming soon">
                        <Calendar className="size-4 text-[#2563EB]" />
                        <span>Schedule Launch (coming soon)</span>
                      </button>

                      <button
                        type="button"
                        disabled={pendingLaunch}
                        onClick={() => handleExecuteLaunch("draft")}
                        className="inline-flex h-12 items-center gap-2 rounded-[12px] border border-[#E7EAF0] bg-white px-5 text-[14px] font-semibold text-[#475467] transition-all hover:bg-[#F8FAFC] hover:text-[#111827] disabled:opacity-60"
                      >
                        <Save className="size-4" />
                        <span>Create as Draft</span>
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* STICKY FOOTER NAVIGATION CONTROLS (Previous / Continue / Save Draft) */}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E7EAF0] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreviousStep}
                disabled={currentStepMeta.index === 1}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-4 text-[13px] font-semibold text-[#111827] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
              >
                <ArrowLeft className="size-4" />
                <span>Previous</span>
              </button>
              <span className="hidden font-mono text-[11px] text-[#98A2B3] sm:inline">
                Tip: Use Alt + ← / → to navigate steps
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSaveDraftSnapshot}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-4 text-[13px] font-semibold text-[#475467] hover:bg-white hover:text-[#111827]"
              >
                <Save className="size-3.5" />
                <span>Save Draft</span>
              </button>

              {currentStepMeta.index < STUDIO_STEPS.length ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#111827] px-5 text-[13px] font-semibold text-white shadow-[0_1px_3px_rgba(16,24,40,0.12)] transition-all hover:bg-[#1F2937]"
                >
                  <span>Continue to {STUDIO_STEPS[currentStepMeta.index]?.shortLabel}</span>
                  <ArrowRight className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pendingLaunch}
                  onClick={() => handleExecuteLaunch("launched")}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2563EB] px-5 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.22)] hover:bg-[#1D4ED8]"
                >
                  <Rocket className="size-4" />
                  <span>Launch Program Now</span>
                </button>
              )}
            </div>
          </footer>

          {/* Compact Existing Engagements Strip at bottom so direct program links are always in the DOM */}
          {existingPrograms.length > 0 && (
            <section
              aria-label="Existing Organization Engagements"
              className="mt-6 rounded-[16px] border border-[#E7EAF0] bg-white px-5 py-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[11px] font-semibold text-[#667085] uppercase">
                  Active Workspace Engagements ({existingPrograms.length})
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {existingPrograms.map((program) => (
                    <Link
                      key={program.id}
                      prefetch={false}
                      href={`/organizations/${organizationId}/programs/${program.id}` as Route}
                      className="inline-flex items-center gap-2 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-[12px] font-semibold text-[#111827] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                    >
                      <span>{program.name}</span>
                      <ProgramStatusBadge status={program.status} />
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

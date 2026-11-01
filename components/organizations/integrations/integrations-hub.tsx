"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Plus,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  ArrowUpRight,
  TrendingUp,
  KeyRound,
  FileText,
  Lock,
  MessageSquare,
  Building2,
  FolderGit2,
  Globe,
  Zap,
  Sliders,
  MoreVertical,
  Activity,
  Check,
  Copy,
  Info,
  ChevronRight,
  ChevronDown,
  Trash2,
  Code,
  Terminal,
  Database,
  HelpCircle,
  X,
  Play,
  RotateCw,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  MOCK_INSTALLED_INTEGRATIONS,
  MOCK_AVAILABLE_INTEGRATIONS,
  MOCK_SYNC_HISTORY,
  MOCK_WEBHOOK_ENDPOINTS,
  MOCK_HUB_AUDIT_TIMELINE,
  type InstalledIntegration,
  type AvailableIntegration,
  type SyncHistoryItem,
  type WebhookEndpointItem,
  type IntegrationCategory,
} from "../../../lib/mock/integrations-hub-intelligence";
import type { OrganizationRole } from "../../../types/auth";

type HubTab = "installed" | "marketplace" | "health" | "sync" | "webhooks" | "audit";

const CATEGORIES: { id: IntegrationCategory; label: string }[] = [
  { id: "all", label: "All Categories" },
  { id: "issue-tracking", label: "Issue Tracking" },
  { id: "communication", label: "Communication" },
  { id: "identity", label: "Identity & SSO" },
  { id: "source-control", label: "Source Control" },
  { id: "itsm", label: "ITSM" },
  { id: "cloud", label: "Cloud Infrastructure" },
  { id: "security", label: "Security & SIEM" },
  { id: "developer", label: "Developer Tools" },
];

export function IntegrationsHub({
  organizationId,
  organizationName,
  userRole,
}: {
  organizationId: string;
  organizationName: string;
  userRole?: OrganizationRole;
}) {
  const [activeTab, setActiveTab] = useState<HubTab>("installed");
  const [selectedCategory, setSelectedCategory] = useState<IntegrationCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Drawer state
  const [selectedInstalled, setSelectedInstalled] = useState<InstalledIntegration | null>(null);
  const [selectedAvailable, setSelectedAvailable] = useState<AvailableIntegration | null>(null);

  // Local state for actions
  const [installedList, setInstalledList] = useState<InstalledIntegration[]>(MOCK_INSTALLED_INTEGRATIONS);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryItem[]>(MOCK_SYNC_HISTORY);
  const [webhooks, setWebhooks] = useState<WebhookEndpointItem[]>(MOCK_WEBHOOK_ENDPOINTS);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Deep link support for ?tab=webhooks or ?app=jira
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "webhooks") setActiveTab("webhooks");
    else if (tabParam === "sync") setActiveTab("sync");
    else if (tabParam === "marketplace") setActiveTab("marketplace");

    const appParam = params.get("app");
    if (appParam) {
      const match = MOCK_INSTALLED_INTEGRATIONS.find(
        (i) => i.slug === appParam || i.name.toLowerCase().includes(appParam.toLowerCase()),
      );
      if (match) setSelectedInstalled(match);
    }
  }, []);

  const notify = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    notify("Copied to clipboard.");
  };

  const handleTestConnection = (name: string) => {
    setIsTestingConnection(true);
    setTimeout(() => {
      setIsTestingConnection(false);
      notify(`Connection test to ${name} succeeded: HTTP 200 OK (Latency: 84ms)`);
    }, 1000);
  };

  const handleToggleStatus = (id: string) => {
    setInstalledList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextStatus = item.status === "disconnected" ? "healthy" : "disconnected";
          notify(`${item.name} is now ${nextStatus === "healthy" ? "connected" : "disabled"}.`);
          return {
            ...item,
            status: nextStatus,
            healthScore: nextStatus === "healthy" ? 100 : 0,
          };
        }
        return item;
      }),
    );
  };

  const handleRetrySync = (id: string) => {
    setSyncHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "success" as const } : item)),
    );
    notify("Sync event retried successfully.");
  };

  // Filtered lists
  const filteredInstalled = useMemo(() => {
    return installedList.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.connectedWorkspace.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [installedList, selectedCategory, searchQuery]);

  const filteredAvailable = useMemo(() => {
    return MOCK_AVAILABLE_INTEGRATIONS.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Metric aggregates
  const healthyCount = installedList.filter((i) => i.status === "healthy").length;
  const warningCount = installedList.filter((i) => i.status === "warning").length;
  const disconnectedCount = installedList.filter((i) => i.status === "disconnected").length;
  const totalCalls = installedList.reduce((acc, curr) => acc + curr.syncStats.requestsToday, 0);

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionSuccessMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* 1. Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-b from-white to-[#F9FAFB] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Plug className="size-4.5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#111827]">
                Enterprise Integration Hub
              </h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                {healthyCount} Active Connectors
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                mTLS & OAuth 2.0 Enforced
              </span>
            </div>
            <p className="text-sm text-[#475467] max-w-2xl">
              Central command center to connect, monitor, troubleshoot, and govern every external system that
              interacts with <strong className="text-[#111827]">{organizationName}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("marketplace");
                setSelectedCategory("all");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>Browse Marketplace ({MOCK_AVAILABLE_INTEGRATIONS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("webhooks")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Globe className="size-3.5 text-[#667085]" />
              <span>Manage Webhooks</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sync")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Activity className="size-3.5 text-[#667085]" />
              <span>Sync Activity</span>
            </button>
          </div>
        </div>

        {/* 2. Integration Health Overview KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Connected Apps</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{installedList.length}</span>
              <span className="text-[11px] font-semibold text-blue-600">Total</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Across 5 categories</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Healthy</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-emerald-700">{healthyCount}</span>
              <span className="text-[11px] font-semibold text-emerald-600">Operational</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Zero latency spikes</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Warning</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-amber-600">{warningCount}</span>
              <span className="text-[11px] font-semibold text-amber-600">Attention</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">OAuth expiring soon</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Disconnected</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-rose-600">{disconnectedCount}</span>
              <span className="text-[11px] font-semibold text-rose-600">Action needed</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">mTLS cert expired</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">API Calls Today</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{totalCalls.toLocaleString("en-US")}</span>
              <span className="text-[11px] font-semibold text-emerald-600">99.8%</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Avg latency 86ms</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Active Webhooks</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{webhooks.length}</span>
              <span className="text-[11px] font-semibold text-blue-600">HMAC-SHA256</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">5,204 delivered today</div>
          </div>
        </div>
      </div>

      {/* Navigation Segmented Controls */}
      <div className="flex border-b border-[#E7EAF0] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("installed")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "installed"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Layers className="size-4" />
          <span>Installed Integrations ({installedList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("marketplace")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "marketplace"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Plug className="size-4" />
          <span>Available Integrations Directory ({MOCK_AVAILABLE_INTEGRATIONS.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("health")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "health"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Activity className="size-4" />
          <span>Connection Health & Telemetry</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sync")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "sync"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <RefreshCw className="size-4" />
          <span>Sync History & Event Bus</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("webhooks")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "webhooks"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Globe className="size-4" />
          <span>Webhooks Manager ({webhooks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "audit"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Clock className="size-4" />
          <span>Integration Audit Timeline</span>
        </button>
      </div>

      {/* 3. Category Filter Strip & Search */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap",
                selectedCategory === cat.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-[#F9FAFB] text-[#475467] hover:bg-[#F2F4F7] hover:text-[#111827]",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-1.5 sm:w-64 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10">
          <Search className="size-3.5 text-[#98A2B3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search integrations..."
            className="w-full bg-transparent text-xs text-[#111827] placeholder:text-[#98A2B3] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs text-[#98A2B3] hover:text-[#111827]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 4. Installed Integrations Tab */}
      {activeTab === "installed" && (
        <div className="space-y-3">
          {filteredInstalled.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col gap-4 rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm transition-all hover:border-[#D0D5DD] hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1E293B] font-bold text-xs text-white shadow-sm">
                  {item.name.substring(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-[#111827]">{item.name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {item.categoryLabel}
                    </span>
                    <span className="text-xs text-[#98A2B3] font-mono">{item.version}</span>
                    {item.status === "healthy" ? (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        Healthy ({item.healthScore}%)
                      </span>
                    ) : item.status === "warning" ? (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="size-3 text-amber-600" />
                        Warning ({item.healthScore}%)
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700 flex items-center gap-1">
                        <XCircle className="size-3 text-rose-600" />
                        Disconnected
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
                    <span className="font-medium text-[#475467]">{item.connectedWorkspace}</span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-[#D0D5DD] select-none">•</span>
                      <span><span className="text-[#98A2B3]">Owner:</span> {item.ownerName}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-[#D0D5DD] select-none">•</span>
                      <span><span className="text-[#98A2B3]">Last sync:</span> {item.lastSync}</span>
                    </span>
                  </div>

                  <div className="text-[11.5px] text-[#475467] line-clamp-1">
                    <span className="font-semibold text-[#111827]">Recent Activity:</span> {item.lastActivity}
                  </div>
                </div>
              </div>

              {/* Quick Actions & Automation badge */}
              <div className="flex shrink-0 flex-col items-start sm:items-end gap-2.5 border-t border-[#F2F4F7] pt-3 sm:border-t-0 sm:pt-0">
                <div className="text-left sm:text-right text-xs">
                  <Link
                    href={`/organizations/${organizationId}/automation`}
                    className="font-semibold text-[#111827] hover:text-blue-600 transition-colors inline-block"
                  >
                    {item.automationsCount} Connected Workflows →
                  </Link>
                  <div className="text-[11px] text-[#98A2B3] mt-0.5">
                    {item.syncStats.requestsToday.toLocaleString("en-US")} API calls today • {item.syncStats.avgLatencyMs}ms
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedInstalled(item)}
                    className="rounded-lg bg-blue-50 border border-blue-200/60 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    Configure
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestConnection(item.name)}
                    className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
                    title="Test Connection"
                  >
                    Test
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(item.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors",
                      item.status === "disconnected"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-slate-200 bg-white text-[#667085] hover:text-[#111827] hover:bg-slate-50",
                    )}
                  >
                    {item.status === "disconnected" ? "Reconnect" : "Disable"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Available Integrations Marketplace Tab */}
      {activeTab === "marketplace" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">
                Enterprise Integrations Catalog ({filteredAvailable.length})
              </h3>
              <p className="text-xs text-[#667085]">
                Certified connectors for CI/CD, issue tracking, SIEM, identity federation, and cloud providers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAvailable.map((app) => (
              <div
                key={app.id}
                className="flex flex-col justify-between rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm transition-all hover:border-[#D0D5DD] hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1E293B] text-white font-bold text-xs shadow-sm">
                        {app.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-[#111827] flex items-center gap-1.5">
                          <span>{app.name}</span>
                          {app.verified && <CheckCircle2 className="size-3.5 text-blue-600" />}
                        </h4>
                        <span className="text-[11px] text-[#667085]">{app.categoryLabel}</span>
                      </div>
                    </div>

                    {app.installed && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Installed
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#475467] line-clamp-2 leading-relaxed">
                    {app.description}
                  </p>

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-[#667085]">Capabilities:</div>
                    <div className="flex flex-wrap gap-1">
                      {app.features.map((f) => (
                        <span
                          key={f}
                          className="rounded bg-[#F9FAFB] border border-[#E7EAF0] px-1.5 py-0.5 text-[10px] text-[#475467]"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[#F2F4F7] pt-3 text-xs">
                  <span className="text-[11px] font-mono text-[#98A2B3]">{app.authType}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAvailable(app)}
                      className="font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Learn More
                    </button>
                    {!app.installed && (
                      <button
                        type="button"
                        onClick={() => notify(`Install wizard launched for ${app.name}`)}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Connection Health Dashboard Tab */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-[#111827]">
                Continuous Integration Health & Telemetry
              </h3>
              <p className="text-xs text-[#667085]">
                Real-time API health, latency metrics, rate limiting status, and token lifecycle tracking.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Healthy Connections</span>
                <div className="text-2xl font-black text-emerald-600">{healthyCount} / {installedList.length}</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${(healthyCount / installedList.length) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-[#667085]">All core mission-critical connectors live</span>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Rate Limit Saturation</span>
                <div className="text-2xl font-black text-blue-600">14.2%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "14.2%" }} />
                </div>
                <span className="text-[11px] text-[#667085]">ServiceNow throttled during batch push</span>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Credential Expirations</span>
                <div className="text-2xl font-black text-amber-600">1 Soon</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "30%" }} />
                </div>
                <span className="text-[11px] text-amber-700 font-medium">ServiceNow OAuth expires in 12 days</span>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Average Ingest Latency</span>
                <div className="text-2xl font-black text-purple-600">86ms</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: "88%" }} />
                </div>
                <span className="text-[11px] text-[#667085]">Under enterprise 200ms threshold</span>
              </div>
            </div>

            {/* Health Table */}
            <div className="space-y-3 pt-3 border-t border-[#F2F4F7]">
              <h4 className="font-bold text-xs text-[#111827]">Connector Breakdown:</h4>
              <div className="divide-y divide-[#F2F4F7] rounded-xl border border-[#E7EAF0]">
                {installedList.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3.5 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#111827] flex items-center gap-2">
                        <span>{app.name}</span>
                        <span className="text-[11px] font-normal text-[#667085]">({app.authMethod})</span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3]">
                        {app.connectedWorkspace} • Credentials: {app.credentialsExpiry}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-[#111827]">{app.syncStats.successRate}% Success</div>
                        <div className="text-[10px] text-[#98A2B3]">{app.syncStats.avgLatencyMs}ms avg latency</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedInstalled(app)}
                        className="rounded-lg border border-[#E7EAF0] px-2.5 py-1 text-xs font-medium text-[#344054] hover:bg-[#F9FAFB]"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Sync History Tab */}
      {activeTab === "sync" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Bi-directional Sync Event Stream</h3>
              <p className="text-xs text-[#667085]">
                Real-time delivery receipts across issue trackers, SIEM streams, and identity webhooks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => notify("Re-evaluating sync queues across all connectors...")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <RefreshCw className="size-3.5" />
              <span>Refresh Feed</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {syncHistory.map((sync) => (
              <div
                key={sync.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#111827]">{sync.integrationName}</span>
                    <span className="font-semibold text-xs text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                      {sync.event}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.2 text-[10px] font-bold",
                        sync.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : sync.status === "warning"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700",
                      )}
                    >
                      {sync.status.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs text-[#475467]">{sync.details}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#98A2B3]">
                    <span>Payload: {sync.payloadSummary}</span>
                    <span>•</span>
                    <span>Duration: {sync.durationMs}ms</span>
                    <span>•</span>
                    <span>Triggered by {sync.triggeredBy}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#98A2B3]">{sync.timestamp}</span>
                  {sync.canRetry && sync.status !== "success" && (
                    <button
                      type="button"
                      onClick={() => handleRetrySync(sync.id)}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. Webhooks Manager Tab */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">HMAC-SHA256 Webhook Bus Manager</h3>
              <p className="text-xs text-[#667085]">
                Cryptographically signed event dispatch to SIEM, SOAR pipelines, and custom security backends.
              </p>
            </div>
            <button
              type="button"
              onClick={() => notify("New webhook endpoint dialog opened.")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>Create Webhook</span>
            </button>
          </div>

          <div className="space-y-3">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-[#111827]">{wh.name}</h4>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.2 text-[10px] font-bold",
                          wh.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200",
                        )}
                      >
                        {wh.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-[#667085] mt-0.5">{wh.url}</div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-bold text-emerald-700">{wh.successRate}% Success</span>
                    <div className="text-[11px] text-[#98A2B3]">Last delivery: {wh.lastDeliveryTime}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[#667085]">Subscribed Events:</span>
                  {wh.events.map((ev) => (
                    <span
                      key={ev}
                      className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-700"
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-[#F9FAFB] p-2.5 text-xs border border-[#F2F4F7]">
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-[#667085]">Signing Secret:</span>
                    <span className="text-[#111827]">{wh.secretPrefix}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(wh.secretPrefix, wh.id)}
                      className="text-blue-600 hover:text-blue-700 font-sans text-xs font-semibold"
                    >
                      {copiedKey === wh.id ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => notify(`Dispatched mock test ping payload to ${wh.url}`)}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                    >
                      Send Test Ping
                    </button>
                    <button
                      type="button"
                      onClick={() => notify(`Signing secret rotated for ${wh.name}`)}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                    >
                      Rotate Secret
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. Audit Timeline Tab */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Integration Security Audit Timeline</h3>
            <p className="text-xs text-[#667085]">
              Every connection modification, secret rotation, and API permission grant is recorded.
            </p>
          </div>

          <div className="relative border-l border-[#E7EAF0] ml-3.5 space-y-5 py-2">
            {MOCK_HUB_AUDIT_TIMELINE.map((event) => (
              <div key={event.id} className="relative pl-6">
                <span className="absolute -left-1.5 top-1 size-3 rounded-full bg-blue-600 ring-4 ring-white" />
                <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111827]">{event.action}</span>
                    <span className="text-[11px] text-[#98A2B3]">{event.timestamp}</span>
                  </div>
                  <div className="text-xs text-[#475467]">
                    Integration: <span className="font-semibold text-[#111827]">{event.integration}</span> • Actor: {event.actor}
                  </div>
                  <p className="text-xs text-[#667085]">{event.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Integration Details Drawer (Slide-over) */}
      {selectedInstalled && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white p-6 shadow-2xl overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between border-b border-[#E7EAF0] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1E293B] text-white font-bold text-base shadow-sm">
                  {selectedInstalled.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <span>{selectedInstalled.name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {selectedInstalled.categoryLabel}
                    </span>
                  </h3>
                  <p className="text-xs text-[#667085] font-mono">{selectedInstalled.connectedWorkspace}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedInstalled(null)}
                className="rounded-lg p-1 text-[#98A2B3] hover:text-[#111827]"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Health & Status Card */}
            <div className="rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#667085]">Connection Posture:</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    selectedInstalled.status === "healthy"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : selectedInstalled.status === "warning"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200",
                  )}
                >
                  {selectedInstalled.status.toUpperCase()} ({selectedInstalled.healthScore}%)
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#667085]">Authentication Method:</span>
                <span className="font-semibold text-[#111827]">{selectedInstalled.authMethod}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#667085]">Credential Expiration:</span>
                <span
                  className={cn(
                    "font-semibold",
                    selectedInstalled.credentialsStatus === "expiring_soon"
                      ? "text-amber-700"
                      : selectedInstalled.credentialsStatus === "expired"
                      ? "text-rose-700"
                      : "text-emerald-700",
                  )}
                >
                  {selectedInstalled.credentialsExpiry}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#667085]">Configured By:</span>
                <span className="font-semibold text-[#111827]">
                  {selectedInstalled.ownerName} ({selectedInstalled.ownerEmail})
                </span>
              </div>

              {selectedInstalled.warningReason && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-800 text-[11px]">
                  <strong>Warning Alert:</strong> {selectedInstalled.warningReason}
                </div>
              )}
            </div>

            {/* 11. Permissions Viewer */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">Granted OAuth & System Scopes:</span>
              <div className="space-y-1.5 rounded-xl border border-[#E7EAF0] bg-white p-3">
                {selectedInstalled.permissions.map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs text-[#344054]">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 12. Automation Usage */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">Dependent Workflows & Automations:</span>
              <div className="space-y-1.5">
                {selectedInstalled.automations.map((auto) => (
                  <div
                    key={auto}
                    className="flex items-center justify-between rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] p-2.5 text-xs"
                  >
                    <span className="font-medium text-[#111827]">{auto}</span>
                    <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sync Stats */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">Operational Sync Telemetry (24h):</span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-3">
                <div>
                  <span className="text-[10px] text-[#667085]">Calls Today</span>
                  <div className="font-bold text-[#111827] mt-0.5">
                    {selectedInstalled.syncStats.requestsToday.toLocaleString("en-US")}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#667085]">Success Rate</span>
                  <div className="font-bold text-emerald-600 mt-0.5">
                    {selectedInstalled.syncStats.successRate}%
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#667085]">Avg Latency</span>
                  <div className="font-bold text-[#111827] mt-0.5">
                    {selectedInstalled.syncStats.avgLatencyMs}ms
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="border-t border-[#E7EAF0] pt-4 space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleTestConnection(selectedInstalled.name)}
                  disabled={isTestingConnection}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isTestingConnection ? "Running Diagnostic Ping..." : "Test Connection"}
                </button>
                <button
                  type="button"
                  onClick={() => notify(`Credential rotation dispatched to ${selectedInstalled.ownerEmail}`)}
                  className="flex-1 rounded-xl border border-[#E7EAF0] bg-white py-2.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                >
                  Rotate Credentials
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  handleToggleStatus(selectedInstalled.id);
                  setSelectedInstalled(null);
                }}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                {selectedInstalled.status === "disconnected" ? "Reconnect Connector" : "Disconnect Integration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Available Integration Details Modal */}
      {selectedAvailable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1E293B] text-white font-bold text-base shadow-sm">
                  {selectedAvailable.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <span>{selectedAvailable.name}</span>
                    {selectedAvailable.verified && <CheckCircle2 className="size-4 text-blue-600" />}
                  </h3>
                  <p className="text-xs text-[#667085]">{selectedAvailable.categoryLabel}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAvailable(null)}
                className="rounded-lg p-1 text-[#98A2B3] hover:text-[#111827]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#475467] leading-relaxed">
              {selectedAvailable.description}
            </p>

            <div className="space-y-2 rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-3 text-xs">
              <span className="font-semibold text-[#111827]">Key Capabilities:</span>
              <ul className="list-disc pl-4 space-y-1 text-[#475467]">
                {selectedAvailable.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E7EAF0]">
              <a
                href={selectedAvailable.docUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>Documentation & Setup Guide</span>
                <ExternalLink className="size-3" />
              </a>

              <button
                type="button"
                onClick={() => {
                  setSelectedAvailable(null);
                  notify(`Integration setup flow launched for ${selectedAvailable.name}`);
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Configure Connector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

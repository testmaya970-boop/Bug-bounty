"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Zap,
  Play,
  Pause,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ChevronRight,
  MoreVertical,
  Copy,
  Trash2,
  Edit3,
  Download,
  Upload,
  RefreshCw,
  GitBranch,
  Layers,
  Settings,
  Shield,
  ShieldCheck,
  Building2,
  FileText,
  Coins,
  BrainCircuit,
  MessageSquare,
  FolderGit2,
  Unplug,
  History,
  BarChart3,
  UserCheck,
  Check,
  Eye,
  Sliders,
  Flame,
  Globe,
  Lock,
  CornerDownRight,
  Activity,
  Terminal,
  Send,
  HelpCircle,
  ChevronDown,
  Info,
  Target,
  Mail,
  CreditCard,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  INITIAL_WORKFLOWS,
  TRIGGER_CATALOG,
  ACTION_CATALOG,
  WORKFLOW_TEMPLATES,
  MOCK_EXECUTION_LOGS,
  MOCK_APPROVAL_REQUESTS,
  SYSTEM_VARIABLES,
  AUTOMATION_ANALYTICS,
  type WorkflowItem,
  type WorkflowNode,
  type ExecutionLog,
  type ApprovalRequest,
  type WorkflowTemplate,
} from "../../../lib/mock/automation-center";

interface AutomationCenterProps {
  organizationId: string;
  organizationName: string;
}

type TabType =
  | "overview"
  | "library"
  | "builder"
  | "triggers"
  | "actions"
  | "templates"
  | "history"
  | "analytics"
  | "approvals"
  | "variables";

export function AutomationCenter({ organizationId, organizationName }: AutomationCenterProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  React.useEffect(() => {
    const tab = searchParams.get("tab") as TabType | null;
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [workflows, setWorkflows] = useState<WorkflowItem[]>(INITIAL_WORKFLOWS);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Selected workflow in Visual Builder
  const [builderWorkflow, setBuilderWorkflow] = useState<WorkflowItem>(INITIAL_WORKFLOWS[0]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(INITIAL_WORKFLOWS[0].nodes[0]?.id || "node-1");

  // Testing sandbox modal state
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [sandboxStep, setSandboxStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);

  // Execution detail log drawer
  const [selectedExecution, setSelectedExecution] = useState<ExecutionLog | null>(null);

  // Execution history state & filter
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>(MOCK_EXECUTION_LOGS);
  const [executionFilter, setExecutionFilter] = useState<"all" | "failed">("all");

  // Approvals state
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(MOCK_APPROVAL_REQUESTS);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered workflows for library
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      const matchesSearch =
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === "all" || w.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || w.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [workflows, searchQuery, statusFilter, categoryFilter]);

  // Quick stats
  const activeCount = workflows.filter((w) => w.status === "active").length;
  const pausedCount = workflows.filter((w) => w.status === "paused").length;
  const draftCount = workflows.filter((w) => w.status === "draft").length;

  // Handlers
  const handleToggleWorkflowStatus = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const nextStatus = w.status === "active" ? "paused" : "active";
          showToast(`Workflow "${w.name}" set to ${nextStatus}.`);
          return { ...w, status: nextStatus };
        }
        return w;
      }),
    );
  };

  const handleDuplicateWorkflow = (item: WorkflowItem) => {
    const newWorkflow: WorkflowItem = {
      ...item,
      id: `wf-${Date.now()}`,
      name: `${item.name} (Copy)`,
      status: "draft",
      executionCount: 0,
      lastRun: "Never",
      lastModified: "Just now",
      version: "v1.0.0",
    };
    setWorkflows((prev) => [newWorkflow, ...prev]);
    showToast(`Duplicated "${item.name}" as draft.`);
  };

  const handleDeleteWorkflow = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    showToast("Workflow deleted.");
  };

  const handleInstallTemplate = (tpl: WorkflowTemplate) => {
    const newWorkflow: WorkflowItem = {
      id: `wf-${Date.now()}`,
      name: tpl.name,
      description: tpl.description,
      category: tpl.category === "discovery" ? "attack_surface" : tpl.category,
      status: "active",
      triggerEvent: tpl.triggerEvent,
      triggerCategory: "findings",
      ownerName: "Sarah Chen (Head of SecOps)",
      lastRun: "Never",
      avgRuntimeMs: 320,
      executionCount: 0,
      successRate: 100,
      lastModified: "Just now",
      version: "v1.0.0",
      manualHoursSaved: 0,
      tags: ["Template-Installed", ...tpl.integrationsUsed],
      nodes: tpl.nodes,
    };
    setWorkflows((prev) => [newWorkflow, ...prev]);
    setBuilderWorkflow(newWorkflow);
    setSelectedNodeId(newWorkflow.nodes[0]?.id || "node-1");
    setActiveTab("builder");
    showToast(`Template "${tpl.name}" installed and loaded into Workflow Builder!`);
  };

  const handleApprove = (id: string, stageName: string) => {
    setApprovals((prev) =>
      prev.map((apr) => {
        if (apr.id === id) {
          const updatedStages = apr.stages.map((stg) =>
            stg.role === stageName ? { ...stg, status: "approved" as const, timestamp: "Just now", note: "Approved by organization administrator." } : stg,
          );
          const allApproved = updatedStages.every((s) => s.status === "approved");
          return {
            ...apr,
            status: allApproved ? "approved" : "pending",
            stages: updatedStages,
          };
        }
        return apr;
      }),
    );
    showToast("Approval authorized and recorded in immutable audit log.");
  };

  const handleReject = (id: string) => {
    setApprovals((prev) =>
      prev.map((apr) => (apr.id === id ? { ...apr, status: "rejected" } : apr)),
    );
    showToast("Request rejected. Associated workflow halted.");
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setSandboxStep(0);
    setSimulationLogs(["Initializing testing sandbox with sample payload...", "Validating security context & permissions..."]);

    const steps = builderWorkflow.nodes;
    steps.forEach((node, index) => {
      setTimeout(() => {
        setSandboxStep(index + 1);
        setSimulationLogs((prev) => [
          ...prev,
          `✓ Executed [${node.type.toUpperCase()}] "${node.title}" in ${Math.floor(Math.random() * 80 + 30)}ms`,
        ]);
        if (index === steps.length - 1) {
          setIsSimulating(false);
          setSimulationLogs((prev) => [
            ...prev,
            "🎉 Simulation completed successfully. Zero production state mutated.",
          ]);
        }
      }, (index + 1) * 650);
    });
  };

  // Helper icon renderer
  const renderNodeIcon = (iconName: string, className = "size-4") => {
    switch (iconName) {
      case "FilePlus":
        return <Plus className={className} />;
      case "AlertTriangle":
        return <AlertTriangle className={className} />;
      case "CheckCircle":
      case "CheckCircle2":
        return <CheckCircle2 className={className} />;
      case "XCircle":
        return <XCircle className={className} />;
      case "Clock":
        return <Clock className={className} />;
      case "Flame":
        return <Flame className={className} />;
      case "DollarSign":
      case "Coins":
        return <Coins className={className} />;
      case "CreditCard":
        return <CreditCard className={className} />;
      case "Target":
        return <Target className={className} />;
      case "Globe":
        return <Globe className={className} />;
      case "UserCheck":
        return <UserCheck className={className} />;
      case "Mail":
        return <Mail className={className} />;
      case "Sparkles":
        return <Sparkles className={className} />;
      case "BrainCircuit":
        return <BrainCircuit className={className} />;
      case "Copy":
        return <Copy className={className} />;
      case "Layers":
        return <Layers className={className} />;
      case "FolderGit2":
        return <FolderGit2 className={className} />;
      case "Building2":
        return <Building2 className={className} />;
      case "MessageSquare":
        return <MessageSquare className={className} />;
      case "GitBranch":
        return <GitBranch className={className} />;
      case "ShieldCheck":
        return <ShieldCheck className={className} />;
      case "Key":
        return <Lock className={className} />;
      case "Unplug":
        return <Unplug className={className} />;
      default:
        return <Zap className={className} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
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
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
                <Zap className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-[#111827]">Automation Center</h1>
                  <span className="text-xs font-semibold text-emerald-700">· Operational Brain</span>
                </div>
                <p className="text-xs text-[#667085]">
                  Automate your security operations, triage, integrations, and eliminate repetitive work.
                </p>
              </div>
            </div>
          </div>

          {/* Primary Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const emptyWorkflow: WorkflowItem = {
                  id: `wf-${Date.now()}`,
                  name: "New Security Workflow",
                  description: "Custom operational pipeline created from scratch.",
                  category: "triage",
                  status: "draft",
                  triggerEvent: "Report Submitted",
                  triggerCategory: "findings",
                  ownerName: "Sarah Chen",
                  lastRun: "Never",
                  avgRuntimeMs: 250,
                  executionCount: 0,
                  successRate: 100,
                  lastModified: "Just now",
                  version: "v1.0.0",
                  manualHoursSaved: 0,
                  tags: ["Custom"],
                  nodes: [
                    { id: "node-1", type: "trigger", title: "Report Submitted", subtitle: "Any incoming vulnerability report", iconName: "FilePlus", config: {} },
                    { id: "node-2", type: "ai", title: "AI Triage & Classification", subtitle: "Extract CWE and suggest priority", iconName: "Sparkles", config: {} },
                    { id: "node-3", type: "action", title: "Notify SecOps Channel", subtitle: "Broadcast to #sec-ops", iconName: "MessageSquare", config: {} },
                    { id: "node-4", type: "end", title: "Complete", subtitle: "Log execution", iconName: "CheckCircle2", config: {} },
                  ],
                };
                setWorkflows((prev) => [emptyWorkflow, ...prev]);
                setBuilderWorkflow(emptyWorkflow);
                setSelectedNodeId(emptyWorkflow.nodes[0].id);
                setActiveTab("builder");
                showToast("Created new workflow and opened Visual Builder.");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Create Workflow</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
            >
              <Sparkles className="size-3.5 text-purple-600" />
              <span>Browse Templates ({WORKFLOW_TEMPLATES.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
            >
              <History className="size-3.5 text-[#667085]" />
              <span>View Logs</span>
            </button>
          </div>
        </div>

        {/* Hero Metrics Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-5 border-t border-[#F2F4F7]">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Active Workflows</span>
            <div className="text-xl font-bold text-[#111827]">{activeCount}</div>
            <div className="text-[11px] text-emerald-600 font-semibold">{workflows.length} Total Configured</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Executions Today</span>
            <div className="text-xl font-bold text-blue-600">{AUTOMATION_ANALYTICS.heroMetrics.executionsToday}</div>
            <div className="text-[11px] text-[#667085]">+14% vs. yesterday</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Success Rate</span>
            <div className="text-xl font-bold text-emerald-600">{AUTOMATION_ANALYTICS.heroMetrics.successRate}%</div>
            <div className="text-[11px] text-[#667085]">99.2% 7-day average</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Failed Executions</span>
            <div className="text-xl font-bold text-rose-600">{AUTOMATION_ANALYTICS.heroMetrics.failedToday}</div>
            <div className="text-[11px] text-rose-600/80">Requires attention (1 OAuth)</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Average Runtime</span>
            <div className="text-xl font-bold text-[#111827]">{AUTOMATION_ANALYTICS.heroMetrics.avgRuntimeMs}ms</div>
            <div className="text-[11px] text-[#667085]">Async sub-second dispatch</div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-[#667085]">Manual Hours Saved</span>
            <div className="text-xl font-bold text-purple-600">{AUTOMATION_ANALYTICS.heroMetrics.manualHoursSavedTotal} hrs</div>
            <div className="text-[11px] text-purple-600/80">+{AUTOMATION_ANALYTICS.heroMetrics.hoursSavedThisMonth}h this month</div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E7EAF0] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "library", label: `Workflow Library (${workflows.length})`, icon: Layers },
          { id: "builder", label: "Workflow Builder", icon: GitBranch },
          { id: "triggers", label: `Triggers (${TRIGGER_CATALOG.length})`, icon: Zap },
          { id: "actions", label: `Actions & AI (${ACTION_CATALOG.length})`, icon: Sparkles },
          { id: "templates", label: `Templates (${WORKFLOW_TEMPLATES.length})`, icon: Sliders },
          { id: "history", label: "Execution History", icon: History },
          { id: "approvals", label: `Approvals (${approvals.filter((a) => a.status === "pending").length})`, icon: ShieldCheck },
          { id: "analytics", label: "Analytics", icon: Activity },
          { id: "variables", label: `Variables (${SYSTEM_VARIABLES.length})`, icon: Terminal },
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
      {/* TAB 1: OVERVIEW & DASHBOARD */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Dashboard Quick Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Active Workflows</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Play className="size-3.5 fill-current" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#111827]">{activeCount}</span>
                <span className="text-xs text-[#667085]">/ {workflows.length} total</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-2 border-t border-[#F2F4F7]">
                <span>{pausedCount} paused · {draftCount} draft</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("library")}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Today&apos;s Executions</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Activity className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#111827]">412</span>
                <span className="text-xs text-emerald-600 font-semibold">+18.4%</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-2 border-t border-[#F2F4F7]">
                <span>Avg latency 395ms</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Trends
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Pending Sign-Offs</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <ShieldCheck className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-600">
                  {approvals.filter((a) => a.status === "pending").length}
                </span>
                <span className="text-xs text-[#667085]">requiring review</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-2 border-t border-[#F2F4F7]">
                <span>1 high-value payout</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("approvals")}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Review
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">Manual Hours Saved</span>
                <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Clock className="size-3.5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-purple-700">289 hrs</span>
                <span className="text-xs text-[#667085]">lifetime</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#667085] pt-2 border-t border-[#F2F4F7]">
                <span>~3.6 FTE engineering time</span>
                <span className="font-semibold text-purple-600">ROI: High</span>
              </div>
            </div>
          </div>

          {/* Quick Workflow Launcher & Recent Executions */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: Featured Operational Workflows */}
            <div className="space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">High-Impact Workflows</h3>
                  <p className="text-xs text-[#667085]">Currently active pipelines handling vulnerability intake and alerting.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("library")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>View All ({workflows.length})</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>

              <div className="space-y-3">
                {workflows.slice(0, 3).map((wf) => (
                  <div
                    key={wf.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm transition-all hover:border-[#D0D5DD] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#111827]">{wf.name}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 text-[10px] font-bold",
                            wf.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {wf.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-[#475467] line-clamp-1">{wf.description}</p>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#667085]">
                        <span>Trigger: {wf.triggerEvent}</span>
                        <span>·</span>
                        <span>{wf.executionCount} runs</span>
                        <span>·</span>
                        <span>{wf.successRate}% success</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setBuilderWorkflow(wf);
                          setSelectedNodeId(wf.nodes[0]?.id || "node-1");
                          setActiveTab("builder");
                        }}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                      >
                        Open in Builder
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleWorkflowStatus(wf.id)}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors",
                          wf.status === "active"
                            ? "border border-slate-200 bg-white text-[#667085] hover:text-[#111827]"
                            : "bg-emerald-600 text-white hover:bg-emerald-700",
                        )}
                      >
                        {wf.status === "active" ? "Pause" : "Resume"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 1 Col: Live Execution Feed */}
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">Live Execution Stream</h3>
                  <p className="text-xs text-[#667085]">Real-time automation activity</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Listening</span>
                </div>
              </div>

              <div className="space-y-3">
                {executionLogs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    onClick={() => setSelectedExecution(log)}
                    className="group cursor-pointer rounded-lg border border-[#F2F4F7] p-3 transition-colors hover:border-[#D0D5DD] hover:bg-[#F9FAFB]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#111827] truncate group-hover:text-blue-600">
                          {log.workflowName}
                        </div>
                        <div className="text-[11px] text-[#667085] mt-0.5">
                          {log.triggerEvent} · {log.durationMs}ms
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold shrink-0",
                          log.status === "success"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700",
                        )}
                      >
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className="w-full rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] py-2 text-center text-xs font-semibold text-[#475467] hover:bg-[#F2F4F7]"
              >
                Inspect All Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: WORKFLOW LIBRARY */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "library" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "All Workflows" },
                { id: "active", label: `Active (${activeCount})` },
                { id: "paused", label: `Paused (${pausedCount})` },
                { id: "draft", label: `Draft (${draftCount})` },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                    statusFilter === st.id
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workflows, triggers, tags..."
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

          {/* Workflow Cards Grid */}
          <div className="space-y-3">
            {filteredWorkflows.map((wf) => (
              <div
                key={wf.id}
                className="group relative flex flex-col gap-4 rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm transition-all hover:border-[#D0D5DD] hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
              >
                {/* Left: Info & Pipeline Summary */}
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                      wf.status === "active" ? "bg-[#1E293B]" : "bg-slate-400",
                    )}
                  >
                    <Zap className="size-5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#111827]">{wf.name}</span>
                      <span className="text-xs font-mono text-[#98A2B3]">{wf.version}</span>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-bold",
                          wf.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : wf.status === "paused"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {wf.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-xs text-[#475467] line-clamp-1 leading-relaxed">{wf.description}</p>

                    {/* Metadata line */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
                      <span className="font-medium text-[#475467]">Trigger: {wf.triggerEvent}</span>
                      <span>·</span>
                      <span>Owner: {wf.ownerName}</span>
                      <span>·</span>
                      <span>Last run: {wf.lastRun}</span>
                      <span>·</span>
                      <span>Saved: {wf.manualHoursSaved}h</span>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {wf.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-[#F9FAFB] border border-[#E7EAF0] px-2 py-0.5 text-[10px] font-medium text-[#475467]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Telemetry & Actions */}
                <div className="flex shrink-0 flex-col items-start lg:items-end gap-2.5 border-t border-[#F2F4F7] pt-3 lg:border-t-0 lg:pt-0">
                  <div className="text-left lg:text-right text-xs">
                    <div className="font-semibold text-[#111827]">
                      {wf.executionCount.toLocaleString("en-US")} Executions · {wf.successRate}% Success
                    </div>
                    <div className="text-[11px] text-[#98A2B3] mt-0.5">
                      Avg runtime {wf.avgRuntimeMs}ms · Modified {wf.lastModified}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setBuilderWorkflow(wf);
                        setSelectedNodeId(wf.nodes[0]?.id || "node-1");
                        setActiveTab("builder");
                      }}
                      className="rounded-lg bg-blue-50 border border-blue-200/60 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <Edit3 className="size-3" />
                        <span>Edit Builder</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBuilderWorkflow(wf);
                        setIsSandboxOpen(true);
                      }}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB] transition-colors"
                      title="Run Dry Test"
                    >
                      <Play className="size-3 text-emerald-600 inline mr-1" />
                      <span>Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicateWorkflow(wf)}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2 py-1.5 text-xs text-[#667085] hover:text-[#111827] hover:bg-[#F9FAFB]"
                      title="Duplicate"
                    >
                      <Copy className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleWorkflowStatus(wf.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors",
                        wf.status === "active"
                          ? "border-slate-200 bg-white text-[#667085] hover:text-[#111827]"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                      )}
                    >
                      {wf.status === "active" ? "Pause" : "Resume"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteWorkflow(wf.id)}
                      className="rounded-lg border border-transparent px-2 py-1.5 text-xs text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: VISUAL WORKFLOW BUILDER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "builder" && (
        <div className="space-y-4">
          {/* Builder Top Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <GitBranch className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#111827]">{builderWorkflow.name}</h3>
                  <span className="text-xs text-[#98A2B3]">{builderWorkflow.version}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.2 text-[10px] font-bold",
                      builderWorkflow.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {builderWorkflow.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#667085]">Visual Drag-and-Drop Pipeline Editor · Zero Code Required</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSandboxOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Play className="size-3.5 fill-current" />
                <span>Test & Validate</span>
              </button>

              <button
                type="button"
                onClick={() => showToast("Workflow saved to draft repository.")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
              >
                <span>Save Draft</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setWorkflows((prev) =>
                    prev.map((w) => (w.id === builderWorkflow.id ? { ...w, status: "active", lastModified: "Just now" } : w)),
                  );
                  showToast(`Published "${builderWorkflow.name}" to production engine!`);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <Check className="size-3.5" />
                <span>Publish Workflow</span>
              </button>
            </div>
          </div>

          {/* Builder Canvas and Node Inspector */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Visual Canvas (8 cols) */}
            <div className="lg:col-span-8 rounded-2xl border border-[#E7EAF0] bg-[#F8FAFC] p-6 min-h-[580px] flex flex-col items-center justify-start space-y-4 relative">
              {/* Pipeline Nodes Flow */}
              <div className="w-full max-w-xl space-y-3">
                {builderWorkflow.nodes.map((node, index) => {
                  const isSelected = selectedNodeId === node.id;
                  const isLast = index === builderWorkflow.nodes.length - 1;

                  return (
                    <React.Fragment key={node.id}>
                      <div
                        onClick={() => setSelectedNodeId(node.id)}
                        className={cn(
                          "cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all relative group",
                          isSelected
                            ? "border-blue-600 ring-2 ring-blue-500/20 shadow-md"
                            : "border-[#E7EAF0] hover:border-[#D0D5DD] hover:shadow",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
                                node.type === "trigger"
                                  ? "bg-blue-600"
                                  : node.type === "ai"
                                  ? "bg-purple-600"
                                  : node.type === "condition"
                                  ? "bg-amber-600"
                                  : node.type === "approval"
                                  ? "bg-indigo-600"
                                  : node.type === "notification"
                                  ? "bg-sky-600"
                                  : node.type === "end"
                                  ? "bg-emerald-600"
                                  : "bg-slate-700",
                              )}
                            >
                              {renderNodeIcon(node.iconName)}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#98A2B3]">
                                  Step {index + 1} · {node.type}
                                </span>
                              </div>
                              <h4 className="font-bold text-sm text-[#111827]">{node.title}</h4>
                              <p className="text-xs text-[#667085] mt-0.5">{node.subtitle}</p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[11px] font-semibold text-blue-600 group-hover:underline">
                              Configure
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Connecting Line and Add Step Connector */}
                      {!isLast && (
                        <div className="flex flex-col items-center justify-center py-1">
                          <div className="h-5 w-0.5 bg-[#CBD5E1]" />
                          <button
                            type="button"
                            onClick={() => {
                              const newNode: WorkflowNode = {
                                id: `node-${Date.now()}`,
                                type: "action",
                                title: "Custom Action Step",
                                subtitle: "Execute security action",
                                iconName: "Zap",
                                config: {},
                              };
                              const updatedNodes = [...builderWorkflow.nodes];
                              updatedNodes.splice(index + 1, 0, newNode);
                              setBuilderWorkflow({ ...builderWorkflow, nodes: updatedNodes });
                              setSelectedNodeId(newNode.id);
                              showToast("Added new pipeline action step.");
                            }}
                            className="size-5 rounded-full border border-blue-400 bg-white text-blue-600 flex items-center justify-center hover:bg-blue-50 shadow-sm text-xs font-bold"
                            title="Insert Step"
                          >
                            +
                          </button>
                          <div className="h-5 w-0.5 bg-[#CBD5E1]" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step Config Inspector Sidebar (4 cols) */}
            <div className="lg:col-span-4 rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#111827]">Step Configuration</h4>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    ID: {selectedNodeId}
                  </span>
                </div>
                <p className="text-xs text-[#667085] mt-0.5">Customize parameters, criteria, and outputs.</p>
              </div>

              {/* Dynamic form based on active node */}
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-[#344054]">Step Title</label>
                  <input
                    type="text"
                    defaultValue={builderWorkflow.nodes.find((n) => n.id === selectedNodeId)?.title}
                    className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#111827] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#344054]">Execution Logic / Trigger Filter</label>
                  <select className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827] focus:border-blue-500 focus:outline-none">
                    <option>Matches Severity == &apos;CRITICAL&apos;</option>
                    <option>CVSS Score &gt;= 9.0</option>
                    <option>Program == &apos;Northwind Production Core&apos;</option>
                    <option>Asset Scope Tier == &apos;Tier 1&apos;</option>
                    <option>Always Execute (Unconditional)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#344054]">Target Service Provider</label>
                  <select className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#111827] focus:border-blue-500 focus:outline-none">
                    <option>Atlassian Jira Cloud (SEC)</option>
                    <option>Slack Enterprise (#sec-ops)</option>
                    <option>ServiceNow ITSM SIR</option>
                    <option>Com Olho AI Gemini-3.8-Flash</option>
                    <option>PagerDuty Emergency On-Call</option>
                    <option>Internal Webhook Bus</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#344054]">Variable Injection Template</label>
                  <div className="mt-1 rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] p-2.5 font-mono text-[11px] text-[#475467] space-y-1">
                    <div>Finding: &#123;&#123;report.title&#125;&#125;</div>
                    <div>Severity: &#123;&#123;report.severity&#125;&#125; (&#123;&#123;report.cvss_score&#125;&#125;)</div>
                    <div>Researcher: &#123;&#123;researcher.username&#125;&#125;</div>
                  </div>
                  <div className="mt-1 text-[11px] text-blue-600 font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab("variables")}>
                    Browse all dynamic variables →
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F2F4F7] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#475467]">Stop on error</span>
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#475467]">Record to immutable audit log</span>
                    <input type="checkbox" defaultChecked disabled className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => showToast("Step configuration updated.")}
                  className="w-full rounded-lg bg-blue-600 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Apply Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: TRIGGER CATALOG */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "triggers" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Security Operations Trigger Catalog</h3>
            <p className="text-xs text-[#667085]">
              Every event emitted across Com Olho programs, triage engines, and attack surface scanners.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TRIGGER_CATALOG.map((trig) => (
              <div
                key={trig.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3 transition-all hover:border-[#D0D5DD] hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm">
                      {renderNodeIcon(trig.iconName)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">{trig.name}</h4>
                      <span className="text-[11px] font-mono text-blue-600">{trig.eventKey}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#475467] leading-relaxed">{trig.description}</p>

                <div className="space-y-1 pt-2 border-t border-[#F2F4F7]">
                  <span className="text-[10px] font-bold uppercase text-[#98A2B3]">Payload Context:</span>
                  <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
                    {trig.samplePayloadFields.map((f) => (
                      <span key={f} className="rounded bg-[#F9FAFB] border border-[#E7EAF0] px-1.5 py-0.5 text-[#475467]">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: ACTION CATALOG & AI ACTIONS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "actions" && (
        <div className="space-y-6">
          {/* AI Section Banner */}
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50/70 via-white to-blue-50/50 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md shadow-purple-500/20">
                <Sparkles className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#111827]">AI Security Actions</h3>
                  <span className="text-xs font-semibold text-purple-700">· Powered by Com Olho AI Studio</span>
                </div>
                <p className="text-xs text-[#475467] leading-relaxed max-w-3xl">
                  Plug intelligence directly into triage loops. Summarize complex exploits, auto-recommend CVSS v4.0 metrics, detect duplicate findings using semantic vector clusters, and compose verified responses for researchers.
                </p>
              </div>
            </div>
          </div>

          {/* AI Actions Grid */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">Dedicated AI Actions</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ACTION_CATALOG.filter((a) => a.isAi).map((act) => (
                <div
                  key={act.id}
                  className="rounded-xl border border-purple-100 bg-white p-5 shadow-sm space-y-3 transition-all hover:border-purple-300 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-sm">
                      {renderNodeIcon(act.iconName)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">{act.name}</h4>
                      <span className="text-[11px] font-semibold text-purple-600">{act.provider}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#475467] leading-relaxed">{act.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Standard Integration & Ticketing Actions */}
          <div className="space-y-3 pt-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">
              Ticketing, SLA, Governance & Communication Actions
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ACTION_CATALOG.filter((a) => !a.isAi).map((act) => (
                <div
                  key={act.id}
                  className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3 transition-all hover:border-[#D0D5DD] hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-sm">
                      {renderNodeIcon(act.iconName)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">{act.name}</h4>
                      <span className="text-[11px] font-semibold text-[#667085]">{act.provider}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#475467] leading-relaxed">{act.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 6: WORKFLOW TEMPLATES (1-Click Install) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Production Security Templates</h3>
            <p className="text-xs text-[#667085]">
              Battle-tested workflows configured for immediate deployment across enterprise programs.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4 transition-all hover:border-[#D0D5DD] hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Sparkles className="size-5" />
                    </div>
                    {tpl.popular && (
                      <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        Popular
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-[#111827]">{tpl.name}</h4>
                    <p className="text-xs text-[#667085] mt-1 leading-relaxed">{tpl.description}</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[#F2F4F7] text-xs">
                    <div className="flex items-center justify-between text-[#667085]">
                      <span>Estimated Savings</span>
                      <span className="font-semibold text-purple-700">~{tpl.estimatedHoursSavedPerMonth} hrs/mo</span>
                    </div>
                    <div className="flex items-center justify-between text-[#667085]">
                      <span>Pipeline Nodes</span>
                      <span className="font-semibold text-[#111827]">{tpl.nodesCount} steps</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tpl.integrationsUsed.map((intg) => (
                        <span key={intg} className="rounded bg-[#F9FAFB] border border-[#E7EAF0] px-1.5 py-0.5 text-[10.5px] text-[#475467]">
                          {intg}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleInstallTemplate(tpl)}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  Install & Open Builder
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 7: EXECUTION HISTORY & FAILED TROUBLESHOOTING */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setExecutionFilter("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  executionFilter === "all" ? "bg-blue-600 text-white shadow-sm" : "bg-[#F9FAFB] text-[#475467] hover:bg-[#F2F4F7]",
                )}
              >
                All Executions ({executionLogs.length})
              </button>

              <button
                type="button"
                onClick={() => setExecutionFilter("failed")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  executionFilter === "failed" ? "bg-rose-600 text-white shadow-sm" : "bg-[#F9FAFB] text-rose-700 hover:bg-rose-50",
                )}
              >
                Failed Executions (1)
              </button>
            </div>

            <button
              type="button"
              onClick={() => showToast("Execution history refreshed from event bus.")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
            >
              <RefreshCw className="size-3.5" />
              <span>Refresh Log Feed</span>
            </button>
          </div>

          {/* Execution Log Table */}
          <div className="overflow-hidden rounded-xl border border-[#E7EAF0] bg-white shadow-sm">
            <div className="divide-y divide-[#F2F4F7]">
              {executionLogs
                .filter((log) => (executionFilter === "failed" ? log.status === "failed" : true))
                .map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#F9FAFB] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#111827]">{log.workflowName}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 text-[10px] font-bold",
                            log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                          )}
                        >
                          {log.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#667085]">
                        <span>Trigger: {log.triggerEvent}</span>
                        <span>·</span>
                        <span>Duration: {log.durationMs}ms</span>
                        <span>·</span>
                        <span>Started: {log.startedAt}</span>
                        <span>·</span>
                        <span>By: {log.executedBy}</span>
                      </div>

                      {log.failureReason && (
                        <div className="rounded-lg bg-rose-50 border border-rose-200/70 p-2.5 text-xs text-rose-800 space-y-1">
                          <div className="font-bold">Failure in step [{log.failedStep}]:</div>
                          <div>{log.failureReason}</div>
                          {log.suggestion && <div className="text-[11px] text-rose-700/80">Suggestion: {log.suggestion}</div>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {log.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => {
                            showToast(`Retrying execution ${log.id}... Dispatched.`);
                          }}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                        >
                          Retry Step
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedExecution(log)}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                      >
                        Inspect Payload & Logs
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 8: APPROVAL WORKFLOWS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Multi-Stage Governance Approval Chains</h3>
            <p className="text-xs text-[#667085]">
              Enforce authorization thresholds for high-dollar bounty releases, public disclosures, and scope updates.
            </p>
          </div>

          <div className="space-y-4">
            {approvals.map((apr) => (
              <div
                key={apr.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-[#111827]">{apr.title}</h4>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-bold",
                          apr.status === "approved"
                            ? "bg-emerald-50 text-emerald-700"
                            : apr.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700",
                        )}
                      >
                        {apr.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-[#667085] mt-1">
                      Finding: <span className="font-semibold text-[#111827]">{apr.findingTitle}</span> · Researcher: {apr.researcherName}
                    </p>
                  </div>

                  {apr.amount && (
                    <div className="text-right">
                      <span className="text-lg font-bold text-emerald-700">${apr.amount.toLocaleString("en-US")} {apr.currency}</span>
                      <div className="text-[11px] text-[#667085]">Bounty Payout Pool</div>
                    </div>
                  )}
                </div>

                {/* Multi-stage Progress Chain */}
                <div className="rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-3.5 space-y-3">
                  <span className="text-xs font-bold text-[#111827]">Approval Chain Lifecycle:</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {apr.stages.map((stage, idx) => (
                      <div
                        key={stage.role}
                        className={cn(
                          "rounded-lg border bg-white p-3 text-xs space-y-1",
                          stage.status === "approved"
                            ? "border-emerald-200"
                            : stage.status === "pending"
                            ? "border-amber-300 ring-1 ring-amber-300/30"
                            : "border-slate-200",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#111827]">Stage {idx + 1}: {stage.role}</span>
                          {stage.status === "approved" ? (
                            <CheckCircle2 className="size-3.5 text-emerald-600" />
                          ) : (
                            <Clock className="size-3.5 text-amber-600" />
                          )}
                        </div>
                        <div className="text-[#667085] text-[11px]">{stage.approverName}</div>
                        {stage.note && <div className="text-[10.5px] italic text-[#475467]">{stage.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons if pending */}
                {apr.status === "pending" && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F2F4F7]">
                    <button
                      type="button"
                      onClick={() => handleReject(apr.id)}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Reject Request
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApprove(apr.id, "Security Director")}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      Authorize & Sign-Off
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 9: ANALYTICS & INSIGHTS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Workflow Observability & Efficiency Analytics</h3>
            <p className="text-xs text-[#667085]">Quantitative telemetry measuring operational impact and engine health.</p>
          </div>

          {/* Trend Chart Mock (Executions per day) */}
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-[#111827]">14-Day Workflow Execution Volume</h4>
                <p className="text-xs text-[#667085]">Daily dispatched automated events</p>
              </div>
              <span className="text-xs font-bold text-blue-600">Total: 5,267 Executions</span>
            </div>

            {/* Visual Bar representation */}
            <div className="flex items-end justify-between gap-1.5 h-44 pt-6 pb-2">
              {AUTOMATION_ANALYTICS.executionsTrend.map((bar) => {
                const heightPct = Math.min(100, Math.round((bar.count / 500) * 100));
                return (
                  <div key={bar.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <div className="w-full flex items-end justify-center h-32">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full max-w-[28px] rounded-t bg-blue-600 group-hover:bg-blue-700 transition-all relative"
                      >
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-[#111827] px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                          {bar.count}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#98A2B3] font-medium">{bar.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-[#111827]">Top Workflows by Manual Hours Saved</h4>
              <div className="divide-y divide-[#F2F4F7]">
                {AUTOMATION_ANALYTICS.topWorkflowsByVolume.map((wf) => (
                  <div key={wf.name} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold text-[#111827] truncate">{wf.name}</div>
                      <div className="text-[11px] text-[#98A2B3]">{wf.runs} runs · {wf.successRate} success</div>
                    </div>
                    <span className="font-bold text-purple-700 shrink-0">{wf.hoursSaved} hrs saved</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-[#111827]">Integration Connector Utilization</h4>
              <div className="divide-y divide-[#F2F4F7]">
                {AUTOMATION_ANALYTICS.integrationUtilization.map((conn) => (
                  <div key={conn.name} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-[#111827]">{conn.name}</div>
                      <div className="text-[11px] text-[#98A2B3]">{conn.executions} dispatches today</div>
                    </div>
                    <span className="rounded bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                      {conn.health}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 10: VARIABLES CATALOG */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "variables" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">Dynamic System & Custom Variables</h3>
            <p className="text-xs text-[#667085]">
              Inject real-time report fields, researcher scores, and SLA clocks into notification messages and API payloads.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEM_VARIABLES.map((v) => (
              <div
                key={v.key}
                className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {v.key}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(v.key);
                      showToast(`Copied ${v.key} to clipboard!`);
                    }}
                    className="text-[#98A2B3] hover:text-[#111827] text-xs"
                    title="Copy Variable"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <div className="font-semibold text-xs text-[#111827]">{v.label}</div>
                <p className="text-[11.5px] text-[#667085] leading-relaxed">{v.description}</p>
                <div className="text-[11px] text-[#98A2B3] pt-1 border-t border-[#F2F4F7]">
                  Example: <span className="font-mono text-[#475467]">{v.exampleValue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TESTING SANDBOX MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isSandboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">Interactive Workflow Simulation Sandbox</h3>
                <p className="text-xs text-[#667085]">
                  Dry-run &quot;{builderWorkflow.name}&quot; with synthetic vulnerability telemetry.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSandboxOpen(false)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            {/* Test Payload Selector */}
            <div className="rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-3.5 space-y-2 text-xs">
              <span className="font-semibold text-[#111827]">Sample Synthetic Payload:</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>Report: <span className="font-mono text-blue-700">CO-1049 (Remote Code Execution)</span></div>
                <div>Severity: <span className="font-bold text-rose-700">CRITICAL (CVSS 9.8)</span></div>
                <div>Target: <span className="font-mono">api.northwindcloud.com</span></div>
                <div>Researcher: <span className="font-medium">0xCyberNinja (Rank #3)</span></div>
              </div>
            </div>

            {/* Live Terminal Output */}
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 font-mono text-xs text-slate-200 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5">
              <div className="text-slate-500 text-[11px]">=== Sandboxed Execution Container ===</div>
              {simulationLogs.map((log, i) => (
                <div key={i} className="text-emerald-400">
                  {log}
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-[#667085]">
                No live webhooks or tickets are created during sandbox testing.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSandboxOpen(false)}
                  className="rounded-lg border border-[#E7EAF0] px-3.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={isSimulating}
                  onClick={handleRunSimulation}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSimulating ? "Simulating..." : "Execute Dry Run"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXECUTION LOG DETAILS MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#111827]">{selectedExecution.workflowName}</h3>
                <p className="text-xs text-[#667085]">Execution ID: {selectedExecution.id} · {selectedExecution.startedAt}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExecution(null)}
                className="text-[#98A2B3] hover:text-[#111827]"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="font-bold text-[#111827]">Step Execution Trace:</div>
              <div className="divide-y divide-[#F2F4F7] rounded-xl border border-[#E7EAF0]">
                {selectedExecution.steps.map((st, i) => (
                  <div key={i} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#111827]">{st.name}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold",
                          st.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                        )}
                      >
                        {st.status.toUpperCase()} ({st.durationMs}ms)
                      </span>
                    </div>
                    <div className="text-[#667085] text-[11px]">Input: {st.inputSummary}</div>
                    <div className="text-[#475467] text-[11px] font-medium">Output: {st.outputSummary}</div>
                  </div>
                ))}
              </div>

              <div>
                <span className="font-bold text-[#111827]">Event JSON Payload:</span>
                <pre className="mt-1 rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-200 overflow-x-auto">
                  {JSON.stringify(selectedExecution.payloadSummary, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedExecution(null)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


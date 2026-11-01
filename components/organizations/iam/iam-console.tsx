"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Lock,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MoreVertical,
  ExternalLink,
  RefreshCw,
  Clock,
  Laptop,
  Smartphone,
  Globe,
  Plus,
  Copy,
  Check,
  Trash2,
  Edit3,
  LogOut,
  Send,
  Zap,
  Sliders,
  ChevronRight,
  ChevronDown,
  Layers,
  Building2,
  FileText,
  Mail,
  Fingerprint,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  MOCK_IAM_MEMBERS,
  MOCK_IAM_TEAMS,
  MOCK_PERMISSION_MATRIX,
  MOCK_PENDING_INVITATIONS,
  MOCK_ACCESS_REQUESTS,
  MOCK_IDENTITY_PROVIDERS,
  MOCK_SCIM_HEALTH,
  MOCK_API_CREDENTIALS,
  MOCK_SECURITY_SESSIONS,
  MOCK_IAM_TIMELINE,
  type IAMMember,
  type IAMTeam,
  type AccessRequestItem,
  type PendingInvitationItem,
  type APICredential,
  type SecuritySession,
} from "../../../lib/mock/iam-intelligence";
import type { OrganizationRole } from "../../../types/auth";

type IAMTab =
  | "workforce"
  | "teams"
  | "permissions"
  | "invites"
  | "idp"
  | "scim"
  | "api-tokens"
  | "sessions"
  | "timeline";

const ROLE_LABELS: Record<OrganizationRole, { label: string; badgeClass: string }> = {
  owner: { label: "Owner", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  security_admin: { label: "Security Admin", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  program_manager: { label: "Program Manager", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  triager: { label: "Triager", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  billing_admin: { label: "Billing Admin", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function IAMConsole({
  organizationId,
  organizationName,
  userRole,
}: {
  organizationId: string;
  organizationName: string;
  userRole?: OrganizationRole;
}) {
  const [activeTab, setActiveTab] = useState<IAMTab>("workforce");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [mfaFilter, setMfaFilter] = useState<string>("all");

  // Selected member for detail drawer
  const [selectedMember, setSelectedMember] = useState<IAMMember | null>(null);

  // Local state for actions
  const [members, setMembers] = useState<IAMMember[]>(MOCK_IAM_MEMBERS);
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>(MOCK_ACCESS_REQUESTS);
  const [invitations, setInvitations] = useState<PendingInvitationItem[]>(MOCK_PENDING_INVITATIONS);
  const [apiTokens, setApiTokens] = useState<APICredential[]>(MOCK_API_CREDENTIALS);
  const [sessions, setSessions] = useState<SecuritySession[]>(MOCK_SECURITY_SESSIONS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("triager");
  const [inviteTeam, setInviteTeam] = useState("Security Team");

  const notify = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    notify("Copied to clipboard");
  };

  const handleApproveRequest = (id: string) => {
    setAccessRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "approved" as const } : r)),
    );
    notify("Access request approved and role updated.");
  };

  const handleRejectRequest = (id: string) => {
    setAccessRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "rejected" as const } : r)),
    );
    notify("Access request rejected.");
  };

  const handleRevokeToken = (id: string) => {
    setApiTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "revoked" as const } : t)),
    );
    notify("API Token revoked immediately.");
  };

  const handleTerminateSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    notify("Security session terminated across all devices.");
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    const newInv: PendingInvitationItem = {
      id: `inv-${Date.now()}`,
      inviteeName: inviteEmail.split("@")[0],
      email: inviteEmail,
      invitedBy: "You (Admin)",
      sentDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      assignedRole: inviteRole,
      assignedTeam: inviteTeam,
      department: "Security Operations",
    };
    setInvitations([newInv, ...invitations]);
    setShowInviteModal(false);
    setInviteEmail("");
    notify(`Invitation dispatched to ${inviteEmail}`);
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      const matchesTeam = teamFilter === "all" || m.team === teamFilter;
      const matchesMfa =
        mfaFilter === "all" ||
        (mfaFilter === "enabled" && m.mfaEnabled) ||
        (mfaFilter === "disabled" && !m.mfaEnabled);

      return matchesSearch && matchesRole && matchesTeam && matchesMfa;
    });
  }, [members, searchQuery, roleFilter, teamFilter, mfaFilter]);

  // Metric aggregates
  const activeCount = members.filter((m) => m.status === "active").length;
  const adminCount = members.filter((m) => m.role === "owner" || m.role === "security_admin").length;
  const mfaCount = members.filter((m) => m.mfaEnabled).length;
  const mfaPercentage = Math.round((mfaCount / members.length) * 100);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* 1. IAM Hero Summary */}
      <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-b from-white to-[#F9FAFB] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Users className="size-4" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#111827]">
                Identity & Access Management (IAM)
              </h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                SCIM 2.0 Active
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                SSO Enforced
              </span>
            </div>
            <p className="text-sm text-[#475467] max-w-2xl">
              Enterprise governance workspace for {organizationName}. Manage directory workforce, role-based
              access controls (RBAC), program assignments, single sign-on, and credential lifecycles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <UserPlus className="size-3.5" />
              <span>Invite Member</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("teams")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Building2 className="size-3.5 text-[#667085]" />
              <span>Create Team</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("permissions")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Sliders className="size-3.5 text-[#667085]" />
              <span>Permission Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("idp")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Lock className="size-3.5 text-[#667085]" />
              <span>SSO Settings</span>
            </button>
          </div>
        </div>

        {/* 2. Team Health & Metrics Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Total Members</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{members.length}</span>
              <span className="text-[11px] font-semibold text-emerald-600">100% active</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">{activeCount} active directory users</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Administrators</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{adminCount}</span>
              <span className="text-[11px] font-semibold text-purple-600">Elevated</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Owners & Security Admins</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">MFA Adoption</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{mfaPercentage}%</span>
              <span className="text-[11px] font-semibold text-emerald-600">Enforced</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${mfaPercentage}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Pending Invites</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{invitations.length}</span>
              <span className="text-[11px] font-semibold text-amber-600">Awaiting</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Expires in 7 days</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Active Teams</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{MOCK_IAM_TEAMS.length}</span>
              <span className="text-[11px] font-semibold text-blue-600">Functional</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">RBAC program scopes</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Access Requests</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#111827]">{accessRequests.length}</span>
              <span className="text-[11px] font-semibold text-rose-600">Needs review</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Privilege escalations</div>
          </div>
        </div>
      </div>

      {/* Navigation Segmented Controls */}
      <div className="flex border-b border-[#E7EAF0] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("workforce")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "workforce"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Users className="size-4" />
          <span>Members Workspace ({members.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("teams")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "teams"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Building2 className="size-4" />
          <span>Organization Teams ({MOCK_IAM_TEAMS.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("permissions")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "permissions"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Sliders className="size-4" />
          <span>Permission Matrix</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("invites")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "invites"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Mail className="size-4" />
          <span>Invitations & Requests ({invitations.length + accessRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("idp")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "idp"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Lock className="size-4" />
          <span>Identity Providers</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scim")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "scim"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Zap className="size-4" />
          <span>SCIM 2.0</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("api-tokens")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "api-tokens"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <KeyRound className="size-4" />
          <span>API Credentials ({apiTokens.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sessions")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "sessions"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Fingerprint className="size-4" />
          <span>Security Sessions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "timeline"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Clock className="size-4" />
          <span>IAM Audit Log</span>
        </button>
      </div>

      {/* 3. Members Workspace Tab */}
      {activeTab === "workforce" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-1.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10">
              <Search className="size-4 text-[#98A2B3]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member by name, email, job title or department..."
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

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="all">All Roles</option>
                <option value="owner">Owners</option>
                <option value="security_admin">Security Admins</option>
                <option value="program_manager">Program Managers</option>
                <option value="triager">Triagers</option>
                <option value="billing_admin">Billing Admins</option>
              </select>

              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="all">All Teams</option>
                <option value="Security Team">Security Team</option>
                <option value="Cloud Team">Cloud Team</option>
                <option value="Red Team">Red Team</option>
                <option value="DevOps">DevOps</option>
                <option value="Finance">Finance</option>
              </select>

              <select
                value={mfaFilter}
                onChange={(e) => setMfaFilter(e.target.value)}
                className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="all">MFA Status</option>
                <option value="enabled">MFA Enforced</option>
                <option value="disabled">MFA Pending</option>
              </select>
            </div>
          </div>

          {/* Members Cards / Dense Rows */}
          <div className="space-y-2.5">
            {filteredMembers.map((member) => {
              const roleMeta = ROLE_LABELS[member.role];
              return (
                <div
                  key={member.id}
                  className="group relative flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm transition-all hover:border-[#D0D5DD] hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] font-bold text-xs text-white shadow-sm ring-1 ring-black/5">
                      {member.avatarSeed}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-[#111827]">{member.name}</span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            roleMeta.badgeClass,
                          )}
                        >
                          {roleMeta.label}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                          {member.team}
                        </span>
                        {member.status === "suspended" ? (
                          <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.2 text-[10px] font-semibold text-red-700">
                            Suspended
                          </span>
                        ) : member.status === "pending_mfa" ? (
                          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.2 text-[10px] font-semibold text-amber-700">
                            MFA Pending
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.2 text-[10px] font-semibold text-emerald-700">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#667085]">
                        <span className="font-mono text-[#475467]">{member.email}</span>
                        <span>•</span>
                        <span>{member.jobTitle}</span>
                        <span>•</span>
                        <span>{member.department}</span>
                      </div>
                    </div>
                  </div>

                  {/* Security Posture & Actions */}
                  <div className="flex flex-wrap items-center gap-4 border-t border-[#F2F4F7] pt-2 lg:border-t-0 lg:pt-0">
                    <div className="text-right text-xs">
                      <div className="flex items-center gap-1.5 justify-end">
                        {member.mfaEnabled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            <ShieldCheck className="size-3.5 text-emerald-600" />
                            {member.mfaType}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                            <ShieldAlert className="size-3.5 text-rose-500" />
                            No MFA Registered
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#98A2B3] mt-0.5">
                        Last login {member.lastLoginRelative} • {member.deviceTrust}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedMember(member)}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                      >
                        Details & Roles
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nextStatus = member.status === "suspended" ? "active" : "suspended";
                          setMembers((prev) =>
                            prev.map((m) => (m.id === member.id ? { ...m, status: nextStatus } : m)),
                          );
                          notify(
                            `${member.name} has been ${
                              nextStatus === "suspended" ? "suspended" : "reactivated"
                            }.`,
                          );
                        }}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2 py-1.5 text-xs font-medium text-[#667085] hover:text-[#111827]"
                        title={member.status === "suspended" ? "Reactivate user" : "Suspend user"}
                      >
                        {member.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Organization Teams Tab */}
      {activeTab === "teams" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Organization Teams & Workgroups</h3>
              <p className="text-xs text-[#667085]">
                Role-based access groups mapped directly to bug bounty programs and asset scopes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => notify("Team creation modal opened.")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>New Team</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MOCK_IAM_TEAMS.map((team) => (
              <div
                key={team.id}
                className="flex flex-col justify-between rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm transition-all hover:border-[#D0D5DD] hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200/50">
                        {team.tier}
                      </span>
                      <h4 className="mt-1 text-base font-bold text-[#111827]">{team.name}</h4>
                    </div>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-[#475467]">
                      <Building2 className="size-4" />
                    </span>
                  </div>

                  <p className="text-xs text-[#667085]">{team.description}</p>

                  <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-2.5 text-xs space-y-1.5">
                    <div className="flex justify-between text-[#475467]">
                      <span>Team Lead:</span>
                      <span className="font-semibold text-[#111827]">{team.ownerName}</span>
                    </div>
                    <div className="flex justify-between text-[#475467]">
                      <span>Members:</span>
                      <span className="font-semibold text-[#111827]">{team.membersCount} users</span>
                    </div>
                    <div className="flex justify-between text-[#475467]">
                      <span>Assets Owned:</span>
                      <span className="font-semibold text-[#111827]">{team.assetsManagedCount} assets</span>
                    </div>
                    <div className="flex justify-between text-[#475467]">
                      <span>Open Triage Queue:</span>
                      <span className="font-semibold text-amber-700">{team.openReportsCount} reports</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-[#667085]">Assigned Programs:</div>
                    <div className="flex flex-wrap gap-1">
                      {team.programs.map((p) => (
                        <span
                          key={p}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[#F2F4F7] pt-3 text-xs">
                  <span className="text-[11px] text-[#98A2B3]">Active {team.lastActivity}</span>
                  <button
                    type="button"
                    onClick={() => notify(`Opening governance settings for ${team.name}`)}
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Manage Team →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Permission Matrix Tab */}
      {activeTab === "permissions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Enterprise Role-Based Access Control Matrix</h3>
              <p className="text-xs text-[#667085]">
                Full breakdown of CRUD permissions across all 8 security operational domains.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E7EAF0] bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E7EAF0] bg-[#F9FAFB] text-[11px] font-semibold text-[#475467]">
                <tr>
                  <th className="py-3 px-4 min-w-[200px]">Resource Domain</th>
                  <th className="py-3 px-3">Owner</th>
                  <th className="py-3 px-3">Security Admin</th>
                  <th className="py-3 px-3">Program Manager</th>
                  <th className="py-3 px-3">Triager</th>
                  <th className="py-3 px-3">Billing Admin</th>
                  <th className="py-3 px-3">Viewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {MOCK_PERMISSION_MATRIX.map((row) => (
                  <tr key={row.category} className="hover:bg-[#F9FAFB]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#111827]">{row.category}</div>
                      <div className="text-[11px] text-[#98A2B3]">{row.description}</div>
                    </td>

                    {/* Owner */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.owner.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.owner.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.owner.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.owner.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.owner.notes}</div>
                    </td>

                    {/* Admin */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.admin.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.admin.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.admin.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.admin.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.admin.notes}</div>
                    </td>

                    {/* Manager */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.manager.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.manager.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.manager.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.manager.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.manager.notes}</div>
                    </td>

                    {/* Analyst */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.analyst.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.analyst.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.analyst.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.analyst.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.analyst.notes}</div>
                    </td>

                    {/* Finance */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.finance.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.finance.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.finance.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.finance.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.finance.notes}</div>
                    </td>

                    {/* Viewer */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.viewer.create && <span className="rounded bg-emerald-50 text-emerald-700 px-1 font-mono text-[10px]">C</span>}
                        {row.viewer.read && <span className="rounded bg-blue-50 text-blue-700 px-1 font-mono text-[10px]">R</span>}
                        {row.viewer.update && <span className="rounded bg-amber-50 text-amber-700 px-1 font-mono text-[10px]">U</span>}
                        {row.viewer.delete && <span className="rounded bg-rose-50 text-rose-700 px-1 font-mono text-[10px]">D</span>}
                      </div>
                      <div className="text-[10px] text-[#667085] mt-1">{row.viewer.notes}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Invitations & Access Requests Tab */}
      {activeTab === "invites" && (
        <div className="space-y-6">
          {/* Access Requests Queue */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111827]">
                  Privilege Elevation & Access Approval Queue
                </h3>
                <p className="text-xs text-[#667085]">
                  Active requests for elevated permissions, program scopes, and sensitive asset access.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {accessRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#111827]">{req.userName}</span>
                      <span className="text-xs text-[#667085]">({req.userEmail})</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold",
                          req.urgency === "High"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {req.urgency} Urgency
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#667085]">Requested:</span>
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {req.requestedRole}
                      </span>
                      <span className="text-[#667085]">Current: {req.currentRole}</span>
                    </div>

                    <p className="text-xs text-[#475467] bg-[#F9FAFB] p-2 rounded-lg border border-[#F2F4F7]">
                      <span className="font-semibold text-[#111827]">Business Justification:</span>{" "}
                      {req.businessReason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {req.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(req.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve Elevation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          req.status === "approved"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        )}
                      >
                        {req.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          <div className="space-y-3 pt-4 border-t border-[#E7EAF0]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Pending Workforce Invitations</h3>
                <p className="text-xs text-[#667085]">
                  Invitations waiting to be accepted. Cryptographically signed links expire after 7 days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
              >
                <Plus className="size-3.5" />
                <span>Invite New</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#111827]">{inv.inviteeName}</span>
                      <span className="text-xs font-mono text-[#667085]">{inv.email}</span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        {inv.assignedRole.replace("_", " ")}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        {inv.assignedTeam}
                      </span>
                    </div>
                    <div className="text-xs text-[#98A2B3]">
                      Sent by {inv.invitedBy} • Expiring {new Date(inv.expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(`https://unpatched.security/invite/${inv.id}`, inv.id)
                      }
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1 text-xs font-medium text-[#475467] hover:bg-[#F9FAFB]"
                    >
                      {copiedId === inv.id ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => notify(`Re-dispatched invitation to ${inv.email}`)}
                      className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1 text-xs font-medium text-[#475467] hover:bg-[#F9FAFB]"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
                        notify(`Invitation for ${inv.email} revoked.`);
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. Identity Providers (IdP) Tab */}
      {activeTab === "idp" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Single Sign-On (SSO) & Identity Federation</h3>
              <p className="text-xs text-[#667085]">
                Configure enterprise identity providers with SAML 2.0 and OpenID Connect (OIDC).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MOCK_IDENTITY_PROVIDERS.map((idp) => (
              <div
                key={idp.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-[#111827] font-bold">
                      <Lock className="size-5 text-blue-600" />
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827]">{idp.name}</h4>
                      <p className="text-xs text-[#667085]">{idp.protocol} • {idp.domain}</p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                      idp.status === "connected"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : idp.status === "configured"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {idp.status.toUpperCase()}
                  </span>
                </div>

                <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-[#475467]">
                    <span>Last Directory Sync:</span>
                    <span className="font-semibold text-[#111827]">{idp.lastSync}</span>
                  </div>
                  <div className="flex justify-between text-[#475467]">
                    <span>Users Synced:</span>
                    <span className="font-semibold text-[#111827]">{idp.usersSynced} members</span>
                  </div>
                  <div className="flex justify-between text-[#475467]">
                    <span>Groups Synced:</span>
                    <span className="font-semibold text-[#111827]">{idp.groupsSynced} security groups</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" />
                    Enforcing Hardware FIDO2
                  </span>
                  <button
                    type="button"
                    onClick={() => notify(`Opening configuration drawer for ${idp.name}`)}
                    className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                  >
                    Configure
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. SCIM Provisioning Tab */}
      {activeTab === "scim" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                  SCIM 2.0 Provisioning Active
                </span>
                <h3 className="mt-2 text-lg font-bold text-[#111827]">
                  Automated User & Group Provisioning
                </h3>
                <p className="text-xs text-[#667085]">
                  Changes made in your Identity Provider (Okta, Entra ID) reflect immediately in Unpatched.
                </p>
              </div>

              <button
                type="button"
                onClick={() => notify("Triggered manual SCIM synchronization reconciliation.")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <RefreshCw className="size-3.5" />
                <span>Re-sync Directory</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs">
                <span className="text-[#667085]">Provisioned Users</span>
                <div className="text-lg font-bold text-[#111827] mt-1">{MOCK_SCIM_HEALTH.usersManaged}</div>
              </div>
              <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs">
                <span className="text-[#667085]">Groups Mapped</span>
                <div className="text-lg font-bold text-[#111827] mt-1">{MOCK_SCIM_HEALTH.groupsSynced}</div>
              </div>
              <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs">
                <span className="text-[#667085]">Sync Latency</span>
                <div className="text-lg font-bold text-emerald-600 mt-1">{MOCK_SCIM_HEALTH.syncDurationSeconds}s</div>
              </div>
              <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs">
                <span className="text-[#667085]">Sync Failures</span>
                <div className="text-lg font-bold text-emerald-600 mt-1">0 errors</div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">SCIM 2.0 Base URL:</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={MOCK_SCIM_HEALTH.provisioningUrl}
                  className="w-full rounded-lg border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-2 font-mono text-xs text-[#344054] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(MOCK_SCIM_HEALTH.provisioningUrl, "scim-url")}
                  className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                >
                  {copiedId === "scim-url" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* SCIM Logs */}
            <div className="space-y-2 pt-3 border-t border-[#F2F4F7]">
              <span className="text-xs font-bold text-[#111827]">Recent SCIM Ingest Logs:</span>
              <div className="divide-y divide-[#F2F4F7] rounded-lg border border-[#E7EAF0]">
                {MOCK_SCIM_HEALTH.logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#111827] flex items-center gap-2">
                        <span>{log.action}</span>
                        <span className="font-normal text-[#667085]">({log.targetUser})</span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3]">{log.details}</div>
                    </div>
                    <span className="text-[11px] text-[#98A2B3]">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. API Credentials Tab */}
      {activeTab === "api-tokens" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Enterprise Service API Tokens</h3>
              <p className="text-xs text-[#667085]">
                Machine-to-machine credentials for CI/CD pipelines, SIEM ingest, and security bots. Raw keys are never stored in plaintext.
              </p>
            </div>
            <button
              type="button"
              onClick={() => notify("New token generation dialog opened.")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-3.5" />
              <span>Generate Service Token</span>
            </button>
          </div>

          <div className="space-y-3">
            {apiTokens.map((tok) => (
              <div
                key={tok.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#111827]">{tok.name}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.2 text-[10px] font-bold",
                        tok.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : tok.status === "expiring_soon"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-red-50 text-red-700 border border-red-200",
                      )}
                    >
                      {tok.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs text-[#667085]">
                    <span>Prefix: {tok.maskedPrefix}</span>
                    <span>•</span>
                    <span>Created by {tok.ownerName}</span>
                    <span>•</span>
                    <span>Last used {tok.lastUsedAt}</span>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-1">
                    {tok.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {tok.status !== "revoked" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => notify(`Token rotated: new secret dispatched to ${tok.ownerEmail}`)}
                        className="rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
                      >
                        Rotate Secret
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeToken(tok.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Revoke
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-[#98A2B3] italic">Revoked</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 11. Security Sessions Tab */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Active Authenticated Sessions</h3>
              <p className="text-xs text-[#667085]">
                Real-time inspection of authenticated client connections with geo-IP location and device posture.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSessions(sessions.filter((s) => s.isCurrentSession));
                notify("Terminated all remote user sessions.");
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Sign Out All Other Sessions
            </button>
          </div>

          <div className="space-y-2.5">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#111827]">{sess.userName}</span>
                    {sess.isCurrentSession && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 border border-blue-200/50">
                        Current Session
                      </span>
                    )}
                    <span className="text-xs text-[#667085]">({sess.userEmail})</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#667085]">
                    <span className="flex items-center gap-1">
                      <Globe className="size-3 text-[#98A2B3]" />
                      {sess.location} ({sess.ipAddress})
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Laptop className="size-3 text-[#98A2B3]" />
                      {sess.device} • {sess.browser} on {sess.os}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#98A2B3]">
                    Authenticated via <span className="font-semibold text-[#475467]">{sess.loginMethod}</span> •{" "}
                    {sess.mfaVerified ? "FIDO2 Enforced" : "MFA Bypassed"} • {sess.lastActive}
                  </div>
                </div>

                {!sess.isCurrentSession && (
                  <button
                    type="button"
                    onClick={() => handleTerminateSession(sess.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Terminate Session
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 12. Activity Timeline Tab */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Identity & Access Audit Log</h3>
            <p className="text-xs text-[#667085]">
              Immutable chronological record of privilege changes, authentication events, and directory synchronization.
            </p>
          </div>

          <div className="relative border-l border-[#E7EAF0] ml-3.5 space-y-5 py-2">
            {MOCK_IAM_TIMELINE.map((event) => (
              <div key={event.id} className="relative pl-6">
                <span className="absolute -left-1.5 top-1 size-3 rounded-full bg-blue-600 ring-4 ring-white" />
                <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111827]">{event.action}</span>
                    <span className="text-[11px] text-[#98A2B3]">{event.timestamp}</span>
                  </div>
                  <div className="text-xs text-[#475467]">
                    <span className="font-semibold text-[#111827]">{event.actor}</span> → {event.target}
                  </div>
                  <p className="text-xs text-[#667085]">{event.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member Details Drawer */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white p-6 shadow-2xl overflow-y-auto space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1E293B] text-white font-bold text-base shadow-sm">
                  {selectedMember.avatarSeed}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">{selectedMember.name}</h3>
                  <p className="text-xs text-[#667085]">{selectedMember.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-lg p-1 text-[#98A2B3] hover:text-[#111827]"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#667085]">Job Title:</span>
                <span className="font-semibold text-[#111827]">{selectedMember.jobTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Department:</span>
                <span className="font-semibold text-[#111827]">{selectedMember.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Assigned Team:</span>
                <span className="font-semibold text-[#111827]">{selectedMember.team}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Device Posture:</span>
                <span className="font-semibold text-[#111827]">{selectedMember.deviceTrust}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">MFA Enrollment:</span>
                <span className="font-semibold text-emerald-700">{selectedMember.mfaType}</span>
              </div>
            </div>

            {/* Role Assignment */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">Organization Role:</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["owner", "security_admin", "program_manager", "triager", "billing_admin"] as OrganizationRole[]).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setMembers((prev) =>
                          prev.map((m) =>
                            m.id === selectedMember.id ? { ...m, role: r } : m,
                          ),
                        );
                        setSelectedMember({ ...selectedMember, role: r });
                        notify(`Updated ${selectedMember.name}'s role to ${ROLE_LABELS[r].label}`);
                      }}
                      className={cn(
                        "rounded-xl border p-2.5 text-left text-xs transition-all",
                        selectedMember.role === r
                          ? "border-blue-500 bg-blue-50/70 text-blue-900 font-bold"
                          : "border-[#E7EAF0] bg-white text-[#344054] hover:bg-[#F9FAFB]",
                      )}
                    >
                      <div className="font-semibold">{ROLE_LABELS[r].label}</div>
                      <div className="text-[10px] text-[#667085]">
                        {r === "owner" ? "Full administrative authority" : "Scoped operational role"}
                      </div>
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Assigned Programs */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#111827]">Program Scopes:</span>
              <div className="space-y-1.5">
                {selectedMember.assignedPrograms.map((prog) => (
                  <div
                    key={prog}
                    className="flex items-center justify-between rounded-lg border border-[#E7EAF0] bg-white px-3 py-2 text-xs font-medium text-[#344054]"
                  >
                    <span>{prog}</span>
                    <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.2 text-[10px] font-bold">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="border-t border-[#E7EAF0] pt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  notify(`Reset all active sessions for ${selectedMember.name}`);
                  setSelectedMember(null);
                }}
                className="w-full rounded-xl border border-[#E7EAF0] bg-white py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
              >
                Reset All Active Sessions
              </button>
              <button
                type="button"
                onClick={() => {
                  setMembers((prev) => prev.filter((m) => m.id !== selectedMember.id));
                  notify(`Removed ${selectedMember.name} from organization.`);
                  setSelectedMember(null);
                }}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Remove from Organization
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Dialog */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Invite Organization Member</h3>
                <p className="text-xs text-[#667085]">
                  Issue a cryptographically signed invitation link with predetermined role and program scope.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="rounded-lg p-1 text-[#98A2B3] hover:text-[#111827]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#344054]">Work Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@comolho.io"
                  className="w-full rounded-lg border border-[#E7EAF0] px-3 py-2 text-xs text-[#111827] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#344054]">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrganizationRole)}
                  className="w-full rounded-lg border border-[#E7EAF0] bg-white px-3 py-2 text-xs text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="triager">Triager (Report processing & validation)</option>
                  <option value="program_manager">Program Manager (Engagement scope & policies)</option>
                  <option value="security_admin">Security Admin (Member & domain administration)</option>
                  <option value="billing_admin">Billing Admin (Disbursements & invoice access)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#344054]">Assigned Team</label>
                <select
                  value={inviteTeam}
                  onChange={(e) => setInviteTeam(e.target.value)}
                  className="w-full rounded-lg border border-[#E7EAF0] bg-white px-3 py-2 text-xs text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="Security Team">Security Team</option>
                  <option value="Cloud Team">Cloud Team</option>
                  <option value="Red Team">Red Team</option>
                  <option value="DevOps">DevOps</option>
                  <option value="Finance">Finance</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg border border-[#E7EAF0] px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Dispatch Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

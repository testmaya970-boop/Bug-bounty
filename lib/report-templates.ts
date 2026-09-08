import type { ReportWeaknessType } from "@/types/report";

/**
 * Report submission templates per weakness type -- docs/decisions/0070. Pure
 * presentation logic, deliberately not server-only, matching lib/report-weakness-labels.ts's
 * own pattern exactly. `descriptionScaffold` is a fill-in-the-blank structure inserted
 * into the Description field only when it is still empty; `impactPrompt` replaces the
 * Impact field's generic helper text with a weakness-specific question. Neither changes
 * any server-side validation -- a template-filled description is ordinary description
 * text once submitted, with no "came from a template" flag anywhere.
 */
export type ReportTemplate = { descriptionScaffold: string; impactPrompt: string };

const REPORT_TEMPLATES: Record<ReportWeaknessType, ReportTemplate> = {
  cross_site_scripting: {
    descriptionScaffold: "Vulnerable parameter or field:\n\nPayload used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nObserved behavior (where and how the payload executed):",
    impactPrompt: "What could an attacker do with this? (e.g. steal session cookies, perform actions as the victim, deface the page)",
  },
  sql_injection: {
    descriptionScaffold: "Vulnerable parameter or endpoint:\n\nInjection payload used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence the injection succeeded (error message, timing difference, or data returned that shouldn't have been):",
    impactPrompt: "What data could be read, modified, or deleted? Does this cross tenant/account boundaries?",
  },
  ssrf: {
    descriptionScaffold: "Vulnerable feature or endpoint (e.g. webhook URL, file import, PDF generator):\n\nTarget URL/address used to trigger the request:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence the server actually made the request (response content, timing, or an out-of-band callback received):",
    impactPrompt: "What internal service, metadata endpoint, or unauthenticated resource could be reached? Could you read the response?",
  },
  idor: {
    descriptionScaffold: "Endpoint and the identifier it accepts:\n\nYour account/object vs. the other account/object substituted:\n\nSteps to reproduce:\n1. Authenticate as account A.\n2. Request the endpoint using an identifier belonging to account B.\n3. \n\nEvidence you received account B's data:",
    impactPrompt: "What data or actions belonging to another user were you able to access? Read-only, or could you also modify/delete?",
  },
  broken_authentication: {
    descriptionScaffold: "Affected flow (login, password reset, session handling, MFA, etc.):\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence the authentication check was bypassed or weakened:",
    impactPrompt: "Whose account(s) could be accessed, and under what conditions (e.g. any account by email, or only accounts you already control)?",
  },
  broken_access_control: {
    descriptionScaffold: "Endpoint or action, and the role/permission it should require:\n\nRole/account you actually used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence the action succeeded despite insufficient privilege:",
    impactPrompt: "What privileged action or data becomes available to an under-privileged user?",
  },
  csrf: {
    descriptionScaffold: "Affected state-changing action (e.g. change email, transfer funds):\n\nProof-of-concept (an HTML form or link that triggers the action cross-origin):\n\nSteps to reproduce:\n1. Log in as the victim in one tab.\n2. Visit the attacker-controlled page in another tab.\n3. \n\nEvidence the action executed without the victim's explicit consent:",
    impactPrompt: "What action gets performed on the victim's behalf, and does it need any secret the attacker wouldn't already know?",
  },
  remote_code_execution: {
    descriptionScaffold: "Vulnerable endpoint or component:\n\nPayload/technique used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence of code execution (command output, a file written, an out-of-band callback):",
    impactPrompt: "What level of access does the executed code run with? Full system compromise, or a constrained sandbox/container?",
  },
  information_disclosure: {
    descriptionScaffold: "Where the information is exposed (endpoint, response header, error message, file path, etc.):\n\nSteps to reproduce:\n1. \n2. \n3. \n\nExact information disclosed (redact anything genuinely sensitive if sharing a real example):",
    impactPrompt: "What is disclosed, and how could it be used (e.g. to target further attacks, to identify other users, to bypass a control)?",
  },
  insecure_deserialization: {
    descriptionScaffold: "Affected endpoint or input (the deserialized data source):\n\nSerialization format and payload used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence of the resulting behavior (object injected, code executed, or application state altered):",
    impactPrompt: "What does successful deserialization let you do -- object injection, denial of service, or full remote code execution?",
  },
  security_misconfiguration: {
    descriptionScaffold: "Affected component or setting:\n\nExpected (secure) configuration vs. what was actually observed:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence of the misconfiguration:",
    impactPrompt: "What does this misconfiguration expose or enable on its own, independent of any other bug?",
  },
  injection_other: {
    descriptionScaffold: "Injection context (e.g. command injection, LDAP injection, template injection, XXE):\n\nVulnerable parameter and payload used:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence the injected content was interpreted rather than treated as plain data:",
    impactPrompt: "What does successful injection into this context let an attacker do?",
  },
  business_logic: {
    descriptionScaffold: "The business rule or assumption being violated:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nExpected behavior vs. actual behavior:",
    impactPrompt: "What real-world outcome does this produce (e.g. free goods, bypassed payment, an unfair advantage over other users)?",
  },
  denial_of_service: {
    descriptionScaffold: "Affected endpoint or resource:\n\nMethod used to exhaust it (request pattern, payload size, amplification technique):\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence of degraded or unavailable service (response times, error rate, resource exhaustion metrics):",
    impactPrompt: "How much load does this take to trigger, and does it affect only your own session or every user of the service?",
  },
  cryptographic_failure: {
    descriptionScaffold: "Affected component (token generation, encryption at rest/in transit, password hashing, etc.):\n\nWeakness observed (e.g. predictable token, weak algorithm, hardcoded key):\n\nSteps to reproduce:\n1. \n2. \n3. \n\nEvidence of the weakness (e.g. a forged/predicted value that was accepted):",
    impactPrompt: "What could be forged, decrypted, or predicted as a result, and what does that let an attacker do?",
  },
  other: {
    descriptionScaffold: "Affected component or endpoint:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nObserved behavior:",
    impactPrompt: "What can an attacker actually achieve as a result of this?",
  },
};

export function getReportTemplate(weaknessType: ReportWeaknessType): ReportTemplate {
  return REPORT_TEMPLATES[weaknessType];
}

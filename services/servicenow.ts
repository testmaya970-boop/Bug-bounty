export interface ServiceNowConnection {
  instanceUrl: string;
  username: string;
  tableName: "incident" | "sn_si_incident";
  assignmentGroup: string | null;
  lastError: string | null;
}

export interface ServiceNowLink {
  number: string;
  url: string | null;
  state: string;
}

export function servicenowWebhookUrl(organizationId: string): string {
  const origin = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${origin}/api/webhooks/servicenow/${organizationId}`;
}

export async function getServiceNowConnection(
  _organizationId: string,
): Promise<ServiceNowConnection | null> {
  return null;
}

export async function organizationHasServiceNow(
  organizationId: string,
): Promise<boolean> {
  const conn = await getServiceNowConnection(organizationId);
  return Boolean(conn);
}

export async function getReportServiceNowLink(
  _reportId: string,
): Promise<ServiceNowLink | null> {
  return null;
}

export async function saveServiceNowConnection(
  _organizationId: string,
  _input: {
    instanceUrl: string;
    username: string;
    password: string;
    tableName: "incident" | "sn_si_incident";
    assignmentGroup: string;
  },
): Promise<string> {
  return "";
}

export async function deleteServiceNowConnection(
  _organizationId: string,
): Promise<void> {}

export async function createServiceNowTicket(_reportId: string): Promise<void> {}

export async function servicenowCredentials(
  _organizationId: string,
): Promise<{ webhook_secret: string } | null> {
  return null;
}

export async function applyServiceNowState(
  _organizationId: string,
  _sysId: string,
  _closed: boolean,
): Promise<void> {}

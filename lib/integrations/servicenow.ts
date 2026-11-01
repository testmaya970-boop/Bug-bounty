import { timingSafeEqual } from "node:crypto";

export function verifyServiceNowToken(
  expectedSecret: string,
  tokenHeader: string | null,
): boolean {
  if (!tokenHeader) return false;
  const a = Buffer.from(expectedSecret, "utf8");
  const b = Buffer.from(tokenHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function businessRuleScript(webhookUrl: string): string {
  return `(function executeRule(current, previous /*null when async*/) {
  try {
    var r = new sn_ws.RESTMessageV2();
    r.setEndpoint(${JSON.stringify(webhookUrl)});
    r.setHttpMethod("POST");
    r.setRequestHeader("Content-Type", "application/json");
    r.setRequestHeader("X-Unpatched-Token", gs.getProperty("unpatched.webhook_token", ""));
    r.setRequestBody(JSON.stringify({
      sys_id: current.getUniqueValue(),
      state: current.getValue("state")
    }));
    r.executeAsync();
  } catch (ex) {
    gs.error("Unpatched webhook error: " + ex.message);
  }
})(current, previous);`;
}

import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { getAliasEmailConfig } from "@/lib/mailgun";

export type EmailAliasForward = { id: string; sender: string; subject: string | null; status: string; receivedAt: string };
export type MyEmailAlias = { enabled: boolean; address: string | null; recentForwards: EmailAliasForward[] };

/** The researcher's alias (if created) and its recent deliveries. `enabled` is false until
 * the alias domain and Mailgun are configured (lib/mailgun.ts). */
export async function getMyEmailAlias(): Promise<MyEmailAlias> {
  const config = getAliasEmailConfig();
  const actor = await getCurrentUser();
  let result;
  try {
    result = await withActorTransaction(actor?.id ?? null, async (client) => {
      const alias = await client.query<{ local_part: string }>("select local_part from public.researcher_email_aliases where user_id = $1", [actor?.id ?? null]);
      const forwards = await client.query<{ id: string; sender: string; subject: string | null; status: string; received_at: string }>(
        "select id, sender, subject, status, received_at from public.email_alias_forwards where user_id = $1 order by received_at desc limit 20",
        [actor?.id ?? null],
      );
      return { localPart: alias.rows[0]?.local_part ?? null, forwards: forwards.rows };
    });
  } catch (error) {
    mapError(error as { message: string });
  }
  return {
    enabled: config !== null,
    address: result.localPart && config ? `${result.localPart}@${config.domain}` : null,
    recentForwards: result.forwards.map((f) => ({ id: f.id, sender: f.sender, subject: f.subject, status: f.status, receivedAt: f.received_at })),
  };
}

export async function createMyEmailAlias(): Promise<string> {
  const config = getAliasEmailConfig();
  if (!config) throw new Error("Email aliases are not configured");
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ ensure_my_email_alias: string }>(client, "public.ensure_my_email_alias", []));
  } catch (error) {
    mapError(error as { message: string });
  }
  return `${rows[0].ensure_my_email_alias}@${config.domain}`;
}

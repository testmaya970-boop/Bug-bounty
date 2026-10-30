import { randomUUID } from "node:crypto";
import "./handlers"; // side-effect import: registers every known event handler
import { runForever } from "./worker";
import { runIntegrationLoops } from "../integrations/delivery";
import { runScheduledJobs } from "../scheduled/jobs";

/**
 * The standalone entrypoint: `npm run worker:outbox` (or several of them, in several
 * terminals/processes, to prove multi-worker safety). Never imported by `app/`,
 * `actions/`, or `services/` -- this is the one file whose job is to actually run
 * forever, polling the database. Configuration is via environment variables only, so
 * running two workers is just running this file twice, optionally with a distinct
 * `OUTBOX_WORKER_ID` for clearer logs (a random one is generated if omitted -- workers
 * never need to coordinate their own identities, only the database needs to tell them
 * apart, via `locked_by`).
 */
const workerId = process.env.OUTBOX_WORKER_ID ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 10);
const leaseSeconds = Number(process.env.OUTBOX_LEASE_SECONDS ?? 60);
const pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);

console.info(`[outbox-worker] starting as ${workerId} (batchSize=${batchSize}, leaseSeconds=${leaseSeconds}, pollIntervalMs=${pollIntervalMs})`);

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

// Webhook, Slack and Teams deliveries and the SLA breach scan run beside the outbox loop.
runIntegrationLoops({ signal: controller.signal, pollIntervalMs }).catch((error) => {
  console.error(`[integrations] ${workerId} delivery loop exited with a fatal error`, error);
  process.exitCode = 1;
});

// Scheduled analytics exports and the monthly Managed Triage renewal.
runScheduledJobs({ signal: controller.signal }).catch((error) => {
  console.error(`[scheduled] ${workerId} job loop exited with a fatal error`, error);
  process.exitCode = 1;
});

runForever({ workerId, batchSize, leaseSeconds, pollIntervalMs, signal: controller.signal }).catch((error) => {
  console.error(`[outbox-worker] ${workerId} exited with a fatal error`, error);
  process.exitCode = 1;
});

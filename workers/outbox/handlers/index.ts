import { registerHandler } from "../registry";
import { handleReportCreatedV1 } from "./report-created-v1";
import { createReportOutcomeHandler } from "./reputation/report-outcome";
import { handleBountyFinalizedV1 } from "./reputation/bounty-finalized-v1";
import { createBillingNotificationHandler, createProgramNotificationHandler, createNotificationHandler, createPaymentNotificationHandler, createPlatformNotificationHandler, createRecommendationHandler } from "./notifications/notification-handler";
import { handleJiraSync, JIRA_SYNC_EVENT_TYPES } from "./jira/jira-sync-handler";
import { handleIntegrationFanout, INTEGRATION_EVENT_TYPES } from "../../integrations/delivery";
import { handleCodeHostSync, CODE_HOST_SYNC_EVENT_TYPES } from "../../integrations/code-host-sync";
import { handleServiceNowSync, SERVICENOW_SYNC_EVENT_TYPES } from "../../integrations/servicenow-sync";

/** The complete handler registry for this slice. Importing this module (a side effect
 * import, `import "./handlers"`) is what makes each event_type:schema_version
 * dispatchable; nothing registers itself implicitly. Adding a real future consumer
 * (evidence/file events, researcher lifecycle events) means adding one more
 * `registerHandler` call here plus its own handler file -- never widening an existing
 * handler's payload assumptions to cover a second event type.
 *
 * Multiple independent consumers may (and, from this slice on, do) register against the
 * identical event_type:schema_version key -- see workers/outbox/registry.ts. Every
 * report-outcome/bounty.finalized key below now carries both a reputation consumer
 * (0016) and a notification consumer (0017), neither aware of the other. */
registerHandler("report.created", 1, handleReportCreatedV1);

// Reputation ledger consumers (docs/decisions/0016) -- five report-outcome fact types
// sharing one handler factory (identical payload shape, identical RPC), plus one
// distinct handler for bounty_finalized (a different source table to re-derive from).
registerHandler("report.resolved", 1, createReportOutcomeHandler("report_resolved"));
registerHandler("report.duplicate", 1, createReportOutcomeHandler("report_duplicate"));
registerHandler("report.informative", 1, createReportOutcomeHandler("report_informative"));
registerHandler("report.not_applicable", 1, createReportOutcomeHandler("report_not_applicable"));
registerHandler("report.rejected", 1, createReportOutcomeHandler("report_rejected"));
registerHandler("bounty.finalized", 1, handleBountyFinalizedV1);

// Notification routing + delivery consumers (docs/decisions/0017, extended by 0042 to
// cover needs_information) -- one shared factory for all eight notification-producing
// event types; recipient resolution and preference checks live in
// route_and_create_notifications (the migration), not here.
registerHandler("report.created", 1, createNotificationHandler("report_created"));
registerHandler("report.needs_information", 1, createNotificationHandler("report_needs_information"));
registerHandler("report.resolved", 1, createNotificationHandler("report_resolved"));
registerHandler("report.duplicate", 1, createNotificationHandler("report_duplicate"));
registerHandler("report.informative", 1, createNotificationHandler("report_informative"));
registerHandler("report.not_applicable", 1, createNotificationHandler("report_not_applicable"));
registerHandler("report.rejected", 1, createNotificationHandler("report_rejected"));
registerHandler("bounty.finalized", 1, createNotificationHandler("bounty_finalized"));

// Turn 8 -- closes the notification gap the Turn 5 outbox trace found. start_triage/
// accept_report/post_organization_message/post_researcher_message now all emit a real
// outbox event (db/migrations/202609090007_message_and_triage_notifications.sql); these
// three registrations are what makes that event actually produce a notification, reusing
// this exact same factory/pipeline unchanged.
registerHandler("report.triage_started", 1, createNotificationHandler("report_triage_started"));
registerHandler("report.accepted", 1, createNotificationHandler("report_accepted"));
registerHandler("report.message_posted", 1, createNotificationHandler("report_message_posted"));

// Platform decisions (db/migrations/202609250007_platform_notifications.sql): enqueued by
// an audit_logs trigger when a platform admin suspends/reinstates a program or an org.
registerHandler("program.suspended", 1, createPlatformNotificationHandler("program_suspended"));
registerHandler("program.reinstated", 1, createPlatformNotificationHandler("program_reinstated"));
registerHandler("organization.suspended", 1, createPlatformNotificationHandler("organization_suspended"));
registerHandler("organization.reinstated", 1, createPlatformNotificationHandler("organization_reinstated"));

// Payments and bounty changes (db/migrations/202610060008_payout_lifecycle.sql): enqueued by
// an audit_logs trigger; routed to the obligation's own recipient (submitter or collaborator),
// or for a mediation request to the organization.
registerHandler("payment.obligation_created", 1, createPaymentNotificationHandler("payment_scheduled"));
registerHandler("payment.succeeded", 1, createPaymentNotificationHandler("payment_succeeded"));
registerHandler("payment.failed", 1, createPaymentNotificationHandler("payment_failed"));
registerHandler("payment.cancelled", 1, createPaymentNotificationHandler("payment_cancelled"));
registerHandler("bounty.adjusted", 1, createPaymentNotificationHandler("bounty_adjusted"));
registerHandler("report.mediation_opened", 1, createPaymentNotificationHandler("report_mediation_opened"));

// Triage (db/migrations/202610060011_report_assignment_and_triage.sql), same audit-row router.
registerHandler("report.assigned", 1, createPaymentNotificationHandler("report_assigned"));
registerHandler("report.retest_requested", 1, createPaymentNotificationHandler("report_retest_requested"));
registerHandler("report.retest_decided", 1, createPaymentNotificationHandler("report_retest_decided"));
registerHandler("report.mediation_resolved", 1, createPaymentNotificationHandler("report_mediation_resolved"));
registerHandler("report.reopened", 1, createPaymentNotificationHandler("report_reopened"));

// Disclosure lifecycle (db/migrations/202610060012_disclosure_lifecycle.sql), same router.
registerHandler("report_disclosure.requested", 1, createPaymentNotificationHandler("report_disclosure_requested"));
registerHandler("report_disclosure.approved", 1, createPaymentNotificationHandler("report_disclosure_approved"));
registerHandler("report_disclosure.declined", 1, createPaymentNotificationHandler("report_disclosure_declined"));
registerHandler("report_disclosure.unpublished", 1, createPaymentNotificationHandler("report_disclosure_unpublished"));

// Jira outbound sync (db/migrations/202610010001_jira_integration.sql): one handler for
// every report event Jira should see -- a no-op for an org without a Jira connection.
// Billing (db/migrations/202610150002_payment_features.sql): enqueued by an audit_logs trigger.
registerHandler("billing.deposit_reported", 1, createBillingNotificationHandler("deposit_reported"));
registerHandler("billing.deposit_confirmed", 1, createBillingNotificationHandler("deposit_confirmed"));
registerHandler("billing.deposit_rejected", 1, createBillingNotificationHandler("deposit_rejected"));
registerHandler("billing.balance_low", 1, createBillingNotificationHandler("balance_low"));
registerHandler("billing.invoice_issued", 1, createBillingNotificationHandler("invoice_issued"));
// Managed Triage (202610290010): same billing-notice router.
registerHandler("managed_triage.requested", 1, createBillingNotificationHandler("managed_triage_requested"));
registerHandler("managed_triage.activated", 1, createBillingNotificationHandler("managed_triage_activated"));
registerHandler("managed_triage.declined", 1, createBillingNotificationHandler("managed_triage_declined"));
registerHandler("managed_triage.past_due", 1, createBillingNotificationHandler("managed_triage_past_due"));

// Program lifecycle, scope changes and launch decisions (202610160005): audit_logs trigger.
registerHandler("program.paused", 1, createProgramNotificationHandler("program_paused"));
registerHandler("program.resumed", 1, createProgramNotificationHandler("program_resumed"));
registerHandler("program.closed", 1, createProgramNotificationHandler("program_closed"));
registerHandler("scope.asset_added", 1, createProgramNotificationHandler("program_scope_changed"));
registerHandler("scope.asset_updated", 1, createProgramNotificationHandler("program_scope_changed"));
registerHandler("scope.asset_removed", 1, createProgramNotificationHandler("program_scope_changed"));
registerHandler("platform.program_launch_approved", 1, createProgramNotificationHandler("program_launch_approved"));
registerHandler("platform.program_launch_rejected", 1, createProgramNotificationHandler("program_launch_rejected"));

// Re-engagement (202610210005): a program became active and public.
registerHandler("program.published", 1, createRecommendationHandler());

for (const eventType of JIRA_SYNC_EVENT_TYPES) registerHandler(eventType, 1, handleJiraSync);

// Outbound webhooks and Slack / Teams alerts (202610290001): one fan-out consumer per event
// type, which only writes delivery rows; the delivery loop (workers/integrations) sends them.
for (const eventType of INTEGRATION_EVENT_TYPES) registerHandler(eventType, 1, handleIntegrationFanout);
// GitHub / GitLab (202610290004): close the linked issue when the report closes.
for (const eventType of CODE_HOST_SYNC_EVENT_TYPES) registerHandler(eventType, 1, handleCodeHostSync);
// ServiceNow (202610290005): a work note, and resolve the incident, when the report closes.
for (const eventType of SERVICENOW_SYNC_EVENT_TYPES) registerHandler(eventType, 1, handleServiceNowSync);

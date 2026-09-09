import { registerHandler } from "../registry";
import { handleReportCreatedV1 } from "./report-created-v1";
import { createReportOutcomeHandler } from "./reputation/report-outcome";
import { handleBountyFinalizedV1 } from "./reputation/bounty-finalized-v1";
import { createNotificationHandler } from "./notifications/notification-handler";

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

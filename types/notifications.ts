/**
 * Two categories, not four: `report_activity` (optional; report.created to the
 * organization side, and every terminal report-outcome event to the report's own
 * researcher) and `bounty_activity` (mandatory; bounty.finalized to the researcher --
 * treated like a payment receipt, not a promotional message). See
 * docs/decisions/0017-notification-routing-and-delivery-foundation.md for why
 * `triage_activity`/`researcher_activity` were considered and rejected for this slice.
 */
export type NotificationCategory = "report_activity" | "bounty_activity" | "platform_activity" | "billing_activity";

/** The specific fact a notification records. Distinct from `NotificationCategory` --
 * category is the preference-grouping; notification_type is the specific event.
 *
 * Turn 8 adds report_triage_started/report_accepted (single-recipient = the report's own
 * researcher, identical shape to report_resolved etc.) and report_message_posted
 * (actor-aware -- whoever did NOT post is the recipient; see
 * route_and_create_notifications's own handling in
 * db/migrations/202609090007_message_and_triage_notifications.sql). */
export type NotificationType =
  | "report_created"
  | "report_needs_information"
  | "report_resolved"
  | "report_duplicate"
  | "report_informative"
  | "report_not_applicable"
  | "report_rejected"
  | "bounty_finalized"
  | "report_triage_started"
  | "report_accepted"
  | "report_message_posted"
  // platform_activity (202609250007): a platform admin suspended/reinstated a program or
  // the organization itself. No report; org-level notices have no program either.
  | "program_suspended"
  | "program_reinstated"
  | "organization_suspended"
  | "organization_reinstated"
  // bounty_activity (202610060008): money owed to the recipient (submitter or collaborator)
  // changed -- never opt-out, like bounty_finalized.
  | "bounty_adjusted"
  | "payment_scheduled"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_cancelled"
  // report_activity, to the organization: the researcher opened a mediation request.
  | "report_mediation_opened"
  // report_activity, triage (202610060011): to the assignee, the organization (retest
  // requested), or the researcher (retest decided, mediation answered, report reopened).
  | "report_assigned"
  | "report_retest_requested"
  | "report_retest_decided"
  | "report_mediation_resolved"
  | "report_reopened"
  // report_activity, disclosure (202610060012): request -> triage team; outcomes -> researcher.
  | "report_disclosure_requested"
  | "report_disclosure_approved"
  | "report_disclosure_declined"
  | "report_disclosure_unpublished"
  // billing_activity (202610150002): no report or program. deposit_reported goes to platform
  // admins; the rest to the organization's owners, security admins and billing admins.
  | "deposit_reported"
  | "deposit_confirmed"
  | "deposit_rejected"
  | "balance_low"
  | "invoice_issued";

/**
 * The durable in-app record. Deliberately content-free beyond identifiers and the fact
 * itself -- no report title/description is denormalized here. Rendering a title (in-app
 * or in an email) always goes back through the authoritative, RLS-scoped report row, so a
 * recipient who later loses access to a report also loses the ability to see anything
 * about it beyond "you were notified," with no special-case code required.
 */
export type Notification = {
  id: string;
  category: NotificationCategory;
  notificationType: NotificationType;
  /** Null for platform_activity notices (about a program or organization, not a report). */
  reportId: string | null;
  /** Null for organization-level platform notices. */
  programId: string | null;
  organizationId: string;
  occurredAt: string;
  createdAt: string;
  readAt: string | null;
  /** Enrichment only, never the notification's authoritative content -- the program name
   * at the moment this list was rendered, resolved through the same RLS every other
   * program read already goes through. Null if the recipient's access to that program's
   * row has since changed (e.g. a since-suspended researcher's older notification) --
   * degrades gracefully rather than erroring, the same "historical access, reduced
   * detail" pattern used throughout the researcher program workspace. */
  programName: string | null;
};

/** The EFFECTIVE preference for one category -- already merged with its default server-
 * side (see get_my_notification_preferences). `isMandatory` categories have no toggle:
 * the UI should render them as always-on, not as a disabled control pretending to be one. */
export type NotificationPreference = {
  category: NotificationCategory;
  emailEnabled: boolean;
  isMandatory: boolean;
};

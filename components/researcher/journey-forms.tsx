"use client";

import React from "react";
import { Input, Select, Textarea, Checkbox } from "../ui/form";
import { JourneyForm } from "./journey-controls";
import {
  inviteCollaboratorAction,
  requestCveAction,
  reviewCveAction,
  recordCveAssignmentAction,
  proposeAcknowledgementAction,
  saveHackingEventAction,
  saveMentorProfileAction,
  requestMentorshipAction,
  respondMentorshipAction,
  requestSwagAction,
  saveSwagItemAction,
  updateSwagRequestAction,
} from "../../actions/researcher-journey";

const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const num = (d: FormData, k: string) => Number(str(d, k));
/** <input type="datetime-local"> is local wall-clock time; send an absolute instant. */
const instant = (d: FormData, k: string) => (str(d, k) ? new Date(str(d, k)).toISOString() : "");

export function InviteCollaboratorForm({ reportId }: { reportId: string }) {
  return (
    <JourneyForm
      submitLabel="Send invitation"
      success="Invitation sent. Their share counts once they accept."
      action={(d) => inviteCollaboratorAction({ reportId, username: str(d, "username"), splitPercent: num(d, "split"), message: str(d, "message") })}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Input name="username" label="Researcher's username" placeholder="jane-researcher" required maxLength={64} />
        <Input name="split" label="Their share (%)" type="number" min={0.01} max={99.99} step={0.01} required />
      </div>
      <Textarea name="message" label="Message" helperText="Optional. What they found or did." maxLength={500} />
    </JourneyForm>
  );
}

export function CveRequestForm({ reportId }: { reportId: string }) {
  return (
    <JourneyForm
      submitLabel="Request a CVE"
      success="Request sent to Unpatched for review."
      action={(d) => requestCveAction({ reportId, product: str(d, "product"), versions: str(d, "versions"), justification: str(d, "justification") })}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input name="product" label="Affected product" required maxLength={200} />
        <Input name="versions" label="Affected versions" placeholder="1.0 to 1.4" required maxLength={200} />
      </div>
      <Textarea name="justification" label="Why it warrants a CVE" helperText="Who is affected beyond this organization (shipped software, libraries, devices). 30 characters or more." required maxLength={4000} />
    </JourneyForm>
  );
}

export function CveReviewForm({ requestId, status }: { requestId: string; status: "pending" | "approved" }) {
  if (status === "approved") {
    return (
      <JourneyForm
        submitLabel="Record assigned CVE"
        action={(d) => recordCveAssignmentAction({ requestId, cveId: str(d, "cveId"), evidenceUrl: str(d, "evidenceUrl") })}
      >
        <p className="text-xs text-ink-muted">Only once a CVE Numbering Authority has issued the identifier. Link its public record.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input name="cveId" label="CVE identifier" placeholder="CVE-2026-12345" required />
          <Input name="evidenceUrl" label="Public record" type="url" placeholder="https://www.cve.org/CVERecord?id=..." required />
        </div>
      </JourneyForm>
    );
  }
  return (
    <JourneyForm submitLabel="Save decision" action={(d) => reviewCveAction({ requestId, decision: str(d, "decision") as "approved" | "rejected", note: str(d, "note") })}>
      <Select name="decision" label="Decision" defaultValue="approved">
        <option value="approved">Approve: Unpatched will request it from a CNA</option>
        <option value="rejected">Reject</option>
      </Select>
      <Textarea name="note" label="Note to the researcher" helperText="Required when rejecting." maxLength={2000} />
    </JourneyForm>
  );
}

export function ProposeAcknowledgementForm({ reportId }: { reportId: string }) {
  return (
    <JourneyForm
      submitLabel="Offer Hall of Fame credit"
      success="Offered. It goes public only if the researcher agrees."
      action={(d) => proposeAcknowledgementAction(reportId, str(d, "note"))}
    >
      <Input name="note" label="Public thank-you message" helperText="Optional, shown next to their name. No details of the finding." maxLength={280} />
    </JourneyForm>
  );
}

export function HackingEventForm() {
  return (
    <JourneyForm
      submitLabel="Create draft event"
      success="Draft saved. Publish it when it is ready."
      action={(d) =>
        saveHackingEventAction({
          id: null,
          title: str(d, "title"),
          description: str(d, "description"),
          format: str(d, "format") as "online" | "in_person" | "hybrid",
          location: str(d, "location"),
          startsAt: instant(d, "startsAt"),
          endsAt: instant(d, "endsAt"),
          registrationClosesAt: instant(d, "closesAt"),
          capacity: str(d, "capacity") ? num(d, "capacity") : null,
          minReputation: str(d, "minReputation") ? num(d, "minReputation") : 0,
        })
      }
    >
      <Input name="title" label="Title" required maxLength={140} />
      <Textarea name="description" label="Description" required maxLength={4000} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select name="format" label="Format" defaultValue="online">
          <option value="online">Online</option>
          <option value="in_person">In person</option>
          <option value="hybrid">Hybrid</option>
        </Select>
        <Input name="location" label="Location" helperText="Required unless online." maxLength={200} />
        <Input name="startsAt" label="Starts" type="datetime-local" required />
        <Input name="endsAt" label="Ends" type="datetime-local" required />
        <Input name="closesAt" label="Registration closes" type="datetime-local" required />
        <Input name="capacity" label="Places" type="number" min={1} helperText="Empty for no limit." />
        <Input name="minReputation" label="Minimum reputation" type="number" min={0} defaultValue={0} />
      </div>
    </JourneyForm>
  );
}

export function MentorProfileForm({ initial }: { initial: { headline: string; topics: string[]; accepting: boolean; maxActive: number } | null }) {
  return (
    <JourneyForm
      submitLabel={initial ? "Update mentor profile" : "Become a mentor"}
      success="Saved."
      resetOnSuccess={false}
      action={(d) =>
        saveMentorProfileAction({
          headline: str(d, "headline"),
          topics: str(d, "topics").split(",").map((t) => t.trim()).filter(Boolean),
          accepting: d.get("accepting") === "on",
          maxActive: num(d, "maxActive"),
        })
      }
    >
      <Input name="headline" label="Headline" placeholder="Web app and API testing, IDOR and auth bugs" defaultValue={initial?.headline} required maxLength={140} />
      <Input name="topics" label="Topics" helperText="Comma separated, up to 8." defaultValue={initial?.topics.join(", ")} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input name="maxActive" label="Mentees at a time" type="number" min={1} max={20} defaultValue={initial?.maxActive ?? 3} />
        <Checkbox name="accepting" label="Accepting new requests" defaultChecked={initial?.accepting ?? true} />
      </div>
    </JourneyForm>
  );
}

export function MentorshipRequestForm({ mentorId, topics }: { mentorId: string; topics: string[] }) {
  return (
    <JourneyForm submitLabel="Ask for mentorship" success="Request sent." action={(d) => requestMentorshipAction({ mentorId, topic: str(d, "topic"), message: str(d, "message") })}>
      <Select name="topic" label="Topic" defaultValue={topics[0]}>
        {topics.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <Textarea name="message" label="What you want help with" helperText="20 characters or more." required maxLength={2000} />
    </JourneyForm>
  );
}

export function MentorshipRespondForm({ requestId }: { requestId: string }) {
  return (
    <JourneyForm submitLabel="Accept" action={(d) => respondMentorshipAction(requestId, true, str(d, "note"))}>
      <Textarea name="note" label="How and when you will meet" helperText="Only this mentee sees it." required maxLength={1000} />
    </JourneyForm>
  );
}

export function SwagRequestForm({ itemId }: { itemId: string }) {
  return (
    <JourneyForm submitLabel="Request" success="Requested. Staff review every request." action={(d) => requestSwagAction({ itemId, shippingName: str(d, "name"), shippingAddress: str(d, "address") })}>
      <Input name="name" label="Name for delivery" autoComplete="name" required maxLength={120} />
      <Textarea name="address" label="Delivery address" autoComplete="street-address" helperText="Only you and Unpatched staff can see it." required maxLength={600} />
    </JourneyForm>
  );
}

export function SwagItemForm() {
  return (
    <JourneyForm
      submitLabel="Add item"
      action={(d) => saveSwagItemAction({ id: null, name: str(d, "name"), description: str(d, "description"), minReputation: num(d, "minReputation"), stock: num(d, "stock"), active: true })}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input name="name" label="Name" required maxLength={100} />
        <Input name="stock" label="Stock on hand" type="number" min={0} required />
        <Input name="minReputation" label="Minimum reputation" type="number" min={0} defaultValue={0} />
      </div>
      <Textarea name="description" label="Description" required maxLength={1000} />
    </JourneyForm>
  );
}

export function SwagStaffUpdateForm({ requestId, status }: { requestId: string; status: "requested" | "approved" }) {
  return (
    <JourneyForm
      submitLabel="Update"
      className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
      action={(d) => updateSwagRequestAction({ requestId, status: str(d, "status") as "approved" | "shipped" | "rejected", note: str(d, "note"), tracking: str(d, "tracking") })}
    >
      <Select name="status" label="Move to" defaultValue={status === "requested" ? "approved" : "shipped"}>
        {status === "requested" ? <option value="approved">Approved</option> : <option value="shipped">Shipped</option>}
        <option value="rejected">Rejected</option>
      </Select>
      <Input name="note" label="Note" maxLength={500} />
      <Input name="tracking" label="Tracking" maxLength={120} />
    </JourneyForm>
  );
}

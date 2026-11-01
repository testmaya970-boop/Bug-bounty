"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createCtfEvent, updateCtfEvent, setCtfEventChallenges } from "@/services/ctf-events";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRequestLogging } from "@/lib/request-context";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

// Authorization is enforced by the database (each RPC's own private.is_platform_admin()
// check). These actions require a session so an anonymous request fails fast with a clear
// message, and validate input shape before the round trip -- they never re-implement the
// admin gate. Same posture as actions/platform-operations.ts.

const eventStatus = z.enum(["draft", "scheduled", "active", "ended"]);
const isoDate = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time.");

const createSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase words separated by hyphens."),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).optional().default(""),
    startsAt: isoDate,
    endsAt: isoDate,
    status: eventStatus.default("scheduled"),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: "End must be after start.", path: ["endsAt"] });

export async function createCtfEventAction(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const data = await withRequestLogging("platform.ctf_event.create", { actorId: user.id }, () =>
      createCtfEvent({ slug: parsed.data.slug, name: parsed.data.name, description: parsed.data.description, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, status: parsed.data.status }),
    );
    revalidatePath("/platform/ctf-events");
    revalidatePath("/ctf/events");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const updateSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).optional().default(""),
    startsAt: isoDate,
    endsAt: isoDate,
    status: eventStatus,
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: "End must be after start.", path: ["endsAt"] });

export async function updateCtfEventAction(input: z.input<typeof updateSchema>): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const data = await withRequestLogging("platform.ctf_event.update", { actorId: user.id }, () =>
      updateCtfEvent({ eventId: parsed.data.eventId, name: parsed.data.name, description: parsed.data.description, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, status: parsed.data.status }),
    );
    revalidatePath("/platform/ctf-events");
    revalidatePath(`/platform/ctf-events/${parsed.data.eventId}`);
    revalidatePath("/ctf/events");
    revalidatePath(`/ctf/events/${data.slug}`);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const setChallengesSchema = z.object({
  eventId: z.string().uuid(),
  challengeIds: z.array(z.string().min(1)).max(200),
});

export async function setCtfEventChallengesAction(input: z.input<typeof setChallengesSchema>): Promise<ActionResult<{ count: number }>> {
  const parsed = setChallengesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const count = await withRequestLogging("platform.ctf_event.set_challenges", { actorId: user.id }, () => setCtfEventChallenges(parsed.data.eventId, parsed.data.challengeIds));
    revalidatePath(`/platform/ctf-events/${parsed.data.eventId}`);
    revalidatePath("/ctf/events");
    return { ok: true, data: { count } };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

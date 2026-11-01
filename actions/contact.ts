"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { CONTACT_TOPICS, markContactRequestHandled, submitContactRequest, type ContactTopic } from "@/services/contact-requests";
import { isBusinessEmail } from "@/lib/auth/business-email";
import { verifyCaptcha } from "@/lib/integrations/captcha";

type Result = { ok: true } | { ok: false; field?: "name" | "email" | "company" | "website" | "message"; message: string };

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().max(254).email("Enter a valid work email."),
  company: z.string().trim().min(1, "Enter your company.").max(160),
  website: z.union([z.literal(""), z.string().trim().max(300).regex(/^https?:\/\/[^\s/]+\.[^\s]+$/i, "Enter a full URL like https://example.com.")]),
  topic: z.enum(Object.keys(CONTACT_TOPICS) as [ContactTopic, ...ContactTopic[]]),
  message: z.string().trim().min(20, "Tell us a little more (20 characters or more).").max(4000),
  // Honeypot: hidden from people, filled by naive bots.
  fax: z.string().max(200).optional(),
  captchaToken: z.string().max(4096).optional(),
});

export async function submitContactRequestAction(input: z.input<typeof schema>): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, field: issue?.path[0] as Extract<Result, { ok: false }>["field"], message: issue?.message ?? "Check the form and try again." };
  }
  const { fax, captchaToken, ...data } = parsed.data;
  // A filled honeypot gets the same success a person sees, so a bot learns nothing.
  if (fax) return { ok: true };
  if (!isBusinessEmail(data.email)) return { ok: false, field: "email", message: "Use your work email so we know which organization you are with." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? null;
  if (!(await verifyCaptcha(captchaToken, ip))) return { ok: false, message: "Complete the human check, then try again." };

  try {
    await submitContactRequest(data, createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 32));
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/platform/contact-requests");
  return { ok: true };
}

export async function markContactRequestHandledAction(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Check the request and try again." };
  try {
    await markContactRequestHandled(id);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/platform/contact-requests");
  return { ok: true };
}

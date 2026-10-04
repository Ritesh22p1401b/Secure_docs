import { z } from "zod";

// Shared by server (authoritative) and client (UX only). Never trust client-side checks.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Consistent normalisation before every lookup/insert: NFKC, trimmed, lower-cased. */
export const emailSchema = z
  .string()
  .transform((v) => v.normalize("NFKC").trim().toLowerCase())
  .pipe(z.email("Enter a valid email address.").max(254));

export const signupSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters.`),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Length-capped to bound Argon2 work; min not enforced so legacy policies cannot lock users out.
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const documentIdSchema = z.uuid();

export const SORT_OPTIONS = ["newest", "oldest", "name"] as const;

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  sort: z.enum(SORT_OPTIONS).default("newest"),
  scope: z.enum(["owned", "shared"]).default("owned"),
});

export const shareCreateSchema = z.object({
  /** The recipient's login email (the account identifier). */
  email: emailSchema,
});

export const shareIdSchema = z.uuid();

/** Client-reported viewer events (deterrent telemetry only — never trusted for access decisions). */
export const VIEWER_EVENTS = ["focus_lost", "print_screen", "capture_shortcut"] as const;
export type ViewerEvent = (typeof VIEWER_EVENTS)[number];

export const viewerEventSchema = z.object({
  type: z.enum(VIEWER_EVENTS),
});

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const uploadInitSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});

export const uploadCompleteSchema = z.object({
  uploadId: z.uuid(),
});

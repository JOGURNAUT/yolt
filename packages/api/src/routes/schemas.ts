import { z } from "@hono/zod-openapi";

/** Response and request helpers shared by the newer route files. */
export const ErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() }).openapi("ApiError");
export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
export const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });
export const Err = (description: string) => json(ErrorSchema, description);
/** Card lists reuse the core `SearchHit` shape, which carries Dates; described loosely here like the other card routes. */
export const Cards = z.any();
export const Ok = z.object({ ok: z.literal(true) });
export const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

export const SIGN_IN_REQUIRED = { error: "SIGN_IN_REQUIRED" } as const;

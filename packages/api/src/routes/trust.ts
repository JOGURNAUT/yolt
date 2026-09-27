import { randomBytes } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createReview, MAX_REVIEW_PHOTOS, openClaim, withdrawClaim } from "@yolt/core";
import type { Db } from "@yolt/db";
import type { AuthVariables } from "../auth";
import { InvalidImageError, MAX_UPLOAD_BYTES, processPhoto } from "../media/process";
import type { MediaStorage } from "../media/storage";

const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

/** Buyer-side trust routes: evidence photos, protection claims, reviews. */
export function trustRoutes(deps: { db: Db; media: MediaStorage }) {
  const { db, media } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });
  // No app.use("*") here: this app is mounted at "/", where a catch-all middleware would leak
  // onto every route registered after it (cron, webhooks). Each handler checks the session.
  const userId = (c: { get: (k: "session") => AuthVariables["session"] }) => c.get("session")?.userId ?? null;
  const signIn = { error: "SIGN_IN_REQUIRED" } as const;

  /** Only photos this user uploaded through YOLT count as evidence — no arbitrary links. */
  const ownPhotos = (uid: string, urls: string[]) => {
    const prefix = media.publicUrl(`evidence/${uid}/`);
    return urls.every((u) => u.startsWith(prefix) && /^[a-z0-9/:._-]+$/i.test(u));
  };

  app.post("/uploads/evidence", async (c) => {
    const uid = userId(c);
    if (!uid) return c.json(signIn, 401);
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) return c.json({ error: "PHOTO_TOO_LARGE" }, 413);
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) return c.json({ error: "INVALID_REQUEST" }, 400);
    let processed;
    try {
      processed = await processPhoto(new Uint8Array(await file.arrayBuffer())); // strips EXIF/GPS
    } catch (err) {
      if (err instanceof InvalidImageError) return c.json({ error: "INVALID_IMAGE", details: err.message }, 400);
      throw err;
    }
    const key = `evidence/${uid}/${randomBytes(12).toString("hex")}.webp`;
    await media.put(key, processed.data, processed.contentType);
    return c.json({ url: media.publicUrl(key) }, 201);
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/claim",
      summary: "Report a problem: not as described, damaged, wrong item, or not received",
      request: {
        params: IdParam,
        body: {
          content: {
            "application/json": {
              schema: z.object({
                reason: z.enum(["NOT_AS_DESCRIBED", "DAMAGED", "WRONG_ITEM", "NOT_RECEIVED"]),
                description: z.string().trim().min(10).max(1000),
                photoUrls: z.array(z.string().max(500)).max(6).default([]),
              }),
            },
          },
        },
      },
      responses: { 201: Any, 400: Any, 401: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const uid = userId(c);
      if (!uid) return c.json(signIn, 401);
      const body = c.req.valid("json");
      if (!ownPhotos(uid, body.photoUrls)) return c.json({ error: "INVALID_PHOTOS" }, 400);
      const r = await openClaim(db, { buyerId: uid, orderId: c.req.valid("param").id, ...body });
      if (r.ok) return c.json({ claimId: r.claimId }, 201);
      if (r.reason === "NOT_FOUND") return c.json({ error: r.reason }, 404);
      if (r.reason === "EVIDENCE_REQUIRED") return c.json({ error: r.reason }, 400);
      return c.json({ error: r.reason }, 409);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/claims/{id}/withdraw", summary: "Withdraw an unresolved claim", request: { params: IdParam }, responses: { 200: Any, 401: Any, 409: Any } }),
    async (c) => {
      const uid = userId(c);
      if (!uid) return c.json(signIn, 401);
      const r = await withdrawClaim(db, { buyerId: uid, claimId: c.req.valid("param").id });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, 409);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/reviews",
      summary: "Review an item from a delivered order",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                orderItemId: z.string().uuid(),
                rating: z.number().int().min(1).max(5),
                accuracyRating: z.number().int().min(1).max(5).nullable().optional(),
                body: z.string().max(1000).nullable().optional(),
                photoUrls: z.array(z.string().max(500)).max(MAX_REVIEW_PHOTOS).default([]),
              }),
            },
          },
        },
      },
      responses: { 201: Any, 400: Any, 401: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const uid = userId(c);
      if (!uid) return c.json(signIn, 401);
      const body = c.req.valid("json");
      if (!ownPhotos(uid, body.photoUrls)) return c.json({ error: "INVALID_PHOTOS" }, 400);
      const r = await createReview(db, { buyerId: uid, ...body });
      if (r.ok) return c.json({ reviewId: r.reviewId }, 201);
      if (r.reason === "NOT_FOUND") return c.json({ error: r.reason }, 404);
      if (r.reason === "INVALID") return c.json({ error: r.reason }, 400);
      return c.json({ error: r.reason }, 409);
    },
  );

  return app;
}

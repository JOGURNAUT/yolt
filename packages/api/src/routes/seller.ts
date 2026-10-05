import { randomBytes } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import {
  addPhoto,
  createDraft,
  deleteDraft,
  getSellerListing,
  getSellerListings,
  getSellerTabCounts,
  markSoldElsewhere,
  publishListing,
  removePhoto,
  reorderPhotos,
  SELLER_TABS,
  updateListing,
  withdrawListing,
  type SellerTab,
} from "@yolt/core";
import { sellers, type Db } from "@yolt/db";
import { CATEGORIES, CONDITIONS, MAX_PRICE_PAISE, PHOTO_KINDS, type PhotoKind } from "@yolt/shared";
import type { AuthVariables } from "../auth";
import { InvalidImageError, MAX_UPLOAD_BYTES, processPhoto } from "../media/process";
import type { MediaStorage } from "../media/storage";
import type { ShippingProvider } from "../shipping/provider";
import { sellerOrderRoutes } from "./seller-orders";
import { sellerTrustRoutes } from "./seller-trust";
import { sellerDropRoutes } from "./drops";

type Env = { Variables: AuthVariables & { seller: typeof sellers.$inferSelect; userId: string } };

const ErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() });
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const Any = json(z.any(), "OK");
const Err = (d: string) => json(ErrorSchema, d);

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const cm = z.number().positive().max(400).optional();

const PatchSchema = z
  .object({
    title: text(120),
    description: text(2000),
    category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]).nullable().optional(),
    brandDeclared: text(60),
    tagSize: text(30),
    measurements: z
      .object({
        basis: z.enum(["FLAT", "AROUND"]).optional(),
        chestCm: cm,
        waistCm: cm,
        hipCm: cm,
        shoulderCm: cm,
        sleeveCm: cm,
        lengthCm: cm,
        inseamCm: cm,
        footLengthCm: cm,
      })
      .strict()
      .optional(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    flaws: text(1000),
    noFlawsConfirmed: z.boolean().optional(),
    pricePaise: z.number().int().positive().max(MAX_PRICE_PAISE).nullable().optional(),
    allowOffers: z.boolean().optional(),
  })
  .strict();

const TabSchema = z.enum(Object.keys(SELLER_TABS) as [SellerTab, ...SellerTab[]]);

export function sellerRoutes(deps: { db: Db; media: MediaStorage; shipping: ShippingProvider }) {
  const { db, media } = deps;
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  // Every seller route acts as the signed-in user's approved seller profile — never one named in the request.
  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
    const [seller] = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.userId, session.userId), eq(sellers.status, "APPROVED")));
    if (!seller) return c.json({ error: "NOT_A_SELLER" }, 403);
    c.set("seller", seller);
    c.set("userId", session.userId);
    await next();
  });

  app.route("/", sellerOrderRoutes({ db, shipping: deps.shipping }));
  app.route("/", sellerTrustRoutes({ db }));
  app.route("/", sellerDropRoutes({ db }));

  app.openapi(
    createRoute({ method: "get", path: "/me", summary: "The signed-in seller's store", responses: { 200: Any } }),
    (c) => {
      const s = c.get("seller");
      return c.json(
        { id: s.id, handle: s.handle, displayName: s.displayName, kycStatus: s.kycStatus },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/listings",
      summary: "Listings for one workspace tab, with counts for every tab",
      request: { query: z.object({ tab: TabSchema.default("live") }) },
      responses: { 200: Any, 400: Err("Bad tab") },
    }),
    async (c) => {
      const sellerId = c.get("seller").id;
      const { tab } = c.req.valid("query");
      const [items, counts] = await Promise.all([getSellerListings(db, { sellerId, tab }), getSellerTabCounts(db, sellerId)]);
      return c.json({ tab, counts, items }, 200);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/listings", summary: "Start a new draft", responses: { 201: Any } }),
    async (c) => {
      const draft = await createDraft(db, { sellerId: c.get("seller").id });
      return c.json({ id: draft.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/listings/{id}",
      summary: "A listing with photos and what still blocks publishing",
      request: { params: IdParam },
      responses: { 200: Any, 404: Err("Not found") },
    }),
    async (c) => {
      const r = await getSellerListing(db, { sellerId: c.get("seller").id, listingId: c.req.valid("param").id });
      if (!r) return c.json({ error: "NOT_FOUND" }, 404);
      return c.json(r, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/listings/{id}",
      summary: "Autosave edits",
      request: { params: IdParam, body: { content: { "application/json": { schema: PatchSchema } } } },
      responses: { 200: Any, 400: Err("Invalid"), 404: Err("Not found"), 409: Err("Not editable") },
    }),
    async (c) => {
      const patch = c.req.valid("json");
      // Empty strings from form fields mean "cleared".
      const cleaned = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === "" ? null : v]));
      const r = await updateListing(db, { sellerId: c.get("seller").id, listingId: c.req.valid("param").id, patch: cleaned });
      if (r.ok) return c.json({ listing: r.listing, missing: r.missing }, 200);
      if (r.reason === "NOT_FOUND") return c.json({ error: r.reason }, 404);
      return c.json({ error: r.reason, details: "missing" in r ? { missing: r.missing } : undefined }, 409);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/listings/{id}",
      summary: "Delete a draft that was never published",
      request: { params: IdParam },
      responses: { 200: Any, 404: Err("Not found"), 409: Err("Not a draft") },
    }),
    async (c) => {
      const r = await deleteDraft(db, { sellerId: c.get("seller").id, listingId: c.req.valid("param").id });
      if (!r.ok) return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      await Promise.allSettled(r.storageKeys.map((k) => media.delete(k)));
      return c.json({ ok: true }, 200);
    },
  );

  // Multipart upload; not described with Zod because the body is a file.
  app.post("/listings/:id/photos", async (c) => {
    const listingId = c.req.param("id");
    if (!z.string().uuid().safeParse(listingId).success) return c.json({ error: "INVALID_REQUEST" }, 400);
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) return c.json({ error: "PHOTO_TOO_LARGE" }, 413);

    const body = await c.req.parseBody();
    const file = body["file"];
    const kind = body["kind"];
    if (!(file instanceof File) || typeof kind !== "string" || !PHOTO_KINDS.includes(kind as PhotoKind)) {
      return c.json({ error: "INVALID_REQUEST", details: "Send `file` and a valid `kind`." }, 400);
    }

    let processed;
    try {
      processed = await processPhoto(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      if (err instanceof InvalidImageError) return c.json({ error: "INVALID_IMAGE", details: err.message }, 400);
      throw err;
    }

    const key = `listings/${listingId}/${randomBytes(12).toString("hex")}.webp`;
    await media.put(key, processed.data, processed.contentType);
    const r = await addPhoto(db, {
      sellerId: c.get("seller").id,
      listingId,
      kind: kind as PhotoKind,
      url: media.publicUrl(key),
      storageKey: key,
      width: processed.width,
      height: processed.height,
    });
    if (!r.ok) {
      await media.delete(key).catch(() => {});
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    }
    return c.json({ photo: r.photo }, 201);
  });

  app.openapi(
    createRoute({
      method: "delete",
      path: "/listings/{id}/photos/{photoId}",
      summary: "Remove a photo",
      request: {
        params: IdParam.extend({ photoId: z.string().uuid().openapi({ param: { name: "photoId", in: "path" } }) }),
      },
      responses: { 200: Any, 404: Err("Not found"), 409: Err("Not allowed") },
    }),
    async (c) => {
      const { id, photoId } = c.req.valid("param");
      const r = await removePhoto(db, { sellerId: c.get("seller").id, listingId: id, photoId });
      if (!r.ok) {
        const notFound = r.reason === "NOT_FOUND" || r.reason === "PHOTO_NOT_FOUND";
        return c.json({ error: r.reason, details: "missing" in r ? { missing: r.missing } : undefined }, notFound ? 404 : 409);
      }
      // Row is gone; storage cleanup is best-effort (an orphan sweep can catch failures later).
      if (r.storageKey) await media.delete(r.storageKey).catch(() => {});
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/listings/{id}/photos/order",
      summary: "Reorder photos; the first is the cover",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: z.object({ photoIds: z.array(z.string().uuid()).max(20) }) } } },
      },
      responses: { 200: Any, 404: Err("Not found"), 409: Err("Mismatch") },
    }),
    async (c) => {
      const r = await reorderPhotos(db, {
        sellerId: c.get("seller").id,
        listingId: c.req.valid("param").id,
        photoIds: c.req.valid("json").photoIds,
      });
      if (!r.ok) return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/listings/{id}/publish",
      summary: "Publish a complete draft (or relist a withdrawn item)",
      request: { params: IdParam },
      responses: { 200: Any, 403: Err("Seller not verified"), 404: Err("Not found"), 409: Err("Incomplete") },
    }),
    async (c) => {
      const s = c.get("seller");
      const r = await publishListing(db, { sellerId: s.id, listingId: c.req.valid("param").id, actorUserId: c.get("userId") });
      if (r.ok) return c.json({ slug: r.slug }, 200);
      if (r.reason === "NOT_FOUND") return c.json({ error: r.reason }, 404);
      if (r.reason === "SELLER_NOT_VERIFIED") return c.json({ error: r.reason }, 403);
      return c.json({ error: r.reason, details: "missing" in r ? { missing: r.missing } : undefined }, 409);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/listings/{id}/withdraw",
      summary: "Take a live item off sale",
      request: { params: IdParam },
      responses: { 200: Any, 404: Err("Not found"), 409: Err("Not available") },
    }),
    async (c) => {
      const r = await withdrawListing(db, {
        sellerId: c.get("seller").id,
        listingId: c.req.valid("param").id,
        actorUserId: c.get("userId"),
      });
      if (r.ok) return c.json({ ok: true }, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/listings/{id}/sold-elsewhere",
      summary: "Mark an item sold on Instagram or in person",
      request: { params: IdParam },
      responses: { 200: Any, 404: Err("Not found"), 409: Err("A buyer is checking out, or the item isn't available") },
    }),
    async (c) => {
      const r = await markSoldElsewhere(db, {
        sellerId: c.get("seller").id,
        listingId: c.req.valid("param").id,
        actorUserId: c.get("userId"),
      });
      if (r.ok) return c.json({ ok: true }, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );

  return app;
}

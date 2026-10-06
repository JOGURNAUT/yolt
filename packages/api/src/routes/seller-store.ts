import { randomBytes } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { clearStoreImage, getPayoutStatement, getStoreSettings, setStoreImage, updateStoreSettings, PAYOUT_MAX_PAGE_SIZE } from "@yolt/core";
import type { Db, sellers } from "@yolt/db";
import type { AuthVariables } from "../auth";
import { InvalidImageError, MAX_UPLOAD_BYTES, processStoreImage, type StoreImageKind } from "../media/process";
import type { MediaStorage } from "../media/storage";
import { Err, body, json } from "./schemas";

type Env = { Variables: AuthVariables & { seller: typeof sellers.$inferSelect; userId: string } };

const StoreSettings = z.object({
  handle: z.string(),
  displayName: z.string(),
  track: z.enum(["STORE", "CLOSET"]),
  instagramHandle: z.string().nullable(),
  instagramVerified: z.boolean(),
  kycStatus: z.enum(["NOT_STARTED", "PENDING", "VERIFIED", "FAILED"]),
  bio: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  dispatchDays: z.number().int(),
  shippingFeePaise: z.number().int(),
  freeShippingAbovePaise: z.number().int().nullable(),
  pickup: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
  }),
});

// Bounds are enforced in core (and reported per field); these only keep the payload sane.
const StorePatch = z
  .object({
    bio: z.string().max(1000).nullable(),
    dispatchDays: z.number(),
    shippingFeePaise: z.number(),
    freeShippingAbovePaise: z.number().nullable(),
    pickup: z.object({
      name: z.string().max(200),
      phone: z.string().max(30),
      line1: z.string().max(500),
      line2: z.string().max(500).nullable().optional(),
      landmark: z.string().max(300).nullable().optional(),
      city: z.string().max(200),
      state: z.string().max(100),
      pincode: z.string().max(20),
    }),
  })
  .partial()
  .strict();

const Payouts = z.object({
  balances: z.object({ pendingPaise: z.number().int(), availablePaise: z.number().int(), paidOutPaise: z.number().int() }),
  rows: z.array(
    z.object({
      orderId: z.string().uuid(),
      reference: z.string(),
      date: z.string(),
      itemsPaise: z.number().int(),
      shippingPaise: z.number().int(),
      source: z.enum(["SELLER_LINK", "YOLT_DISCOVERY"]),
      sourceLabel: z.string(),
      commissionPaise: z.number().int(),
      refundedPaise: z.number().int(),
      netPaise: z.number().int(),
      bucket: z.enum(["PENDING", "AVAILABLE"]),
    }),
  ),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** Mounted under /seller (the seller is resolved by the parent's middleware): store settings, images, payouts. */
export function sellerStoreRoutes(deps: { db: Db; media: MediaStorage }) {
  const { db, media } = deps;
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });
  const sellerId = (c: { get: (k: "seller") => Env["Variables"]["seller"] }) => c.get("seller").id;

  app.openapi(
    createRoute({
      method: "get",
      path: "/store",
      summary: "Your store settings. Instagram handle and verification are read-only.",
      responses: { 200: json(StoreSettings, "Settings"), 401: Err("Sign in required"), 403: Err("Not an approved seller"), 404: Err("Not found") },
    }),
    async (c) => {
      const s = await getStoreSettings(db, sellerId(c));
      return s ? c.json(s, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/store",
      summary: "Edit bio, dispatch days, shipping rule and pickup address",
      request: body(StorePatch),
      responses: {
        200: json(StoreSettings, "Saved"),
        400: Err("Invalid; details.errors lists each field"),
        401: Err("Sign in required"),
        403: Err("Not an approved seller"),
        404: Err("Not found"),
      },
    }),
    async (c) => {
      const r = await updateStoreSettings(db, { sellerId: sellerId(c), patch: c.req.valid("json") });
      if (r.ok) return c.json(r.settings, 200);
      if (r.reason === "INVALID") return c.json({ error: r.reason, details: { errors: r.errors } }, 400);
      return c.json({ error: r.reason }, 404);
    },
  );

  // Multipart uploads aren't described with Zod because the body is a file (same as listing photos).
  const upload = (kind: StoreImageKind) => async (c: import("hono").Context<Env>) => {
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) return c.json({ error: "PHOTO_TOO_LARGE" }, 413);
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) return c.json({ error: "INVALID_REQUEST", details: "Send a `file`." }, 400);

    let processed;
    try {
      processed = await processStoreImage(new Uint8Array(await file.arrayBuffer()), kind);
    } catch (err) {
      if (err instanceof InvalidImageError) return c.json({ error: "INVALID_IMAGE", details: err.message }, 400);
      throw err;
    }
    const id = sellerId(c);
    const key = `stores/${id}/${kind}-${randomBytes(12).toString("hex")}.webp`;
    await media.put(key, processed.data, processed.contentType);
    const url = media.publicUrl(key);
    const r = await setStoreImage(db, { sellerId: id, kind, url, key });
    if (!r.ok) {
      await media.delete(key).catch(() => {});
      return c.json({ error: r.reason }, 404);
    }
    if (r.previousKey) await media.delete(r.previousKey).catch(() => {});
    return c.json({ url }, 201);
  };
  const remove = (kind: StoreImageKind) => async (c: import("hono").Context<Env>) => {
    const r = await clearStoreImage(db, { sellerId: sellerId(c), kind });
    if (!r.ok) return c.json({ error: r.reason }, 404);
    if (r.previousKey) await media.delete(r.previousKey).catch(() => {});
    return c.json({ ok: true }, 200);
  };
  app.post("/store/logo", upload("logo"));
  app.post("/store/banner", upload("banner"));
  app.delete("/store/logo", remove("logo"));
  app.delete("/store/banner", remove("banner"));

  app.openapi(
    createRoute({
      method: "get",
      path: "/payouts",
      summary: "Payouts statement: pending, available and paid-out balances, with one row per order",
      request: {
        query: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(PAYOUT_MAX_PAGE_SIZE).optional(),
        }),
      },
      responses: { 200: json(Payouts, "Statement"), 400: Err("Invalid paging"), 401: Err("Sign in required"), 403: Err("Not an approved seller") },
    }),
    async (c) => {
      const { page, pageSize } = c.req.valid("query");
      const s = await getPayoutStatement(db, { sellerId: sellerId(c), page, pageSize });
      return c.json({ ...s, rows: s.rows.map((r) => ({ ...r, date: r.date.toISOString() })) }, 200);
    },
  );

  return app;
}

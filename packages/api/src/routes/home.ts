import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { APPLICATION_VOLUMES } from "@yolt/shared";
import { applyToSell, getHomeData, type AuthSecrets } from "@yolt/core";
import type { Db } from "@yolt/db";
import { clientIp, type AuthVariables } from "../auth";
import { Cards, Err, json, body } from "./schemas";

const hook = {
  defaultHook: (result: { success: boolean; error?: { issues: unknown } }, c: { json: (b: unknown, s: 400) => Response }) => {
    if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error?.issues }, 400);
  },
};

const FeaturedStore = z.object({
  id: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  inStockCount: z.number().int(),
  source: z.enum(["CURATED", "MOST_STOCKED"]),
});

const HomeResponse = z.object({
  trending: z.object({ mode: z.enum(["TRENDING", "JUST_DROPPED"]), items: Cards }),
  justSold: Cards,
  grails: Cards,
  featuredStore: FeaturedStore.nullable(),
  edit: z.object({ title: z.string(), items: Cards }).nullable(),
});

/**
 * Mounted at /home. One public read for the whole landing page, so the page makes a single request.
 * Sections are independent: a missing one (no Grails, no edit) is empty or null, never filled in.
 */
export function homeRoutes(deps: { db: Db }) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>(hook);
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      summary: "Landing page data: trending, just sold, grails, featured store, edit",
      responses: { 200: json(HomeResponse, "Landing data") },
    }),
    async (c) => {
      c.header("Cache-Control", "public, max-age=30");
      return c.json(await getHomeData(deps.db), 200);
    },
  );
  return app;
}

const ApplyBody = z.object({
  storeName: z.string().max(200),
  instagramHandle: z.string().max(200),
  city: z.string().max(200),
  whatTheySell: z.string().max(2000),
  piecesPerMonth: z.enum(APPLICATION_VOLUMES),
  phone: z.string().max(30),
});

/**
 * Mounted at /seller-applications: the public "Apply to sell" form. Works for guests; a signed-in
 * applicant is linked automatically. The response never reveals another applicant's details.
 */
export function sellerApplicationRoutes(deps: { db: Db; secrets: AuthSecrets }) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>(hook);
  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      summary: "Apply to sell on YOLT (guests allowed, rate limited)",
      request: body(ApplyBody),
      responses: {
        201: json(z.object({ id: z.string().uuid(), status: z.string(), existing: z.literal(false) }), "Application received"),
        200: json(z.object({ id: z.string().uuid(), status: z.string(), existing: z.literal(true) }), "An open application for this phone or Instagram handle already exists"),
        400: Err("Invalid request"),
        429: Err("Too many applications; see Retry-After"),
      },
    }),
    async (c) => {
      const r = await applyToSell(deps.db, deps.secrets, { ...c.req.valid("json"), userId: c.get("session")?.userId ?? null, ip: clientIp(c) });
      if (!r.ok) {
        if (r.reason === "INVALID") return c.json({ error: r.reason, details: { field: r.field } }, 400);
        c.header("Retry-After", String(r.retryAfterSeconds));
        return c.json({ error: r.reason, details: { retryAfterSeconds: r.retryAfterSeconds } }, 429);
      }
      return r.created
        ? c.json({ id: r.id, status: r.status, existing: false as const }, 201)
        : c.json({ id: r.id, status: r.status, existing: true as const }, 200);
    },
  );
  return app;
}

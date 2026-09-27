import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getOpenClaimsForSeller, getUnrepliedReviews, replyToReview, respondToClaim } from "@yolt/core";
import type { Db, sellers } from "@yolt/db";
import type { AuthVariables } from "../auth";

type Env = { Variables: AuthVariables & { seller: typeof sellers.$inferSelect; userId: string } };
const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

/** Mounted under /seller (seller resolved in middleware): answer claims, reply to reviews. */
export function sellerTrustRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.openapi(createRoute({ method: "get", path: "/claims", summary: "Open buyer-protection claims", responses: { 200: Any } }), async (c) =>
    c.json(await getOpenClaimsForSeller(db, c.get("seller").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/claims/{id}/respond",
      summary: "Accept (full refund) or dispute (YOLT decides)",
      request: {
        params: IdParam,
        body: {
          content: {
            "application/json": {
              schema: z.object({ action: z.enum(["ACCEPT", "DISPUTE"]), response: z.string().trim().max(1000).default("") }),
            },
          },
        },
      },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const { action, response } = c.req.valid("json");
      // A dispute must explain the seller's side for YOLT to decide fairly.
      if (action === "DISPUTE" && response.length < 10) return c.json({ error: "EXPLANATION_REQUIRED" }, 400);
      const r = await respondToClaim(db, { sellerId: c.get("seller").id, claimId: c.req.valid("param").id, actorUserId: c.get("userId"), action, response });
      if (r.ok) return c.json({ ok: true, refundId: r.refundId }, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );

  app.openapi(createRoute({ method: "get", path: "/reviews/unreplied", summary: "Reviews without a reply", responses: { 200: Any } }), async (c) =>
    c.json(await getUnrepliedReviews(db, c.get("seller").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/reviews/{id}/reply",
      summary: "Reply once to a review on your store",
      request: { params: IdParam, body: { content: { "application/json": { schema: z.object({ reply: z.string().trim().min(1).max(500) }) } } } },
      responses: { 200: Any, 400: Any, 409: Any },
    }),
    async (c) => {
      const r = await replyToReview(db, { sellerId: c.get("seller").id, reviewId: c.req.valid("param").id, reply: c.req.valid("json").reply });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, 409);
    },
  );

  return app;
}

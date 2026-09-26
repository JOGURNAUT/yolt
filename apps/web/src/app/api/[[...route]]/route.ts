import { handle } from "hono/vercel";
import { api } from "@/lib/server/api";

// Every HTTP method the API uses must be exported here, or Next.js answers 405 before Hono sees it.
const handler = handle(api);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

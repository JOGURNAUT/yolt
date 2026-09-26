import { handle } from "hono/vercel";
import { api } from "@/lib/server/api";

const handler = handle(api);

export const GET = handler;
export const POST = handler;

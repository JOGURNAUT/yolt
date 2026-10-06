import { searchListings } from "@yolt/core";
import { parseSearchParams } from "@yolt/shared";
import { db } from "@/lib/server/db";

/** How many pieces a set of filters would show: the number on the filter sheet's "Show N pieces". Same parameters as /search. */
export async function GET(request: Request) {
  const params = parseSearchParams(new URL(request.url).searchParams);
  const { total } = await searchListings(db, { ...params, page: 1 });
  return Response.json({ total }, { headers: { "cache-control": "no-store" } });
}

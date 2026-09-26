import { describe, expect, it } from "vitest";
import { S3MediaStorage } from "../src";

// Integration check against a real S3-compatible server. Runs when MEDIA_ENDPOINT is set
// (locally: `pnpm db:up && pnpm media:setup`); skipped otherwise.
const endpoint = process.env.MEDIA_ENDPOINT;

describe.skipIf(!endpoint)("S3MediaStorage against a real server", () => {
  const bucket = process.env.MEDIA_BUCKET ?? "yolt-media";
  const storage = new S3MediaStorage({
    endpoint: endpoint!,
    bucket,
    accessKeyId: process.env.MEDIA_ACCESS_KEY_ID ?? "yolt",
    secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY ?? "yolt-dev-secret",
    publicBaseUrl: `${endpoint}/${bucket}`,
  });

  it("stores an object that anyone can read at its public URL, then deletes it", async () => {
    const key = `test/${Date.now()}.txt`;
    await storage.put(key, new TextEncoder().encode("hello"), "text/plain");
    const res = await fetch(storage.publicUrl(key));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
    expect(res.headers.get("cache-control")).toContain("immutable");

    await storage.delete(key);
    expect((await fetch(storage.publicUrl(key))).status).toBe(404);
  });
});

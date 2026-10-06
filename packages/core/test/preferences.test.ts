import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sellers } from "@yolt/db";
import { getInYourSizes, getPreferences, setPreferences } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const prefs = (userId: string, p: Partial<{ sizes: string[]; styles: string[]; maxBudgetPaise: number | null }> = {}) =>
  setPreferences(db, { userId, sizes: [], styles: [], maxBudgetPaise: null, ...p });

describe("preferences", () => {
  it("are empty and unset until the buyer chooses; skipping stores nothing", async () => {
    const u = await createUser(db);
    expect(await getPreferences(db, u.id)).toEqual({ sizes: [], styles: [], maxBudgetPaise: null, isSet: false });
  });

  it("normalise and de-duplicate sizes, and replace on every save", async () => {
    const u = await createUser(db);
    const r = await prefs(u.id, { sizes: ["m", " M ", "uk   8", ""], styles: ["Denim", "Denim", "Y2K"], maxBudgetPaise: 150_000 });
    expect(r).toEqual({ ok: true, preferences: { sizes: ["M", "UK 8"], styles: ["Denim", "Y2K"], maxBudgetPaise: 150_000 } });
    expect(await getPreferences(db, u.id)).toMatchObject({ sizes: ["M", "UK 8"], isSet: true });

    await prefs(u.id, { sizes: ["L"] });
    expect(await getPreferences(db, u.id)).toMatchObject({ sizes: ["L"], styles: [], maxBudgetPaise: null });
  });

  it("validates sizes, styles and budget", async () => {
    const u = await createUser(db);
    expect(await prefs(u.id, { sizes: Array.from({ length: 9 }, (_, i) => `S${i}`) })).toEqual({ ok: false, reason: "INVALID", field: "sizes" });
    expect((await prefs(u.id, { sizes: Array.from({ length: 8 }, (_, i) => `S${i}`) })).ok).toBe(true);
    expect(await prefs(u.id, { sizes: ["x".repeat(21)] })).toEqual({ ok: false, reason: "INVALID", field: "sizes" });
    expect(await prefs(u.id, { styles: ["Cottagecore"] })).toEqual({ ok: false, reason: "INVALID", field: "styles" });
    expect(await prefs(u.id, { maxBudgetPaise: 100 })).toEqual({ ok: false, reason: "INVALID", field: "maxBudgetPaise" });
    expect(await prefs(u.id, { maxBudgetPaise: 12.5 })).toEqual({ ok: false, reason: "INVALID", field: "maxBudgetPaise" });
    expect((await prefs(u.id, { styles: ["Kurtas & ethnic", "Vintage sports"] })).ok).toBe(true);
  });
});

describe("in your sizes", () => {
  it("matches tag sizes ignoring case and spaces, newest first", async () => {
    const { seller } = await createSeller(db);
    const u = await createUser(db);
    const older = await createListing(db, seller.id, { tagSize: "m", publishedAt: new Date(Date.now() - 86_400_000) });
    const newer = await createListing(db, seller.id, { tagSize: " M ", publishedAt: new Date() });
    const uk = await createListing(db, seller.id, { tagSize: "uk  8", publishedAt: new Date(Date.now() - 3_600_000) });
    await createListing(db, seller.id, { tagSize: "L" });
    await createListing(db, seller.id, { tagSize: "MM" });
    await createListing(db, seller.id, { tagSize: null });

    await prefs(u.id, { sizes: ["M", "UK 8"] });
    const r = await getInYourSizes(db, u.id);
    expect(r.sizes).toEqual(["M", "UK 8"]);
    expect(r.items.map((i) => i.id)).toEqual([newer.id, uk.id, older.id]);
  });

  it("is empty without preferences, and lowercase input still matches", async () => {
    const { seller } = await createSeller(db);
    const u = await createUser(db);
    const l = await createListing(db, seller.id, { tagSize: "M" });
    expect((await getInYourSizes(db, u.id)).items).toEqual([]);
    await prefs(u.id, { sizes: ["m"] });
    expect((await getInYourSizes(db, u.id)).items.map((i) => i.id)).toEqual([l.id]);
  });

  it("only shows in-stock pieces from approved stores: no sold, drafts or suspended", async () => {
    const { seller } = await createSeller(db);
    const { seller: bad } = await createSeller(db);
    const u = await createUser(db);
    const ok = await createListing(db, seller.id, { tagSize: "M" });
    await createListing(db, seller.id, { tagSize: "M", status: "SOLD", soldAt: new Date() });
    await createListing(db, seller.id, { tagSize: "M", status: "DRAFT", publishedAt: null });
    await createListing(db, bad.id, { tagSize: "M" });
    await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, bad.id));
    await prefs(u.id, { sizes: ["M"] });
    expect((await getInYourSizes(db, u.id)).items.map((i) => i.id)).toEqual([ok.id]);
  });
});

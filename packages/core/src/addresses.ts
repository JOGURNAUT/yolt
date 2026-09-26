import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { validateAddress, type AddressError, type AddressInput } from "@yolt/shared";
import { addresses, type Db } from "@yolt/db";

/** Buyer address book. Every function is scoped to the acting user's own addresses. */

export const MAX_ADDRESSES = 10;

export type Address = typeof addresses.$inferSelect;

export async function listAddresses(db: Db, userId: string) {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
}

export type SaveAddressResult =
  | { ok: true; address: Address }
  | { ok: false; reason: "INVALID"; errors: AddressError[] }
  | { ok: false; reason: "TOO_MANY" | "NOT_FOUND" };

export async function createAddress(db: Db, input: { userId: string; address: AddressInput; makeDefault?: boolean }): Promise<SaveAddressResult> {
  const v = validateAddress(input.address);
  if (!v.ok) return { ok: false, reason: "INVALID", errors: v.errors };
  return db.transaction(async (tx) => {
    // Serialise per user so the cap and the "first address is default" rule hold under concurrency.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`addr:${input.userId}`}))`);
    const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, input.userId));
    if (existing.length >= MAX_ADDRESSES) return { ok: false, reason: "TOO_MANY" } as const;

    const isDefault = existing.length === 0 || input.makeDefault === true;
    if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, input.userId));
    const [created] = await tx
      .insert(addresses)
      .values({ userId: input.userId, ...v.address, isDefault })
      .returning();
    return { ok: true, address: created! } as const;
  });
}

export async function updateAddress(db: Db, input: { userId: string; addressId: string; address: AddressInput }): Promise<SaveAddressResult> {
  const v = validateAddress(input.address);
  if (!v.ok) return { ok: false, reason: "INVALID", errors: v.errors };
  // Orders keep their own snapshot, so editing an address never changes a placed order.
  const [updated] = await db
    .update(addresses)
    .set(v.address)
    .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)))
    .returning();
  return updated ? { ok: true, address: updated } : { ok: false, reason: "NOT_FOUND" };
}

export async function setDefaultAddress(db: Db, input: { userId: string; addressId: string }) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)));
    if (!target) return { ok: false as const, reason: "NOT_FOUND" as const };
    await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, input.userId));
    await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, target.id));
    return { ok: true as const };
  });
}

export async function deleteAddress(db: Db, input: { userId: string; addressId: string }) {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)))
      .returning();
    if (!removed) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (removed.isDefault) {
      // Promote the oldest remaining address so the user always has a default if they have any.
      const [next] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.userId, input.userId), ne(addresses.id, removed.id)))
        .orderBy(asc(addresses.createdAt))
        .limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
    return { ok: true as const };
  });
}

export async function getAddress(db: Db, input: { userId: string; addressId: string }) {
  const [a] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)));
  return a ?? null;
}

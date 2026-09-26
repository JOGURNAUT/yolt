import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAddress, deleteAddress, listAddresses, MAX_ADDRESSES, setDefaultAddress, updateAddress } from "../src";
import { createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const input = (line1 = "Flat 12, Sunrise Apartments") => ({
  name: "Ananya Sharma",
  phone: "98765 43210",
  line1,
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
});

describe("address book", () => {
  it("first address becomes default; phone and state are normalised", async () => {
    const u = await createUser(db);
    const r = await createAddress(db, { userId: u.id, address: input() });
    expect(r.ok && r.address).toMatchObject({ isDefault: true, phone: "+919876543210", state: "Maharashtra" });
    const second = await createAddress(db, { userId: u.id, address: input("House 4, MG Road") });
    expect(second.ok && second.address.isDefault).toBe(false);
  });

  it("rejects invalid addresses with field errors", async () => {
    const u = await createUser(db);
    const r = await createAddress(db, { userId: u.id, address: { ...input(), pincode: "12" } });
    expect(r).toMatchObject({ ok: false, reason: "INVALID", errors: [{ field: "pincode" }] });
  });

  it("switching default keeps exactly one default", async () => {
    const u = await createUser(db);
    await createAddress(db, { userId: u.id, address: input() });
    const b = await createAddress(db, { userId: u.id, address: input("House 4, MG Road") });
    if (!b.ok) throw new Error();
    await setDefaultAddress(db, { userId: u.id, addressId: b.address.id });
    const all = await listAddresses(db, u.id);
    expect(all.filter((a) => a.isDefault).map((a) => a.id)).toEqual([b.address.id]);
    expect(all[0]!.id).toBe(b.address.id); // default listed first
  });

  it("deleting the default promotes another", async () => {
    const u = await createUser(db);
    const a = await createAddress(db, { userId: u.id, address: input() });
    await createAddress(db, { userId: u.id, address: input("House 4, MG Road") });
    if (!a.ok) throw new Error();
    await deleteAddress(db, { userId: u.id, addressId: a.address.id });
    const all = await listAddresses(db, u.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.isDefault).toBe(true);
  });

  it("users can't read or change each other's addresses", async () => {
    const [u, other] = [await createUser(db), await createUser(db)];
    const a = await createAddress(db, { userId: u.id, address: input() });
    if (!a.ok) throw new Error();
    expect(await updateAddress(db, { userId: other.id, addressId: a.address.id, address: input("Hacked 1") })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await deleteAddress(db, { userId: other.id, addressId: a.address.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await setDefaultAddress(db, { userId: other.id, addressId: a.address.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await listAddresses(db, other.id)).toHaveLength(0);
  });

  it("caps the address book, even under concurrent adds", async () => {
    const u = await createUser(db);
    const results = await Promise.all(Array.from({ length: MAX_ADDRESSES + 5 }, (_, i) => createAddress(db, { userId: u.id, address: input(`House ${i + 10}, Street`) })));
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_ADDRESSES);
    expect((await listAddresses(db, u.id)).filter((a) => a.isDefault)).toHaveLength(1);
  });
});

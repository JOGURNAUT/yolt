import type { Metadata } from "next";
import { connection } from "next/server";
import { listAddresses, MAX_ADDRESSES } from "@yolt/core";
import { AddressBook } from "@/components/account/address-book";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";
import "@/styles/search.css";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default async function AddressesPage() {
  await connection();
  const user = (await getCurrentUser())!;
  const rows = await listAddresses(db, user.userId);
  return <AddressBook initial={rows.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault }))} max={MAX_ADDRESSES} />;
}

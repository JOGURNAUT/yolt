import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getStoreSettings } from "@yolt/core";
import { PageHeader } from "@/components/seller/page-header";
import { StoreSettingsForm } from "@/components/seller/store-settings-form";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Store settings", robots: { index: false } };

export default async function StoreSettingsPage() {
  await connection();
  const current = await requireSeller("/seller/store");
  const settings = await getStoreSettings(db, current.seller.id);
  if (!settings) notFound();
  return (
    <>
      <PageHeader title="Store settings" />
      <StoreSettingsForm initial={settings} />
    </>
  );
}

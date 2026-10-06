import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PreferencesForm } from "@/components/preferences-form";
import { getMyPreferences } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your sizes" };

export default async function PreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fpreferences");
  const prefs = await getMyPreferences(user.userId);
  return <PreferencesForm initial={{ sizes: prefs.sizes, styles: prefs.styles, maxBudgetPaise: prefs.maxBudgetPaise }} />;
}

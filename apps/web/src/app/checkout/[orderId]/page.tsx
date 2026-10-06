import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { CheckoutView } from "@/components/checkout-view";
import { envFlags } from "@/lib/env";
import { getCheckoutContext } from "@/lib/server/checkout-context";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/checkout/[orderId]">) {
  await connection();
  const { orderId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/${orderId}`)}&for=checkout`);
  const context = await getCheckoutContext(user.userId, orderId);
  if (!context) notFound();
  return <CheckoutView orderId={orderId} sandbox={envFlags().sandboxTools} context={context} />;
}

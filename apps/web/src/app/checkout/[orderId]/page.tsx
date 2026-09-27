import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { envFlags } from "@/lib/env";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/checkout/[orderId]">) {
  const { orderId } = await params;
  return <CheckoutView orderId={orderId} sandbox={envFlags().sandboxTools} />;
}

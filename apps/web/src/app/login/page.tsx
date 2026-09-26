import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Only same-site paths, so ?next= can't bounce users to another site. */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <div className="mx-auto max-w-sm space-y-6 pt-6">
      <div>
        <h1 className="text-2xl font-bold">Sign in to YOLT</h1>
        <p className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code to your WhatsApp. No password needed.</p>
      </div>
      <LoginForm next={next} />
    </div>
  );
}

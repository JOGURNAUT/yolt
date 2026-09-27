import { notFound } from "next/navigation";
import { DevLogin } from "@/components/dev-login";
import { envFlags } from "@/lib/env";
import { getDemoUsers } from "@/lib/server/queries";

export default async function DevPage({ searchParams }: PageProps<"/dev">) {
  if (!envFlags().devLogin) notFound();
  const users = await getDemoUsers();
  const next = (await searchParams).next;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Development sign-in</h1>
      <p className="text-sm text-muted">
        Stand-in for phone OTP login while it&apos;s being built. Pick a demo account from the seed data.
      </p>
      <DevLogin users={users} next={typeof next === "string" && next.startsWith("/") ? next : "/"} />
    </div>
  );
}

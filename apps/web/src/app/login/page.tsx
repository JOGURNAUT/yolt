import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { HangTag } from "@/components/ui/hang-tag";
import { getCurrentUser } from "@/lib/server/session";
import { parseReason, REASON_LINES, safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** The standalone sign-in page (boards SignIn, SignInDesktop): a direct visit, a shared link or a redirect from a page that needs an account. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const reason = parseReason(sp.for, next);

  return (
    <div className="mx-auto w-full max-w-[880px] lg:py-8">
      <div className="card flex flex-col overflow-hidden lg:flex-row lg:shadow-[var(--shadow-raised)]">
        <aside className="hidden w-[380px] shrink-0 flex-col gap-5 bg-accent p-10 text-on-accent lg:flex">
          <HangTag size="lg" ink>
            1 OF 1
          </HangTag>
          <p className="t-h2">Every piece, a second life.</p>
          <p className="t-small font-semibold">Thrift without the DMs. Every piece measured, every flaw shown, your money protected.</p>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-5 p-5 lg:p-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="t-h1">Sign in</h1>
            <p className="t-small muted">{reason ? REASON_LINES[reason] : "Phone sign-in. No passwords."}</p>
          </div>
          <LoginForm next={next} />
        </section>
      </div>
    </div>
  );
}

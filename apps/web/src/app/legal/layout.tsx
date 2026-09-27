import Link from "next/link";
import { appEnv } from "@/lib/env";
import { LEGAL_PAGES, legalDetails } from "@/lib/legal";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  const { lastUpdated } = legalDetails();
  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[200px_1fr]">
      <nav aria-label="Policies" className="space-y-2 text-sm">
        {LEGAL_PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="block hover:underline">
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="space-y-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {appEnv() !== "production" && (
          <p className="rounded-md border border-dashed border-danger p-3 text-xs text-danger">
            Draft for review by a lawyer before launch. Details in [brackets] come from deployment settings.
          </p>
        )}
        {children}
        <p className="pt-6 text-xs text-muted">Last updated {lastUpdated}.</p>
      </article>
    </div>
  );
}

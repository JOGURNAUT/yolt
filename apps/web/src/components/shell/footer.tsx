import Link from "next/link";
import { NAV_LINKS } from "./header";

const HELP_LINKS = [
  { href: "/legal/buyer-protection", label: "Buyer protection" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/grievance", label: "Grievance officer" },
] as const;

/** Footer (brief, B2.1 §15): big wordmark, shop and help links, "Made in India". */
export function Footer() {
  return (
    <footer className="band-dark border-t border-line">
      <div className="mx-auto max-w-[1248px] px-4 pb-8 pt-10 lg:px-6 lg:pt-14">
        <div className="grid gap-8 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
          <div>
            <p className="wordmark text-[72px] lg:text-[140px]" aria-hidden="true">
              YOLT
            </p>
            <p className="mt-3 text-sm text-[#D9D8D2]">Thrift without the DMs.</p>
          </div>
          <FooterLinks title="Shop" links={NAV_LINKS} />
          <FooterLinks title="Help" links={HELP_LINKS} />
        </div>
        <p className="mt-10 border-t border-white/15 pt-5 text-xs text-[#D9D8D2]">Made in India</p>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <p className="t-caption mb-2 uppercase text-[#D9D8D2]">{title}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-11 items-center text-sm font-semibold hover:underline sm:min-h-9">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

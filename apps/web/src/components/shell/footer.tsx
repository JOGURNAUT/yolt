import Link from "next/link";
import { Camera, Ruler, ShieldCheck, Wallet } from "lucide-react";
import { CATEGORIES } from "@yolt/shared";
import { ICON_STROKE } from "@/components/ui/cx";
import { ThemeSelect } from "@/components/ui/theme-toggle";

const PROMISES = [
  { icon: Camera, t: "Every flaw photographed", b: "What you see is the piece." },
  { icon: Ruler, t: "Measured, not guessed", b: "Flat measurements on every listing." },
  { icon: Wallet, t: "Pay only through YOLT", b: "Never a personal UPI QR." },
  { icon: ShieldCheck, t: "Buyer protection", b: "Refund if it isn't as described." },
] as const;

const SHOP_CATEGORIES = ["jackets", "jeans", "trousers", "tops", "sneakers", "bags", "accessories"] as const;

const SHOP_LINKS = [
  { href: "/search?sort=newest", label: "New arrivals" },
  { href: "/drops", label: "Drops" },
  { href: "/search#stores", label: "Stores" },
  ...SHOP_CATEGORIES.map((id) => ({ href: `/search?cat=${id}`, label: CATEGORIES.find((c) => c.id === id)?.label ?? id })),
] as const;

const SELL_LINKS = [{ href: "/sell", label: "Sell on YOLT" }] as const;

const HELP_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/legal/buyer-protection", label: "Buyer protection" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/grievance", label: "Grievance officer" },
] as const;

/** Footer: the promises up top, then the wordmark, shop, sell and help links, "Made in India". */
export function Footer() {
  return (
    <footer className="band-dark border-t border-line">
      <div className="site-wrap pb-8 pt-8 lg:pt-12">
        <ul className="grid gap-px border border-white/20 bg-white/20 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, t, b }) => (
            <li key={t} className="flex items-start gap-3 bg-[#0D0D0C] p-4">
              <Icon aria-hidden className="ic ic-24 shrink-0 text-accent" strokeWidth={ICON_STROKE} />
              <div>
                <p className="text-sm font-bold">{t}</p>
                <p className="text-xs text-[#D9D8D2]">{b}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-10 grid gap-8 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-14">
          <div>
            <p className="wordmark text-[72px] lg:text-[140px]" aria-hidden="true">
              YOLT
            </p>
            <p className="mt-3 text-sm text-[#D9D8D2]">Thrift without the DMs.</p>
          </div>
          <FooterLinks title="Shop" links={SHOP_LINKS} />
          <FooterLinks title="Sell" links={SELL_LINKS} />
          <FooterLinks title="Help" links={HELP_LINKS} />
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-5">
          <p className="text-xs text-[#D9D8D2]">Made in India</p>
          <ThemeSelect />
        </div>
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

import type { Metadata } from "next";
import Link from "next/link";
import { Sticker } from "@/components/ui/sticker";
import { SILHOUETTE } from "@/components/landing/silhouettes";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

const TILES = [
  { cls: "left-[6%] top-[14%] w-[38%] -rotate-6", tint: "#DFE3E6", art: SILHOUETTE.pants, label: "Every flaw shown", tone: "ink" as const },
  { cls: "left-[50%] top-[10%] w-[41%] rotate-[5deg]", tint: "#E6E0D6", art: SILHOUETTE.jacket, label: "1 of 1", tone: "accent" as const },
  { cls: "left-[18%] top-[54%] w-[33%] rotate-3", tint: "#EAD9D6", art: SILHOUETTE.tee, label: "Measured flat", tone: "paper" as const },
  { cls: "left-[60%] top-[60%] w-[31%] -rotate-4", tint: "#E6DFD2", art: SILHOUETTE.bag, label: "Condition graded", tone: "pink" as const },
];

/**
 * Welcome (board B2.4). Shown once after a first sign-in, and open to guests too. Everything
 * after it is optional: preferences can be skipped and nothing here is required to browse.
 */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const next = safeNext((await searchParams).next);
  const user = await getCurrentUser();
  return (
    <div className="band-dark mx-auto flex max-w-[480px] flex-col overflow-hidden rounded-[24px]">
      <div aria-hidden="true" className="relative h-[360px]">
        {TILES.map((t) => (
          <div key={t.label} className={`absolute ${t.cls}`}>
            <div className="ph ring-4 ring-white" style={{ background: t.tint }}>
              <div className="shot">
                <svg viewBox="0 0 100 100">
                  <path d={t.art} />
                </svg>
              </div>
            </div>
            <span className="absolute -bottom-2.5 left-2">
              <Sticker tone={t.tone}>{t.label}</Sticker>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3.5 px-6 pt-5">
        <p className="wordmark text-[88px] leading-[.85]">YOLT</p>
        <h1 className="t-h1 !text-[22px] !leading-[26px] text-white">Every piece here gets a second life.</h1>
        <p className="t-body text-[#D9D8D2]">Thrift without the DMs: every piece measured, every flaw shown, your money protected.</p>
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-7 pt-6">
        {user ? (
          <>
            <Link href="/preferences" className="btn h-14 bg-white px-6 text-base text-[#0D0D0C] shadow-[3px_3px_0_0_#C8B6FF]">
              Set my sizes
            </Link>
            <Link href={next} className="btn h-14 px-6 text-base text-white shadow-[inset_0_0_0_2px_#FFFFFF]">
              Skip for now
            </Link>
            <span className="t-caption text-center text-[#A6A49C]">Optional. Takes a few seconds, and you can change it any time.</span>
          </>
        ) : (
          <>
            <Link href="/" className="btn h-14 bg-white px-6 text-base text-[#0D0D0C] shadow-[3px_3px_0_0_#C8B6FF]">
              Start browsing
            </Link>
            <Link href="/login" className="btn h-14 px-6 text-base text-white shadow-[inset_0_0_0_2px_#FFFFFF]">
              Sign in
            </Link>
            <span className="t-caption text-center text-[#A6A49C]">No account needed to browse or save.</span>
          </>
        )}
      </div>
    </div>
  );
}

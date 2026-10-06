import { AnnouncementTicker } from "@/components/ui/announcement-ticker";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing skeleton (board B2.3). The header and nav come from the layout and render at once; the
 * ticker is static text, and the content blocks shimmer (they hold still under reduced motion).
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="page-wide">
      <AnnouncementTicker items={["Every flaw photographed", "Pay safely through YOLT. Never a personal UPI QR"]} className="bleed-x -mt-4 mb-1 lg:-mt-6 lg:mb-3" />
      <div className="hero-bleed grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-[330px] !rounded-[24px] lg:col-span-8 lg:h-[348px]" />
        <div className="hidden h-[348px] flex-col gap-6 lg:col-span-4 lg:flex">
          <Skeleton className="flex-1 !rounded-[20px]" />
          <Skeleton className="flex-1 !rounded-[20px]" />
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-4 lg:pt-5">
        <Skeleton className="h-[18px] w-[150px]" />
        <Skeleton className="h-2.5 w-[110px]" />
      </div>
      <div className="hscroll hscroll-bleed shelf-row pt-3">
        {[90, 70, 100, 80, 90].map((w, i) => (
          <div key={i} className="flex w-[164px] shrink-0 flex-col gap-2 lg:w-auto">
            <Skeleton className="aspect-[4/5] !rounded-2xl" />
            <Skeleton className="h-3" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

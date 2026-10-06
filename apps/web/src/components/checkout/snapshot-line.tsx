import Link from "next/link";
import { CONDITION_INFO } from "@yolt/shared";
import { formatINR } from "@/lib/format";
import { GarmentImage } from "../garment-image";

export type SnapshotItem = {
  title: string;
  tagSize?: string | null;
  condition?: string | null;
  category?: string | null;
  photoUrl?: string | null;
  pricePaise: number;
};

/** A piece as the buyer saw it when they bought it: photo, title, size and condition, price. */
export function SnapshotLine({ item, href, thumb = 64 }: { item: SnapshotItem; href?: string; thumb?: 52 | 60 | 64 }) {
  const meta = [item.tagSize, item.condition ? (CONDITION_INFO[item.condition as keyof typeof CONDITION_INFO]?.label ?? null) : null].filter(Boolean).join(" · ");
  const title = href ? (
    <Link href={href} className="t-h3 !text-[15px] no-underline hover:underline">
      {item.title}
    </Link>
  ) : (
    <span className="t-h3 !text-[15px]">{item.title}</span>
  );
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0" style={{ width: thumb }}>
        <GarmentImage src={item.photoUrl ?? null} alt="" category={item.category ?? "photo"} className="!rounded-md" />
      </div>
      <div className="flex min-w-0 grow flex-col gap-1">
        {title}
        {meta && <span className="t-small muted">{meta}</span>}
      </div>
      <span className="t-h3 !text-[15px]">{formatINR(item.pricePaise)}</span>
    </div>
  );
}

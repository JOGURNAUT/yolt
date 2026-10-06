import Link from "next/link";
import { Stars } from "@/components/stars";
import { formatINR } from "@/lib/format";
import { firstName, formatDay } from "@/lib/store-format";

export type ReviewView = {
  id: string;
  rating: number;
  body: string | null;
  photoUrls: string[];
  sellerReply: string | null;
  createdAt: Date | string;
  buyerName: string | null;
  itemPricePaise: number;
  itemSlug: string | null;
  item: { title: string; tagSize: string | null; photoUrl: string | null };
};

/**
 * ReviewCard (board C5): first name, stars, date, text, up to three buyer photos, the piece that was
 * bought (it keeps showing after the piece sells) and the store's reply.
 */
export function ReviewCard({ review: r, storeName }: { review: ReviewView; storeName: string }) {
  const name = firstName(r.buyerName);
  const bought = (
    <>
      {r.item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- snapshot of the item bought
        <img src={r.item.photoUrl} alt="" className="aspect-[4/5] w-10 rounded-md object-cover lg:w-full lg:rounded-[10px]" />
      ) : (
        <span aria-hidden="true" className="ph !w-10 !rounded-md lg:!w-full lg:!rounded-[10px]" />
      )}
      <span className="t-caption muted hidden lg:block">Bought</span>
      <span className="t-small">
        <strong>
          <span className="lg:hidden">Bought: </span>
          {r.item.title}
        </strong>
        <span className="lg:block lg:text-muted">
          <span className="lg:hidden"> · </span>
          {[r.item.tagSize, formatINR(r.itemPricePaise)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
  const boughtClass =
    "flex items-center gap-2.5 rounded-xl bg-surface-2 p-2 !no-underline lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex-col lg:items-stretch lg:gap-2 lg:self-start lg:rounded-[14px] lg:p-2.5";

  return (
    <article className="card flex flex-col gap-2.5 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-x-5 lg:p-5">
      <div className="flex items-center justify-between gap-3 lg:col-start-1 lg:justify-start">
        <span className="t-h3">{name}</span>
        <Stars rating={r.rating} className="hidden lg:inline-flex" />
        <span className="t-small muted">{formatDay(r.createdAt)}</span>
      </div>
      <Stars rating={r.rating} className="lg:hidden" />
      {r.body && <p className="t-body lg:t-body-lg lg:col-start-1">{r.body}</p>}
      {r.photoUrls.length > 0 && (
        <div className="flex gap-1.5 lg:col-start-1 lg:gap-2">
          {r.photoUrls.slice(0, 3).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element -- buyer's review photo
            <img key={u} src={u} alt={`Photo from ${name}`} className="aspect-[4/5] w-[72px] rounded-[10px] object-cover lg:w-[84px]" />
          ))}
        </div>
      )}
      {r.itemSlug ? (
        <Link href={`/p/${r.itemSlug}`} className={boughtClass} style={{ color: "var(--foreground)" }}>
          {bought}
        </Link>
      ) : (
        <div className={boughtClass}>{bought}</div>
      )}
      {r.sellerReply && (
        <div className="rounded-xl bg-surface-2 px-3 py-2.5 lg:col-start-1">
          <span className="t-caption muted">Reply from {storeName}</span>
          <p className="t-small mt-1">{r.sellerReply}</p>
        </div>
      )}
    </article>
  );
}

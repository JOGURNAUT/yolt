import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { initials } from "@/lib/store-format";
import { ShowPhotoButton } from "./show-photo-button";

/** ConditionBlock (board C5): the grade and what it means, in the exact words. */
export function ConditionBlock({ label, meaning }: { label: string; meaning: string }) {
  return (
    <section aria-label="Condition" className="card flex flex-col gap-1 px-4 py-3.5 lg:px-[18px] lg:py-4">
      <span className="t-caption muted">Condition</span>
      <span className="t-h3">{label}</span>
      <span className="t-small muted">{meaning}</span>
    </section>
  );
}

type FlawPhoto = { id: string; position: number };

/**
 * FlawList (board C5): always present. Flaws are one text field written by the seller, so each line
 * is one flaw; when there is exactly one flaw photo per line they link to each other, otherwise
 * every flaw photo is offered under the list.
 */
export function FlawList({ flaws, noFlawsConfirmed, photos }: { flaws: string | null; noFlawsConfirmed: boolean; photos: FlawPhoto[] }) {
  const lines = (flaws ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const paired = lines.length > 0 && lines.length === photos.length;
  return (
    <section aria-labelledby="flaws-h" className="card flex flex-col gap-2 px-4 py-3.5 lg:px-[18px] lg:py-4">
      <h2 id="flaws-h" className="t-h3 !normal-case !tracking-normal">
        Flaws
      </h2>
      {lines.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1">
            {lines.map((line, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-foreground" />
                <span className="t-body grow">{line}</span>
                {paired && <ShowPhotoButton photoId={photos[i]!.id} n={photos[i]!.position + 1} />}
              </li>
            ))}
          </ul>
          {!paired && photos.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-4 border-t border-line pt-1">
              <span className="t-small muted">Flaw photos</span>
              {photos.map((p) => (
                <ShowPhotoButton key={p.id} photoId={p.id} n={p.position + 1} />
              ))}
            </p>
          )}
        </>
      ) : noFlawsConfirmed ? (
        <p className="t-body flex items-center gap-2">
          <Check aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
          Seller confirmed: no flaws.
        </p>
      ) : (
        <p className="t-body muted">The seller hasn&apos;t said whether there are flaws. Ask before you buy, or check the photos.</p>
      )}
    </section>
  );
}

/** SellerCard (board C4): who is selling, how fast they ship, and what "Identity verified" does and doesn't mean. */
export function SellerCard({
  handle,
  name,
  logoUrl,
  dispatchDays,
  rating,
  verified,
}: {
  handle: string;
  name: string;
  logoUrl: string | null;
  dispatchDays: number;
  rating: { average: number | null; total: number };
  verified: boolean;
}) {
  return (
    <section aria-label="Seller" className="card flex flex-col gap-3 p-4 lg:px-[18px]">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0d0d0c] text-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller's uploaded logo
            <img src={logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden="true" className="wordmark text-sm">
              {initials(name)}
            </span>
          )}
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="t-h3">{name}</span>
          <span className="t-small muted">
            {rating.average !== null && `★ ${rating.average.toFixed(1)} (${rating.total}) · `}Ships in {dispatchDays} {dispatchDays === 1 ? "day" : "days"}
          </span>
        </span>
        <ButtonLink href={`/s/${handle}`} variant="secondary" size="sm" className="!h-11">
          Visit store
        </ButtonLink>
      </div>
      {verified && (
        <p className="t-small flex items-start gap-1.5">
          <VerifiedBadge className="shrink-0" />
          <span className="muted">PAN and bank checked. Items are not authenticated by YOLT.</span>
        </p>
      )}
    </section>
  );
}

/** ProtectionNote (board WebProduct): the exact line, never reworded. */
export function ProtectionNote() {
  return (
    <section aria-label="Buyer protection" className="card flex items-start gap-2.5 px-4 py-3.5 lg:px-[18px]">
      <ShieldCheck aria-hidden className="ic mt-px" strokeWidth={ICON_STROKE} />
      <p className="t-small">
        No size returns: check the measurements. Full refund if it isn&apos;t as described, arrives damaged, or never arrives.{" "}
        <Link href="/legal/buyer-protection" className="font-bold">
          Buyer protection
        </Link>
      </p>
    </section>
  );
}

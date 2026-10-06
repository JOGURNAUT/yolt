import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Measurements } from "@yolt/db";
import { BuyButton } from "@/components/buy-button";
import { ButtonLink } from "@/components/ui/button";
import { GarmentImage } from "@/components/garment-image";
import { PincodeCheck } from "@/components/pincode-check";
import { AddToBagButton, SaveButton } from "@/components/shop-buttons";
import { ProductGrid } from "@/components/product-card";
import { CONDITION, formatIST, formatINR } from "@/lib/format";
import { getListing, getMoreFromStore } from "@/lib/server/queries";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const data = await getListing((await params).slug);
  return data ? { title: data.listing.title } : {};
}

const MEASUREMENT_LABELS: [keyof Measurements, string][] = [
  ["chestCm", "Chest"],
  ["waistCm", "Waist"],
  ["hipCm", "Hip"],
  ["shoulderCm", "Shoulder"],
  ["sleeveCm", "Sleeve"],
  ["lengthCm", "Length"],
  ["inseamCm", "Inseam"],
  ["footLengthCm", "Foot length"],
];

const AUTH_SENSITIVE = new Set(["sneakers", "luxury", "bags"]);

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const data = await getListing((await params).slug);
  if (!data) notFound();
  const { listing: l, seller, drop, photos } = data;
  const more = await getMoreFromStore(seller.id, l.id);

  const sold = l.status === "SOLD" || l.status === "SOLD_ELSEWHERE";
  const reserved = l.status === "RESERVED" || l.status === "PAYMENT_PENDING";
  const withdrawn = l.status === "WITHDRAWN";
  const comingSoon = l.status === "SCHEDULED";
  const condition = CONDITION[l.condition];
  const measured = MEASUREMENT_LABELS.filter(([k]) => typeof l.measurements[k] === "number");
  const flat = l.measurements.basis === "FLAT";

  return (
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <div className={`overflow-hidden rounded-lg ${sold ? "opacity-70" : ""}`}>
            <GarmentImage src={photos[0]?.url ?? null} alt={l.title} category={l.category} />
          </div>
          {photos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(1).map((p) => (
                <div key={p.id} className="relative overflow-hidden rounded">
                  <GarmentImage src={p.url} alt={p.caption ?? p.kind} category={l.category} />
                  {p.kind === "FLAW" && (
                    <span className="absolute bottom-1 left-1 rounded bg-surface px-1 text-[10px] font-medium">Flaw</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {sold && <StatusBanner>Sold out. This piece found a home.</StatusBanner>}
          {withdrawn && <StatusBanner>No longer listed.</StatusBanner>}
          {reserved && (
            <StatusBanner>
              Reserved by another buyer. It may become available again in a few minutes if they don&apos;t complete
              payment.
            </StatusBanner>
          )}
          {comingSoon && (
            <StatusBanner>
              Coming soon{drop ? ` in ${drop.title}, ${formatIST(drop.startsAt)}` : ""}. It can&apos;t be bought until the
              drop opens.{" "}
              {drop && (
                <Link href={`/d/${drop.id}`} className="underline">
                  Go to the drop
                </Link>
              )}
            </StatusBanner>
          )}

          <div>
            <h1 className="text-xl font-bold">{l.title}</h1>
            <p className="mt-1 text-2xl font-semibold">{formatINR(l.pricePaise)}</p>
          </div>

          <dl className="space-y-1 text-sm">
            <Row label="Condition">
              <span className="font-medium">{condition?.label}</span> — {condition?.meaning}
            </Row>
            {l.tagSize && <Row label="Tag size">{l.tagSize}</Row>}
            {l.brandDeclared && (
              <Row label="Brand">
                {l.brandDeclared} <span className="text-muted">(declared by seller)</span>
              </Row>
            )}
          </dl>

          {AUTH_SENSITIVE.has(l.category) && l.brandDeclared && (
            <p className="rounded-md bg-surface p-3 text-xs text-muted">
              Brand is seller-declared and not authenticated by YOLT.
            </p>
          )}

          <section>
            <h2 className="text-sm font-semibold">Measurements</h2>
            {measured.length ? (
              <>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {measured.map(([k, label]) => (
                      <tr key={k} className="border-b border-line last:border-0">
                        <td className="py-1.5 text-muted">{label}</td>
                        <td className="py-1.5 text-right">
                          {l.measurements[k] as number} cm{" "}
                          <span className="text-muted">({((l.measurements[k] as number) / 2.54).toFixed(1)}″)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {l.measurements.basis && (
                  <p className="mt-1 text-xs text-muted">
                    {flat
                      ? "Measured flat, one side. Double chest, waist and hip to compare with a tape measure around you."
                      : "Measured all the way around."}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">The seller hasn&apos;t added measurements for this item.</p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold">Flaws</h2>
            <p className="mt-1 text-sm">
              {l.flaws ? l.flaws : l.noFlawsConfirmed ? "Seller confirmed: no flaws." : "Not specified."}
            </p>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 text-sm">
            <Link href={`/s/${seller.handle}`} className="font-medium hover:underline">
              {seller.displayName}
            </Link>
            <p className="text-muted">Usually ships in {seller.dispatchDays} days.</p>
            {!sold && !withdrawn && (
              <div className="mt-3">
                <PincodeCheck listingId={l.id} />
              </div>
            )}
            <p className="mt-2">
              Shipping {formatINR(seller.shippingFeePaise)}
              {seller.freeShippingAbovePaise !== null && `, free above ${formatINR(seller.freeShippingAbovePaise)}`}.
            </p>
            <p className="mt-1 text-muted">
              No size returns: check the measurements. Full refund if it isn&apos;t as described, arrives damaged, or never
              arrives.
            </p>
          </section>

          {l.status === "AVAILABLE" && (
            <div className="space-y-2">
              <BuyButton listingId={l.id} pricePaise={l.pricePaise} />
              <AddToBagButton listingId={l.id} />
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <SaveButton listingId={l.id} />
            <span className="text-muted">Save to find it later</span>
          </div>
          {(sold || withdrawn) && (
            <div className="space-y-2">
              <ButtonLink href={`/search?cat=${l.category}`} size="lg" block>
                Find similar pieces
              </ButtonLink>
              <ButtonLink href={`/s/${seller.handle}`} variant="secondary" size="lg" block>
                See what&apos;s in stock at {seller.displayName}
              </ButtonLink>
            </div>
          )}
        </div>
      </div>

      {more.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">More from {seller.displayName}</h2>
          <ProductGrid items={more} />
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function StatusBanner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-line bg-surface p-3 text-sm font-medium">{children}</p>;
}

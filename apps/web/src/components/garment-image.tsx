import { cx } from "@/components/ui/cx";

/**
 * A 4:5 photo (`.ph`, board C8). Real photos come from sellers; until a listing has one, a labelled
 * placeholder.
 */
export function GarmentImage({ src, alt, category, className }: { src: string | null; alt: string; category: string; className?: string }) {
  if (src) {
    return (
      <div className={cx("ph", className)}>
        <div className="shot">
          {/* eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the media loader exists */}
          <img src={src} alt={alt} loading="lazy" />
        </div>
      </div>
    );
  }
  return (
    <div role="img" aria-label={`${alt} (photo coming soon)`} className={cx("ph", className)}>
      <div className="shot">
        <span className="t-caption uppercase muted">{category}</span>
      </div>
    </div>
  );
}

/** The photo inside a card: front, plus the back photo when the card has one (shown on hover). */
export function CardPhoto({ src, backSrc, alt, category }: { src: string | null; backSrc?: string | null; alt: string; category: string }) {
  if (!src) return <GarmentImage src={null} alt={alt} category={category} />;
  return (
    <div className="ph">
      <div className="shot">
        {/* eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the media loader exists */}
        <img src={src} alt={alt} loading="lazy" />
      </div>
      {backSrc && (
        <div className="shot back" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- hover photo, decorative */}
          <img src={backSrc} alt="" loading="lazy" />
        </div>
      )}
    </div>
  );
}

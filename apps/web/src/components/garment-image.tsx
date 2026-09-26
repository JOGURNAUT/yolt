/* Real garment photos come from sellers (R2 upload is next). Until then, a labelled placeholder. */
export function GarmentImage({ src, alt, category }: { src: string | null; alt: string; category: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the R2 loader exists
    return <img src={src} alt={alt} className="aspect-[4/5] w-full object-cover" />;
  }
  return (
    <div
      role="img"
      aria-label={`${alt} (photo coming soon)`}
      className="flex aspect-[4/5] w-full items-center justify-center bg-placeholder text-xs uppercase tracking-wider text-muted"
    >
      {category}
    </div>
  );
}

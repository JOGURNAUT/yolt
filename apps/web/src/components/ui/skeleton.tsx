import { cx } from "./cx";

/** Skeleton (board C2): a shimmering placeholder block. Size it with classes; hidden from screen readers. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cx("sk", className)} style={style} />;
}

/** A ProductCard-shaped skeleton. */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <Skeleton className="aspect-[4/5] rounded-lg" />
      <Skeleton className="h-3 w-[90%]" />
      <Skeleton className="h-2.5 w-[60%]" />
    </div>
  );
}

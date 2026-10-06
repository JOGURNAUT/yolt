import { Search } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";

/** SearchBar (board C1). A plain GET form, so search works before JavaScript loads. */
export function SearchBar({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return (
    <form action="/search" method="get" role="search" className={cx("search", className)}>
      <Search aria-hidden className="ic" strokeWidth={ICON_STROKE} />
      <input type="search" name="q" aria-label="Search" placeholder="Search jackets, denim, stores…" defaultValue={defaultValue} />
    </form>
  );
}

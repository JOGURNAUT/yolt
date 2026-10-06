export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span className={className} aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <span aria-hidden="true">
        {"★".repeat(full)}
        <span className="text-muted">{"☆".repeat(5 - full)}</span>
      </span>
    </span>
  );
}

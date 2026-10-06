"use client";

import { Button } from "../ui/button";

/** Reload the page you were on once you're back online. */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  return (
    <Button size="lg" block onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}

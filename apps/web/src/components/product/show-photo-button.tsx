"use client";

import { Camera } from "lucide-react";
import { ICON_STROKE } from "@/components/ui/cx";
import { SHOW_PHOTO_EVENT } from "./photo-gallery";

/** A "Photo 5" link in the flaw list: opens that photo in the gallery. */
export function ShowPhotoButton({ photoId, n }: { photoId: string; n: number }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(SHOW_PHOTO_EVENT, { detail: { id: photoId } }))}
      className="btn btn-ghost btn-sm !h-auto min-h-11 shrink-0 gap-1 !px-0"
    >
      <Camera aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
      Photo {n}
      <span className="sr-only"> of the flaw</span>
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { Sticker } from "@/components/ui/sticker";
import "@/styles/product.css";

export type GalleryPhoto = { id: string; url: string; kind: string; caption: string | null };

const KIND_LABEL: Record<string, string> = {
  FRONT: "Front",
  BACK: "Back",
  LABEL: "Label",
  DETAIL: "Detail",
  FLAW: "Flaw",
  PROOF_OF_PURCHASE: "Receipt",
};

/** Event the flaw list fires so a "Photo 5" link opens that photo here. */
export const SHOW_PHOTO_EVENT = "yolt:show-photo";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * PhotoGallery (board C5): swipe through the photos (a scroll-snap track, so it works with touch,
 * trackpad and keyboard), thumbnails with their kind, a Flaw tag on flaw close-ups, and tap to zoom.
 * Sold pieces are muted. The status sticker sits on the photo so it shows before anything else.
 */
export function PhotoGallery({
  photos,
  title,
  category,
  muted = false,
  status,
  children,
}: {
  photos: GalleryPhoto[];
  title: string;
  category: string;
  muted?: boolean;
  status?: string;
  children?: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const current = photos[index];
  const labelOf = (p: GalleryPhoto) => p.caption ?? KIND_LABEL[p.kind] ?? "Photo";

  const goTo = useCallback((i: number) => {
    setIndex(i);
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: reduceMotion() ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const onShow = (e: Event) => {
      const i = photos.findIndex((p) => p.id === (e as CustomEvent<{ id: string }>).detail.id);
      if (i < 0) return;
      goTo(i);
      root.current?.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    };
    window.addEventListener(SHOW_PHOTO_EVENT, onShow);
    return () => window.removeEventListener(SHOW_PHOTO_EVENT, onShow);
  }, [photos, goTo]);

  if (photos.length === 0) {
    return (
      <div className="relative">
        <div role="img" aria-label={`${title} (photo coming soon)`} className="ph">
          <div className="shot">
            <span className="t-caption uppercase muted">{category}</span>
          </div>
        </div>
        {status && (
          <Sticker tone={status === "Sold out" ? "ink" : "accent"} className="absolute left-4 top-4">
            {status}
          </Sticker>
        )}
        <div className="absolute right-3 top-3">{children}</div>
      </div>
    );
  }

  return (
    <div ref={root} className={cx("pg", muted && "is-muted")}>
      <div className="pg-main">
        <div
          ref={track}
          className="pg-track"
          role="group"
          aria-roledescription="carousel"
          aria-label={`Photos of ${title}`}
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== index && i >= 0 && i < photos.length) setIndex(i);
          }}
        >
          {photos.map((p, i) => (
            <div key={p.id} className="pg-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`}>
              <button type="button" onClick={() => setZoom(true)} aria-label={`Zoom in: ${labelOf(p)}, photo ${i + 1} of ${photos.length}`}>
                <div className="ph">
                  <div className="shot">
                    {/* eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the media loader exists */}
                    <img src={p.url} alt={`${title}: ${labelOf(p)}`} loading={i === 0 ? "eager" : "lazy"} draggable={false} />
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>

        {status && (
          <Sticker tone={status === "Sold out" ? "ink" : "accent"} className="absolute left-4 top-4">
            {status}
          </Sticker>
        )}
        <div className="absolute right-3 top-3">{children}</div>
        {current?.kind === "FLAW" && (
          <Sticker tone="ink" className="absolute bottom-12 left-4 !h-[30px] !px-3.5 !text-[13px]">
            Flaw
          </Sticker>
        )}
        <span className="pointer-events-none absolute bottom-3 left-4 max-w-[60%] rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold leading-tight text-[#0d0d0c] lg:bottom-[18px] lg:left-[18px] lg:text-xs">
          {current && labelOf(current)}
        </span>
        <span className="t-mono pointer-events-none absolute bottom-3 right-4 rounded-lg bg-[#0d0d0c] px-2 py-1 !text-[11px] text-white lg:bottom-[18px] lg:right-[18px] lg:!text-xs">
          {index + 1} / {photos.length}
          <span className="hidden lg:inline"> · click to zoom</span>
        </span>
      </div>

      {photos.length > 1 && (
        <div role="group" aria-label="Photos" className="pg-thumbs">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Photo ${i + 1}: ${labelOf(p)}`}
              aria-pressed={i === index}
              onClick={() => goTo(i)}
              className={cx("pg-thumb", p.kind === "FLAW" && "is-flaw")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
              <img src={p.url} alt="" loading="lazy" />
              <span className="lbl">{KIND_LABEL[p.kind] ?? "Photo"}</span>
            </button>
          ))}
        </div>
      )}

      <p className="t-caption muted lg:hidden">{photos.length > 1 ? "Swipe for more · tap to zoom" : "Tap to zoom"}</p>

      {zoom && current && (
        <Lightbox
          photos={photos}
          index={index}
          title={title}
          labelOf={labelOf}
          onIndex={goTo}
          onClose={() => setZoom(false)}
        />
      )}
    </div>
  );
}

/** Full-screen view: a native modal dialog (focus is trapped and Esc closes it); tap the photo to magnify. */
function Lightbox({
  photos,
  index,
  title,
  labelOf,
  onIndex,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number;
  title: string;
  labelOf: (p: GalleryPhoto) => string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [magnified, setMagnified] = useState(false);
  const p = photos[index]!;

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (d?.open) d.close();
      opener?.focus?.();
    };
  }, []);

  const move = (to: number) => {
    setMagnified(false);
    onIndex(to);
  };

  return (
    <dialog
      ref={dialog}
      className="pg-dialog"
      aria-label={`${title}, photo ${index + 1} of ${photos.length}`}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" && index > 0) move(index - 1);
        if (e.key === "ArrowRight" && index < photos.length - 1) move(index + 1);
      }}
    >
      <div className="bar-top">
        <span className="t-small">
          {index + 1} / {photos.length} · {labelOf(p)}
        </span>
        <IconButton label="Close" onClick={() => dialog.current?.close()}>
          <X aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        </IconButton>
      </div>
      <div className={cx("stage", magnified && "is-zoomed")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-size photo */}
        <img src={p.url} alt={`${title}: ${labelOf(p)}`} onClick={() => setMagnified((m) => !m)} />
      </div>
      <div className="bar-bottom">
        <IconButton label="Previous photo" disabled={index === 0} onClick={() => move(index - 1)}>
          <ChevronLeft aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        </IconButton>
        <span className="t-caption opacity-80">{magnified ? "Tap the photo to zoom out" : "Tap the photo to zoom in"}</span>
        <IconButton label="Next photo" disabled={index === photos.length - 1} onClick={() => move(index + 1)}>
          <ChevronRight aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        </IconButton>
      </div>
    </dialog>
  );
}

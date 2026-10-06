"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { MAX_PHOTOS, PHOTO_KIND_LABELS, type PhotoKind } from "@yolt/shared";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { Sticker } from "@/components/ui/sticker";
import { shrinkForUpload } from "@/lib/client/image";

export type Photo = { id: string; url: string; kind: string; position: number };

const UPLOAD_ERRORS: Record<string, string> = {
  INVALID_IMAGE: "That photo couldn't be used.",
  TOO_MANY_PHOTOS: `You can add up to ${MAX_PHOTOS} photos.`,
  PHOTO_TOO_LARGE: "That photo is too large.",
  NOT_EDITABLE: "This item can't be edited right now.",
};

/**
 * PhotoSlots (board C6): guided slots for Front, Back, Label / size tag and, once flaws are described,
 * a Flaw close-up; every upload gets a type label, the first is the Cover. Up to 12 photos.
 */
export function PhotoManager({
  listingId,
  photos,
  onChange,
  requireBackAndLabel,
  requireFlaw,
}: {
  listingId: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  requireBackAndLabel: boolean;
  requireFlaw: boolean;
}) {
  const [uploading, setUploading] = useState<PhotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraKind, setExtraKind] = useState<PhotoKind>("DETAIL");
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<PhotoKind>("FRONT");

  const kinds = new Set(photos.map((p) => p.kind));
  const guided: PhotoKind[] = ["FRONT", ...(requireBackAndLabel ? (["BACK", "LABEL"] as const) : []), ...(requireFlaw ? (["FLAW"] as const) : [])];
  const missingGuided = guided.filter((k) => !kinds.has(k));

  function pick(kind: PhotoKind) {
    pendingKind.current = kind;
    fileInput.current?.click();
  }

  async function upload(file: File) {
    const kind = pendingKind.current;
    setUploading(kind);
    setError(null);
    try {
      const blob = await shrinkForUpload(file);
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", blob, "photo.jpg");
      const res = await fetch(`/api/seller/listings/${listingId}/photos`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { photo?: Photo; error?: string; details?: string };
      if (res.ok && body.photo) onChange([...photos, body.photo]);
      else setError(body.error === "INVALID_IMAGE" && body.details ? body.details : (UPLOAD_ERRORS[body.error ?? ""] ?? "Upload failed. Try again."));
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(photo: Photo) {
    setError(null);
    const res = await fetch(`/api/seller/listings/${listingId}/photos/${photo.id}`, { method: "DELETE" });
    if (res.ok) onChange(photos.filter((p) => p.id !== photo.id));
    else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "WOULD_BREAK_LIVE_LISTING" ? "This item is live and needs this photo. Add a replacement first." : "Couldn't remove that photo.");
    }
  }

  async function makeCover(photo: Photo) {
    const ordered = [photo, ...photos.filter((p) => p.id !== photo.id)];
    const res = await fetch(`/api/seller/listings/${listingId}/photos/order`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoIds: ordered.map((p) => p.id) }),
    });
    if (res.ok) onChange(ordered.map((p, i) => ({ ...p, position: i })));
  }

  const label = (kind: string) => PHOTO_KIND_LABELS[kind as PhotoKind] ?? kind;

  return (
    <div className="space-y-3">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p, i) => (
          <figure key={p.id} className="m-0 flex flex-col gap-1">
            <div className="slot !p-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- seller preview of their own upload */}
              <img src={p.url} alt={label(p.kind)} className="size-full object-cover" />
              {i === 0 && (
                <Sticker tone="ink" className="!absolute !left-1.5 !top-2 !h-5 !text-[9px]">
                  Cover
                </Sticker>
              )}
            </div>
            <figcaption className="t-caption flex flex-col !font-semibold">
              <span>{label(p.kind)}</span>
              <span className="flex flex-wrap items-center gap-x-1">
                {i !== 0 && (
                  <button type="button" onClick={() => makeCover(p)} className="muted -ml-1 min-h-11 px-1 !font-semibold underline">
                    Make cover
                  </button>
                )}
                <button type="button" onClick={() => remove(p)} className="-ml-1 min-h-11 px-1 !font-semibold text-danger underline" aria-label={`Remove ${label(p.kind)}`}>
                  Remove
                </button>
              </span>
            </figcaption>
          </figure>
        ))}

        {missingGuided.map((kind) => (
          <div key={kind} className="flex flex-col gap-1">
            <button type="button" onClick={() => pick(kind)} disabled={uploading !== null} className={cx("slot is-required")}>
              {uploading === kind ? <LoaderCircle aria-hidden className="ic motion-safe:animate-spin" strokeWidth={ICON_STROKE} /> : <Camera aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />}
              {uploading === kind ? "Uploading…" : `Add ${PHOTO_KIND_LABELS[kind].toLowerCase()}`}
            </button>
            <span className="t-caption muted">Required</span>
          </div>
        ))}
      </div>

      {photos.length < MAX_PHOTOS && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="t-small flex items-center gap-2 font-semibold">
            Add another:
            <select className="input !h-11 !w-auto" value={extraKind} onChange={(e) => setExtraKind(e.target.value as PhotoKind)}>
              {(["DETAIL", "FLAW", "BACK", "LABEL", "PROOF_OF_PURCHASE"] as const).map((k) => (
                <option key={k} value={k}>
                  {PHOTO_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => pick(extraKind)} disabled={uploading !== null} className="btn btn-sm btn-secondary !h-11">
            {uploading && !missingGuided.includes(uploading) ? "Uploading…" : "Choose photo"}
          </button>
        </div>
      )}

      <p className="help">
        {photos.length} of {MAX_PHOTOS} · Location data is removed from your photos
      </p>
      <p role="alert" aria-live="polite" className="t-small font-semibold text-danger">
        {error}
      </p>
    </div>
  );
}

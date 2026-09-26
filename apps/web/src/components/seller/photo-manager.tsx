"use client";

import { useRef, useState } from "react";
import { MAX_PHOTOS, PHOTO_KIND_LABELS, type PhotoKind } from "@yolt/shared";
import { shrinkForUpload } from "@/lib/client/image";

export type Photo = { id: string; url: string; kind: string; position: number };

const UPLOAD_ERRORS: Record<string, string> = {
  INVALID_IMAGE: "That photo couldn't be used.",
  TOO_MANY_PHOTOS: `You can add up to ${MAX_PHOTOS} photos.`,
  PHOTO_TOO_LARGE: "That photo is too large.",
  NOT_EDITABLE: "This item can't be edited right now.",
};

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

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <figure key={p.id} className="space-y-1">
            <div className="relative overflow-hidden rounded-md border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- seller preview of their own upload */}
              <img src={p.url} alt={PHOTO_KIND_LABELS[p.kind as PhotoKind] ?? p.kind} className="aspect-[4/5] w-full object-cover" />
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-surface px-1.5 text-[10px] font-medium">Cover</span>}
            </div>
            <figcaption className="flex items-center justify-between text-xs">
              <span>{PHOTO_KIND_LABELS[p.kind as PhotoKind] ?? p.kind}</span>
              <span className="flex gap-2">
                {i !== 0 && (
                  <button type="button" onClick={() => makeCover(p)} className="text-muted hover:underline">
                    Cover
                  </button>
                )}
                <button type="button" onClick={() => remove(p)} className="text-danger hover:underline" aria-label={`Remove ${PHOTO_KIND_LABELS[p.kind as PhotoKind] ?? "photo"}`}>
                  Remove
                </button>
              </span>
            </figcaption>
          </figure>
        ))}

        {missingGuided.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => pick(kind)}
            disabled={uploading !== null}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line p-2 text-center text-xs hover:border-foreground disabled:opacity-50"
          >
            <span className="text-lg" aria-hidden="true">+</span>
            {uploading === kind ? "Uploading…" : `Add ${PHOTO_KIND_LABELS[kind].toLowerCase()}`}
          </button>
        ))}
      </div>

      {photos.length < MAX_PHOTOS && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Add another:</span>
          <select className="rounded-md border border-line bg-background px-2 py-1" value={extraKind} onChange={(e) => setExtraKind(e.target.value as PhotoKind)}>
            {(["DETAIL", "FLAW", "BACK", "LABEL", "PROOF_OF_PURCHASE"] as const).map((k) => (
              <option key={k} value={k}>
                {PHOTO_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => pick(extraKind)} disabled={uploading !== null} className="rounded-full border border-line px-3 py-1 hover:border-foreground disabled:opacity-50">
            {uploading && !missingGuided.includes(uploading) ? "Uploading…" : "Choose photo"}
          </button>
        </div>
      )}

      <p role="alert" aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
    </div>
  );
}

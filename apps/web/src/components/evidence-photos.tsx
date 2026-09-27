"use client";

import { useRef, useState } from "react";
import { shrinkForUpload } from "@/lib/client/image";

/** Photo picker for claims and reviews. Uploads go through the server, which strips location data. */
export function EvidencePhotos({ urls, onChange, max }: { urls: string[]; onChange: (urls: string[]) => void; max: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", await shrinkForUpload(file), "photo.jpg");
      const res = await fetch("/api/uploads/evidence", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { url?: string; details?: string };
      if (res.ok && body.url) onChange([...urls, body.url]);
      else setError(body.details ?? "That photo couldn't be uploaded.");
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- user's own upload preview */}
            <img src={u} alt="Your photo" className="size-20 rounded object-cover" />
            <button type="button" onClick={() => onChange(urls.filter((x) => x !== u))} className="absolute -right-1 -top-1 rounded-full bg-surface px-1.5 text-xs shadow" aria-label="Remove photo">
              ×
            </button>
          </div>
        ))}
        {urls.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex size-20 items-center justify-center rounded border-2 border-dashed border-line text-xs disabled:opacity-50">
            {busy ? "Uploading…" : "+ Photo"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * SysError for failures in the root layout itself. It replaces the layout, so there is no header,
 * no web font and no theme script: just the tokens from globals.css and the system font.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body className="flex min-h-screen items-center justify-center px-4 font-sans">
        <main className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="t-h1">Something snagged</h1>
          <p className="t-body muted">That one&rsquo;s on us. Try again in a moment.</p>
          {error.digest && <p className="t-mono muted !text-[13px]">Ref {error.digest}</p>}
          <button type="button" className="btn btn-primary btn-lg" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

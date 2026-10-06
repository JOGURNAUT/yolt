"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SystemPage } from "@/components/system/system-page";
import { Button, ButtonLink } from "@/components/ui/button";

/** SysError: something threw while rendering this page. Retry re-fetches it; nothing is lost. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemPage
      tag="Oops"
      title="Something snagged"
      actions={
        <>
          <Button size="lg" block onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/" variant="ghost" size="sm" className="!h-11">
            Back to home
          </ButtonLink>
        </>
      }
    >
      <p>
        That one&rsquo;s on us. Your bag and saved pieces are safe. Try again, and if it keeps happening,{" "}
        <Link href="/legal/grievance" className="underline">
          tell us
        </Link>
        .
      </p>
      {error.digest && <p className="t-mono muted !text-[13px]">Ref {error.digest}</p>}
    </SystemPage>
  );
}

import { ButtonLink } from "../ui/button";
import { SystemPage } from "./system-page";

/**
 * SysExpired: what a protected page shows when the session lapsed. Sign-in returns to `next`,
 * so nothing the person was doing is lost.
 */
export function SessionExpired({ next }: { next: string }) {
  return (
    <SystemPage
      tag="Signed out"
      title="Your session ended"
      actions={
        <>
          <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg" block>
            Sign in again
          </ButtonLink>
          <ButtonLink href="/" variant="ghost" size="sm" className="!h-11">
            Back to home
          </ButtonLink>
        </>
      }
    >
      <p>For your safety you&rsquo;re signed out after a while. Sign in again and you&rsquo;ll land right back where you were.</p>
    </SystemPage>
  );
}

import { SignInSheet } from "@/components/sign-in-sheet";
import { parseReason, REASON_LINES, safeNext } from "@/lib/safe-next";

/** /login from inside the app (Buy now, Follow, Remind me, Sign in) opens as a sheet over the current page. */
export default async function LoginSheet({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const reason = parseReason(sp.for, next);
  return <SignInSheet next={next} context={reason ? REASON_LINES[reason] : null} />;
}

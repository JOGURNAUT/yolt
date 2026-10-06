"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "./login-form";
import { BottomSheet } from "./ui/bottom-sheet";

/** Sign-in as a sheet over the page that asked for it (board SignIn). Closing goes back to that page. */
export function SignInSheet({ next, context }: { next: string; context: string | null }) {
  const router = useRouter();
  return (
    <BottomSheet title="Sign in" description={context} onClose={() => router.back()}>
      <LoginForm next={next} />
    </BottomSheet>
  );
}

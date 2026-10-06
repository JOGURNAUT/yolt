import { GuestLanding } from "@/components/landing/guest-landing";
import { SignedInHome } from "@/components/landing/signed-in-home";
import { getCurrentUser } from "@/lib/server/session";

/** `/`: the landing page for guests, a quieter home for signed-in buyers. */
export default async function Home() {
  const user = await getCurrentUser();
  return user ? <SignedInHome user={user} /> : <GuestLanding />;
}

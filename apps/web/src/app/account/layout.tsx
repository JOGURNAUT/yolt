import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/account-nav";
import { getCurrentUser } from "@/lib/server/session";

/** Everything under /account needs a signed-in buyer; desktop adds the side navigation (board AccountDesktop). */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <AccountNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

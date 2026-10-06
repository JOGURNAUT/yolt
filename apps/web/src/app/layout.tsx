import type { Metadata, Viewport } from "next";
import { Archivo, DM_Mono, DM_Sans } from "next/font/google";
import { appEnv, envFlags } from "@/lib/env";
import { INSTALL_CAPTURE_SCRIPT, serviceWorkerEnabled } from "@/lib/pwa";
import { bagListingIds, getAdminRole, savedListingIds } from "@yolt/core";
import { BottomNav } from "@/components/shell/bottom-nav";
import { Footer } from "@/components/shell/footer";
import { Header } from "@/components/shell/header";
import { ShopStateProvider } from "@/components/shop-state";
import { SystemProviders } from "@/components/system/system-providers";
import { ServiceWorkerRegister } from "@/components/system/service-worker-register";
import { db } from "@/lib/server/db";
import { getCurrentSeller, getCurrentUser } from "@/lib/server/session";
import { formatIndianMobile } from "@yolt/shared";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Display: Archivo with its width axis, set wide (font-stretch 125%) in caps. Body: DM Sans. Timers and order IDs: DM Mono.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "YOLT — thrift, without the DMs", template: "%s · YOLT" },
  description: "One-of-one secondhand fashion from independent Indian thrift stores. Real measurements, honest flaws, safe checkout.",
  applicationName: "YOLT",
  appleWebApp: { capable: true, title: "YOLT", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-capable": "yes" },
};

// Browser and status-bar colour: the `background` token in light and dark. viewportFit lets the bottom nav use the safe area.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0a" },
  ],
};

export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  const [user, seller] = await Promise.all([getCurrentUser(), getCurrentSeller()]);
  const [isAdmin, saved, bag] = user
    ? await Promise.all([getAdminRole(db, user.userId).then((r) => r !== null), savedListingIds(db, user.userId), bagListingIds(db, user.userId)])
    : [false, [], []];
  return (
    <html lang="en-IN" className={`${archivo.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before first paint, so there is no flash of the other theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col pb-[var(--bnav-h)] font-sans">
        <ServiceWorkerRegister enabled={serviceWorkerEnabled(appEnv(), process.env.NODE_ENV)} />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SystemProviders>
          <ShopStateProvider signedIn={user !== null} initialSaved={saved} initialBag={bag}>
            <Header
              phone={user?.phone ? formatIndianMobile(user.phone) : null}
              isSeller={seller !== null}
              isAdmin={isAdmin}
              devLogin={envFlags().devLogin}
            />
            <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1248px] flex-1 px-4 pb-16 pt-4 lg:px-6 lg:pt-6">{children}</main>
            <Footer />
            <BottomNav />
            {modal}
          </ShopStateProvider>
        </SystemProviders>
      </body>
    </html>
  );
}

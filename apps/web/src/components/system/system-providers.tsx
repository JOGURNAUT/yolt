"use client";

import { ToastProvider } from "../ui/toast-provider";
import { InstallCard, InstallPromptProvider } from "./install-prompt";

/** Toasts and the install hint, mounted once in the root layout. */
export function SystemProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <InstallPromptProvider>
        {children}
        <InstallCard />
      </InstallPromptProvider>
    </ToastProvider>
  );
}

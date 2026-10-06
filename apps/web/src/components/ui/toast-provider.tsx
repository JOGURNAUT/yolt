"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Toast } from "./toast";

type ToastTone = "success" | "error" | "info";
type ToastOptions = { tone?: ToastTone; action?: { label: string; onClick: () => void } };
type Item = ToastOptions & { id: number; message: string };

const ToastContext = createContext<{ toast: (message: string, options?: ToastOptions) => void }>({ toast: () => {} });

/** Show a toast from anywhere: `const { toast } = useToast(); toast("Link copied", { tone: "success" })`. */
export const useToast = () => useContext(ToastContext);

const MAX_VISIBLE = 3;
const SHOW_MS = 4000;

/**
 * Toast host (board PromptToasts). Toasts stack above the bottom nav, last in at the bottom, and
 * go after 4 s, or stay until dismissed when they carry an action (so the action can be reached).
 * Existing screens with their own local toasts (drop-live, share-button) keep working unchanged.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((i) => i.id !== id)), []);
  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    setItems((all) => [...all, { id: nextId.current++, message, ...options }].slice(-MAX_VISIBLE));
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-50 mx-auto flex max-w-md flex-col gap-2">
        {items.map((i) => (
          <ToastItem key={i.id} item={i} onDismiss={() => dismiss(i.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }: { item: Item; onDismiss: () => void }) {
  // The timer runs once per toast; a newer toast re-rendering the list must not restart it.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  const hasAction = Boolean(item.action);
  useEffect(() => {
    if (hasAction) return;
    const t = setTimeout(() => dismissRef.current(), SHOW_MS);
    return () => clearTimeout(t);
  }, [hasAction]);

  return (
    <Toast
      tone={item.tone}
      onDismiss={onDismiss}
      className="pointer-events-auto"
      action={
        item.action && (
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 font-bold underline decoration-accent decoration-2 underline-offset-4"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
          >
            {item.action.label}
          </button>
        )
      }
    >
      {item.message}
    </Toast>
  );
}

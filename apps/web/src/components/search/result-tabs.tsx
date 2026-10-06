"use client";

import { useId, useState } from "react";
import "@/styles/search.css";

/**
 * The Products and Stores tabs (board Search). Both panels are rendered by the server; this only
 * decides which one shows, so the URL keeps the same search parameters it always had.
 */
export function ResultTabs({
  productsLabel,
  storesLabel,
  products,
  stores,
}: {
  productsLabel: string;
  storesLabel: string;
  products: React.ReactNode;
  stores: React.ReactNode;
}) {
  const [tab, setTab] = useState<"products" | "stores">("products");
  const id = useId();
  const tabs = [
    ["products", productsLabel],
    ["stores", storesLabel],
  ] as const;

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tab === "products" ? "stores" : "products";
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Result type" className="rtabs" onKeyDown={onKey}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            id={`${id}-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-products-panel`} aria-labelledby={`${id}-products`} hidden={tab !== "products"}>
        {products}
      </div>
      <div role="tabpanel" id={`${id}-stores-panel`} aria-labelledby={`${id}-stores`} hidden={tab !== "stores"}>
        {stores}
      </div>
    </>
  );
}

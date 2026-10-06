"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchParamsToQuery } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import "@/styles/search.css";
import { FilterForm, type FilterOptions } from "./filter-form";

/** The desktop filter sidebar (board WebSearch). Rebuilt when the search changes, so it never shows stale choices. */
export function FilterSidebar({ options, count }: { options: FilterOptions; count: number }) {
  const key = searchParamsToQuery(options.params);
  return (
    <aside aria-label="Filters" className="hidden lg:block">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="t-h2">Filters{count > 0 ? ` · ${count}` : ""}</h2>
      </div>
      <FilterForm key={key} options={options} variant="sidebar" />
    </aside>
  );
}

/**
 * "Filters · N" and the FilterSheet it opens (board FilterSheet): a native dialog, so focus stays
 * inside, Escape closes it and the page behind is inert. Phones only; desktop has the sidebar.
 */
export function FilterSheetButton({ options, count }: { options: FilterOptions; count: number }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const key = searchParamsToQuery(options.params);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <Button ref={trigger} size="sm" className="!h-11 shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
        Filters · {count}
      </Button>
      <dialog
        ref={dialog}
        className="fsheet"
        aria-labelledby={headingId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        {open && (
          <>
            <div className="sheet !p-0 !shadow-none">
              <div className="handle" aria-hidden="true" />
              <div className="flex items-center justify-between pb-2 pl-5 pr-3">
                <h2 id={headingId} className="t-h1">
                  Filters
                </h2>
                <IconButton label="Close filters" plain onClick={close}>
                  <X aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
                </IconButton>
              </div>
            </div>
            <FilterForm key={key} options={options} variant="sheet" onDone={close} />
          </>
        )}
      </dialog>
    </>
  );
}

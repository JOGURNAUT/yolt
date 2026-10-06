"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminRequest } from "./admin-api";
import { ReasonDialog } from "./admin-ui";

type Status = "NEW" | "CONTACTED" | "ONBOARDED" | "REJECTED";

const MOVES: Record<Status, { to: Status; label: string; title: string; intro: string; danger?: boolean }[]> = {
  NEW: [
    { to: "CONTACTED", label: "Mark contacted", title: "Mark as contacted", intro: "You've called or messaged them on WhatsApp." },
    { to: "REJECTED", label: "Reject", title: "Reject this application", intro: "They can apply again later.", danger: true },
  ],
  CONTACTED: [
    { to: "ONBOARDED", label: "Mark onboarded", title: "Mark as onboarded", intro: "Create their store with the form above first. This only closes the application." },
    { to: "REJECTED", label: "Reject", title: "Reject this application", intro: "They can apply again later.", danger: true },
  ],
  ONBOARDED: [],
  REJECTED: [{ to: "NEW", label: "Reopen", title: "Reopen this application", intro: "It goes back to New. This fails if the same phone or Instagram handle has a newer open application." }],
};

/** Move an application along. Every change asks for a reason (audit log) and may update the staff note. */
export function ApplicationActions({ id, status, note, storeName }: { id: string; status: Status; note: string | null; storeName: string }) {
  const router = useRouter();
  const noteId = useId();
  const [move, setMove] = useState<(typeof MOVES)[Status][number] | null>(null);
  const [text, setText] = useState(note ?? "");
  const moves = MOVES[status];
  if (moves.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {moves.map((m) => (
        <Button
          key={m.to}
          variant="secondary"
          size="sm"
          className={`!h-11 lg:!h-10 ${m.danger ? "!text-danger" : ""}`}
          onClick={() => {
            setText(note ?? "");
            setMove(m);
          }}
        >
          {m.label}
          <span className="sr-only"> {storeName}</span>
        </Button>
      ))}
      <ReasonDialog
        open={move !== null}
        onClose={() => setMove(null)}
        title={move ? `${move.title}: ${storeName}` : ""}
        intro={move?.intro}
        confirmLabel={move?.label ?? "Confirm"}
        tone={move?.danger ? "danger" : "primary"}
        onSubmit={async (reason) => {
          const r = await adminRequest("POST", `/api/admin/applications/${id}/status`, { status: move!.to, note: text, reason });
          if (r.ok) router.refresh();
          return r;
        }}
      >
        <div className="field">
          <label htmlFor={noteId}>Staff note (optional)</label>
          <textarea id={noteId} className="input !h-auto min-h-[64px] !py-3 !leading-[1.4]" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="help">Only staff see this.</span>
        </div>
      </ReasonDialog>
    </div>
  );
}

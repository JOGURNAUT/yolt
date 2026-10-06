"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { currentPushSubscription, disablePush, enablePush, getPushConfig, pushRegistration, pushSupported } from "@/lib/client/push";

type Session = { id: string; deviceLabel: string; lastSeenAt: string; current: boolean };

/** Edit name (PATCH /api/me). */
export function NameEditor({ name }: { name: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: value }) });
    setBusy(false);
    if (!res.ok) return setError("Use 2 to 60 characters.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={() => setEditing(true)} aria-label="Edit name">
        Edit
      </Button>
    );
  }
  return (
    <form onSubmit={save} className="flex w-full flex-col gap-2">
      <label className="field">
        Your name
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" maxLength={60} aria-invalid={error ? true : undefined} />
        {error && <span className="help err">{error}</span>}
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Save name
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type PushStatus = "checking" | "unavailable" | "off" | "on" | "blocked";

/** Drop and saved-item pings for this device. Hidden where push isn't available (no service worker, unsupported browser, no keys). */
export function NotificationsRow() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const config = await getPushConfig();
      const sub = config.enabled && pushSupported() ? await currentPushSubscription() : null;
      const reg = config.enabled && pushSupported() ? await pushRegistration() : null;
      if (!live) return;
      if (!config.enabled || !reg) setStatus("unavailable");
      else if (Notification.permission === "denied") setStatus("blocked");
      else setStatus(sub && Notification.permission === "granted" ? "on" : "off");
    })();
    return () => {
      live = false;
    };
  }, []);

  if (status === "checking" || status === "unavailable") return null;

  async function toggle() {
    setBusy(true);
    if (status === "on") {
      if (await disablePush()) setStatus("off");
    } else {
      const r = await enablePush();
      setStatus(r.ok ? "on" : r.reason === "blocked" ? "blocked" : "off");
    }
    setBusy(false);
  }

  const sub = { on: "On for this device", off: "Off on this device", blocked: "Blocked in your browser settings" }[status];
  return (
    <div className="card flex min-h-14 items-center gap-3 px-4 py-1">
      <Bell aria-hidden className="ic" strokeWidth={ICON_STROKE} />
      <span id="notif-label" className="flex grow flex-col gap-0.5">
        <span className="t-body font-semibold">Notifications</span>
        <span className="t-small muted">{sub}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={status === "on"}
        aria-labelledby="notif-label"
        disabled={busy || status === "blocked"}
        onClick={toggle}
        className="btn btn-sm btn-secondary min-h-11"
      >
        {status === "on" ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}

/** Sign out here, or everywhere else (POST /api/me/sessions/revoke-others). */
export function SignOutActions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function signOutAll() {
    await fetch("/api/auth/logout-all", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function loadDevices() {
    const res = await fetch("/api/me/sessions", { cache: "no-store" });
    if (res.ok) setSessions((await res.json()) as Session[]);
  }

  async function signOutOthers() {
    setBusy(true);
    const res = await fetch("/api/me/sessions/revoke-others", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setMessage("Couldn't sign out other devices. Try again.");
    const { revoked } = (await res.json()) as { revoked: number };
    setMessage(revoked === 0 ? "You're only signed in on this device." : `Signed out of ${revoked} other ${revoked === 1 ? "device" : "devices"}.`);
    void loadDevices();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={signOut}>
        Sign out
      </Button>
      <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={signOutOthers} loading={busy}>
        Sign out of other devices
      </Button>
      <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={signOutAll}>
        Sign out of all devices
      </Button>
      {message && (
        <p role="status" className="help">
          {message}
        </p>
      )}
      {sessions === null ? (
        <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={loadDevices}>
          Where am I signed in?
        </Button>
      ) : (
        <ul aria-label="Devices" className="t-small muted flex flex-col gap-1">
          {sessions.map((s) => (
            <li key={s.id}>
              {s.deviceLabel}
              {s.current ? " (this device)" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

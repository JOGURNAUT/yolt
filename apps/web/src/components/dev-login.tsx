"use client";

import { useRouter } from "next/navigation";

export function DevLogin({ users, next }: { users: { id: string; name: string | null }[]; next: string }) {
  const router = useRouter();
  async function login(userId: string) {
    await fetch("/api/dev/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.push(next);
    router.refresh();
  }
  return (
    <ul className="space-y-2">
      {users.map((u) => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => login(u.id)}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-foreground"
          >
            {u.name ?? u.id}
          </button>
        </li>
      ))}
    </ul>
  );
}

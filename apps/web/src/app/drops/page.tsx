import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listPublicDrops } from "@yolt/core";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Drops" };

export default async function DropsPage() {
  await connection();
  const drops = await listPublicDrops(db);
  const live = drops.filter((d) => d.status === "LIVE");
  const upcoming = drops.filter((d) => d.status === "SCHEDULED");

  const card = (d: (typeof drops)[number]) => (
    <li key={d.id}>
      <Link href={`/d/${d.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-foreground">
        <p className="text-xs uppercase tracking-wide text-accent">{d.status === "LIVE" ? "Live now" : formatIST(d.startsAt)}</p>
        <p className="font-semibold">{d.title}</p>
        <p className="text-sm text-muted">
          {d.sellerName} · {d.items} {d.items === 1 ? "piece" : "pieces"}
        </p>
      </Link>
    </li>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Drops</h1>
      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Live now</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{live.map(card)}</ul>
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Coming up</h2>
        {upcoming.length ? <ul className="grid gap-3 sm:grid-cols-2">{upcoming.map(card)}</ul> : <p className="text-sm text-muted">No drops announced yet. Follow stores to hear first.</p>}
      </section>
    </div>
  );
}

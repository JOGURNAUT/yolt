import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { getFreshFinds, getStores } from "@/lib/server/queries";

export default async function Home() {
  const [fresh, stores] = await Promise.all([getFreshFinds(), getStores()]);
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-bold">Fresh finds</h1>
        <p className="mt-1 text-sm text-muted">One of each. Real measurements, every flaw shown.</p>
        <div className="mt-4">
          {fresh.length ? <ProductGrid items={fresh} showSeller /> : <p className="text-muted">No items listed yet.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Stores to discover</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {stores.map((s) => (
            <li key={s.handle}>
              <Link href={`/s/${s.handle}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-foreground">
                <p className="font-medium">{s.displayName}</p>
                {s.bio && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.bio}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

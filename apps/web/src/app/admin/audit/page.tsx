import { connection } from "next/server";
import { listAuditEvents } from "@yolt/core";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export default async function AdminAudit() {
  await connection();
  const { stale } = await requireAdmin();
  if (stale) return null;
  const events = await listAuditEvents(db, { limit: 200 });

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Recent actions</h2>
      <p className="text-xs text-muted">Every staff, seller and system action that changes money, stores or orders. Newest first.</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="p-2 font-medium">When (IST)</th>
              <th className="p-2 font-medium">Who</th>
              <th className="p-2 font-medium">Action</th>
              <th className="p-2 font-medium">What</th>
              <th className="p-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap p-2">{formatIST(e.createdAt)}</td>
                <td className="p-2">{e.actorRole}</td>
                <td className="p-2 font-mono">{e.action}</td>
                <td className="p-2 font-mono text-muted">{e.entity}/{e.entityId.slice(0, 8)}</td>
                <td className="p-2">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

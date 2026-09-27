/**
 * The only way to make someone YOLT staff:
 *   pnpm admin:grant +919876543210 ADMIN --confirm
 *   pnpm admin:grant +919876543210 --revoke --confirm
 * Prints which database it will change and does nothing without --confirm.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { normalizeIndianMobile } from "@yolt/shared";
import { createDb } from "./index";
import { admins, auditEvents, users } from "./schema";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

// pnpm forwards a literal "--" when run from the repo root; ignore it.
const args = process.argv.slice(2).filter((a) => a !== "--");
const phone = normalizeIndianMobile(args[0] ?? "");
const role = (args.find((a) => a === "ADMIN" || a === "SUPPORT") ?? "ADMIN") as "ADMIN" | "SUPPORT";
const revoke = args.includes("--revoke");
const confirmed = args.includes("--confirm");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!phone) {
  console.error("Usage: pnpm admin:grant <indian mobile> [ADMIN|SUPPORT] [--revoke] --confirm");
  process.exit(1);
}

const target = new URL(url);
console.log(`Database: ${target.hostname}:${target.port || 5432}${target.pathname}`);
console.log(revoke ? `Revoke admin access from ${phone}` : `Grant ${role} to ${phone}`);
if (!confirmed) {
  console.log("Dry run. Re-run with --confirm to apply.");
  process.exit(0);
}

const { db, close } = createDb(url, { max: 1 });
const operator = process.env.USER ?? process.env.USERNAME ?? "cli";
try {
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ phone }).onConflictDoNothing({ target: users.phone }).returning({ id: users.id });
    const userId = user?.id ?? (await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)))[0]!.id;
    if (revoke) {
      await tx.delete(admins).where(eq(admins.userId, userId));
    } else {
      await tx
        .insert(admins)
        .values({ userId, role, grantedBy: `cli:${operator}` })
        .onConflictDoUpdate({ target: admins.userId, set: { role, grantedBy: `cli:${operator}` } });
    }
    await tx.insert(auditEvents).values({
      actorRole: `cli:${operator}`,
      action: revoke ? "admin.revoked" : "admin.granted",
      entity: "user",
      entityId: userId,
      after: revoke ? null : { role },
    });
  });
  console.log("Done. The user signs in normally with their phone; the Admin link appears in the header.");
} finally {
  await close();
}

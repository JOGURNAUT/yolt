/**
 * Local demo only: puts real photos on the demo store's pieces, so the UI can be judged with
 * pictures instead of grey placeholders.
 *
 *   pnpm demo:photos             # use the photos in ./images
 *   pnpm demo:photos --dry       # show what would go where, change nothing
 *   pnpm demo:photos --sequential --per 2   # ignore names: hand out the photos in order, 2 per piece
 *
 * Name a photo after the piece it shows and the script matches it: `jeans.jpg`, `levis-501.jpg`,
 * `carhartt-jacket.jpg`. Every word in the file name has to appear in the piece's title (or its
 * category). A second photo of the same piece takes a suffix: `jeans-back.jpg`, `jeans-label.jpg`,
 * `jeans-detail.jpg`, or just `jeans-2.jpg`. Without a suffix the order is front, back, label, detail.
 *
 * Photos go through the same pipeline as seller uploads (EXIF stripped, re-encoded to WebP) and are
 * stored in the local media bucket. Refuses to run against anything but a local database.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, inArray } from "drizzle-orm";
import { createDb, drops, listingPhotos, listings, sellers } from "@yolt/db";
import { PHOTO_KIND_LABELS, type PhotoKind } from "@yolt/shared";
import { InvalidImageError, processPhoto } from "./media/process";
import { mediaStorageFromEnv } from "./media/storage";

const root = fileURLToPath(new URL("../../../", import.meta.url));
config({ path: [join(root, ".env"), join(root, "apps/web/.env.local")], quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const dry = flag("dry");
const sequential = flag("sequential");
const perPiece = Math.max(1, Number(option("per", "1")) || 1);
/** One store's pieces, or (the default) every demo store's: a photo is matched against all of them. */
const storeHandle = option("store", "");
const dir = option("dir", join(root, "images"));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Refusing to touch a non-local database");
const endpoint = process.env.MEDIA_ENDPOINT ?? "";
if (!dry && !/localhost|127\.0\.0\.1/.test(endpoint)) throw new Error("MEDIA_ENDPOINT must point at the local media bucket (run `pnpm db:up`)");

// ---------------------------------------------------------------------------
// Matching file names to pieces
// ---------------------------------------------------------------------------

const ROLE_WORDS: Record<string, PhotoKind> = { front: "FRONT", back: "BACK", label: "LABEL", tag: "LABEL", detail: "DETAIL", flaw: "FLAW", closeup: "FLAW" };
const SKIP = new Set(["the", "and", "a", "of", "photo", "img", "image", "copy"]);
const KIND_ORDER: PhotoKind[] = ["FRONT", "BACK", "LABEL", "DETAIL"];
/** FRONT first, so it becomes the cover; a flaw close-up goes last. */
const rank = (k: PhotoKind) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);

/** Lower-case words; plural "s" dropped so "jackets" matches "jacket"; 1–2 digit numbers are indexes, not words. */
function words(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !SKIP.has(w) && !(/^\d{1,2}$/.test(w)))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

type Piece = { id: string; title: string; words: Set<string> };
type Shot = { file: string; kind: PhotoKind | null; order: number };

function parseName(file: string) {
  const base = file.slice(0, file.length - extname(file).length);
  const parts = words(base);
  let kind: PhotoKind | null = null;
  const rest: string[] = [];
  for (const w of parts) {
    if (ROLE_WORDS[w]) kind = ROLE_WORDS[w]!;
    else rest.push(w);
  }
  const index = Number(/(\d{1,2})$/.exec(base)?.[1] ?? 0);
  return { rest, kind, index };
}

// ---------------------------------------------------------------------------

const { db, close } = createDb(url, { max: 1 });
try {
  const allFiles = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // `<drop name>-cover.png` is a drop's poster, not a piece's photo.
  const stem = (f: string) => f.slice(0, f.length - extname(f).length);
  const coverFiles = allFiles.filter((f) => /-cover$/i.test(stem(f)));
  const files = allFiles.filter((f) => !coverFiles.includes(f));
  if (allFiles.length === 0) {
    console.log(`No photos found in ${dir}\nPut .jpg, .png or .webp files there (see images/README.md), then run this again.`);
    process.exit(0);
  }

  const stores = await db.select({ id: sellers.id, handle: sellers.handle, name: sellers.displayName }).from(sellers).where(storeHandle ? eq(sellers.handle, storeHandle) : undefined);
  if (stores.length === 0) throw new Error(storeHandle ? `No store with the handle "${storeHandle}".` : "No stores yet. Run pnpm db:seed first.");
  const rows = await db
    .select({ id: listings.id, title: listings.title, category: listings.category })
    .from(listings)
    .where(inArray(listings.sellerId, stores.map((st) => st.id)))
    .orderBy(asc(listings.createdAt));
  // A draft can have no title yet; it just can't be matched by name.
  const pieces: Piece[] = rows.map((r) => ({ id: r.id, title: r.title ?? "(untitled draft)", words: new Set([...words(r.title ?? ""), ...words(r.category ?? "")]) }));
  console.log(`${files.length} photo(s) and ${coverFiles.length} poster(s) in ${dir}, ${pieces.length} pieces at ${stores.map((st) => st.name).join(", ")}.\n`);

  const plan = new Map<string, Shot[]>();
  const unmatched: string[] = [];
  const add = (pieceId: string, shot: Shot) => plan.set(pieceId, [...(plan.get(pieceId) ?? []), shot]);

  if (sequential) {
    files.forEach((file, i) => {
      const piece = pieces[Math.floor(i / perPiece)];
      if (piece) add(piece.id, { file, kind: null, order: i % perPiece });
      else unmatched.push(`${file} (more photos than pieces)`);
    });
  } else {
    for (const file of files) {
      const { rest, kind, index } = parseName(file);
      if (rest.length === 0) {
        unmatched.push(`${file} (the name has no words to match; name it after the piece, e.g. jeans.jpg)`);
        continue;
      }
      // Every word has to appear in the title. Several pieces can fit ("jacket"): the one whose title is
      // the closest fit (fewest extra words) wins, and a tie is reported rather than guessed.
      const fits = pieces.filter((p) => rest.every((w) => p.words.has(w))).sort((a, b) => a.words.size - b.words.size);
      if (fits.length === 0) unmatched.push(`${file} (no piece has all of: ${rest.join(", ")})`);
      else if (fits.length > 1 && fits[0]!.words.size === fits[1]!.words.size) unmatched.push(`${file} (could be "${fits[0]!.title}" or "${fits[1]!.title}": add a more specific word)`);
      else add(fits[0]!.id, { file, kind, order: index });
    }
  }

  // Order each piece's shots: named kinds keep theirs; the rest fill front, back, label, detail in file order.
  const finalPlan = [...plan.entries()].map(([pieceId, shots]) => {
    const taken = new Set(shots.map((s) => s.kind).filter(Boolean));
    const free = KIND_ORDER.filter((k) => !taken.has(k));
    const sorted = [...shots].sort((a, b) => a.order - b.order || a.file.localeCompare(b.file, undefined, { numeric: true }));
    const out = sorted.map((s) => ({ ...s, kind: s.kind ?? free.shift() ?? ("DETAIL" as PhotoKind) }));
    out.sort((a, b) => rank(a.kind!) - rank(b.kind!));
    return { piece: pieces.find((p) => p.id === pieceId)!, shots: out as (Shot & { kind: PhotoKind })[] };
  });

  for (const { piece, shots } of finalPlan) {
    console.log(`  ${piece.title}`);
    for (const s of shots) console.log(`      ${PHOTO_KIND_LABELS[s.kind].padEnd(16)} ${s.file}`);
  }
  // Drop posters: every word of the file name (minus "cover") has to be in exactly one drop's title.
  const dropRows = await db.select({ id: drops.id, title: drops.title }).from(drops).where(inArray(drops.sellerId, stores.map((st) => st.id)));
  const coverPlan: { dropId: string; title: string; file: string }[] = [];
  for (const file of coverFiles) {
    const rest = words(stem(file)).filter((w) => w !== "cover");
    const fits = rest.length ? dropRows.filter((d) => rest.every((w) => words(d.title).includes(w))) : [];
    if (fits.length === 1) coverPlan.push({ dropId: fits[0]!.id, title: fits[0]!.title, file });
    else unmatched.push(`${file} (${fits.length > 1 ? "fits more than one drop" : `no drop has all of: ${rest.join(", ") || "(empty name)"}`})`);
  }
  for (const c of coverPlan) console.log(`  Drop poster: ${c.title}\n      ${c.file}`);

  const without = pieces.filter((p) => !plan.has(p.id));
  if (without.length) console.log(`\n${without.length} piece(s) keep their current photos: ${without.map((p) => p.title).join("; ")}`);
  if (unmatched.length) console.log(`\nNot used:\n${unmatched.map((u) => `  ${u}`).join("\n")}`);
  if (dry) {
    console.log("\n--dry: nothing was changed.");
    process.exit(0);
  }

  // Upload first, swap the rows in one transaction, delete the replaced objects last.
  const media = mediaStorageFromEnv(process.env);
  let done = 0;
  for (const { piece, shots } of finalPlan) {
    const uploaded: { kind: PhotoKind; key: string; url: string; width: number; height: number }[] = [];
    try {
      for (const s of shots) {
        const p = await processPhoto(new Uint8Array(await readFile(join(dir, s.file))));
        const key = `listings/${piece.id}/${randomBytes(12).toString("hex")}.webp`;
        await media.put(key, p.data, p.contentType);
        uploaded.push({ kind: s.kind, key, url: media.publicUrl(key), width: p.width, height: p.height });
      }
    } catch (err) {
      if (!(err instanceof InvalidImageError)) throw err;
      console.log(`\nSkipped "${piece.title}": ${err.message}`);
      await Promise.all(uploaded.map((u) => media.delete(u.key).catch(() => {})));
      continue;
    }
    const old = await db.transaction(async (tx) => {
      const gone = await tx.delete(listingPhotos).where(eq(listingPhotos.listingId, piece.id)).returning({ key: listingPhotos.storageKey });
      await tx.insert(listingPhotos).values(uploaded.map((u, position) => ({ listingId: piece.id, url: u.url, storageKey: u.key, width: u.width, height: u.height, kind: u.kind, position })));
      return gone;
    });
    await Promise.all(old.filter((o) => o.key).map((o) => media.delete(o.key!).catch(() => {})));
    done++;
  }
  for (const c of coverPlan) {
    try {
      const p = await processPhoto(new Uint8Array(await readFile(join(dir, c.file))));
      const key = `drops/${c.dropId}/${randomBytes(12).toString("hex")}.webp`;
      await media.put(key, p.data, p.contentType);
      await db.update(drops).set({ coverUrl: media.publicUrl(key) }).where(eq(drops.id, c.dropId));
    } catch (err) {
      if (!(err instanceof InvalidImageError)) throw err;
      console.log(`\nSkipped the poster for "${c.title}": ${err.message}`);
    }
  }
  console.log(`\nDone: ${done} piece(s) and ${coverPlan.length} drop poster(s) updated. Reload the site.`);
} finally {
  await close();
}

/**
 * Catalog rules shared by the API, domain logic and the browser. No runtime dependencies,
 * so client components can import it.
 */

/** Measurements in centimetres; missing means unknown, never guessed. */
export type Measurements = {
  /** Whether chest/waist/hip are measured flat across one side or all the way around. */
  basis?: "FLAT" | "AROUND";
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  shoulderCm?: number;
  sleeveCm?: number;
  lengthCm?: number;
  inseamCm?: number;
  footLengthCm?: number;
};

export type MeasurementKey = Exclude<keyof Measurements, "basis">;

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  chestCm: "Chest",
  waistCm: "Waist",
  hipCm: "Hip",
  shoulderCm: "Shoulder",
  sleeveCm: "Sleeve",
  lengthCm: "Length",
  inseamCm: "Inseam",
  footLengthCm: "Foot length",
};

/** Measurements that change meaning depending on flat vs around. */
export const WIDTH_MEASUREMENTS: MeasurementKey[] = ["chestCm", "waistCm", "hipCm"];

export type CategoryGroup = "CLOTHING" | "FOOTWEAR" | "BAG" | "ACCESSORY";

export type Category = {
  id: string;
  label: string;
  group: CategoryGroup;
  /** Fields shown in the editor, in order. */
  measurements: MeasurementKey[];
  /** Fields that must be filled before publishing. */
  requiredMeasurements: MeasurementKey[];
  /** Brand claims here get a "not authenticated by YOLT" note. */
  authSensitive?: boolean;
};

export const CATEGORIES: Category[] = [
  { id: "tops", label: "T-shirts & tops", group: "CLOTHING", measurements: ["chestCm", "lengthCm", "shoulderCm", "sleeveCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "shirts", label: "Shirts", group: "CLOTHING", measurements: ["chestCm", "lengthCm", "shoulderCm", "sleeveCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "knitwear", label: "Sweaters & knitwear", group: "CLOTHING", measurements: ["chestCm", "lengthCm", "shoulderCm", "sleeveCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "jackets", label: "Jackets & coats", group: "CLOTHING", measurements: ["chestCm", "lengthCm", "shoulderCm", "sleeveCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "dresses", label: "Dresses", group: "CLOTHING", measurements: ["chestCm", "waistCm", "hipCm", "lengthCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "kurtas", label: "Kurtas & ethnic", group: "CLOTHING", measurements: ["chestCm", "waistCm", "lengthCm", "shoulderCm", "sleeveCm"], requiredMeasurements: ["chestCm", "lengthCm"] },
  { id: "jeans", label: "Jeans", group: "CLOTHING", measurements: ["waistCm", "hipCm", "lengthCm", "inseamCm"], requiredMeasurements: ["waistCm", "lengthCm"] },
  { id: "trousers", label: "Trousers", group: "CLOTHING", measurements: ["waistCm", "hipCm", "lengthCm", "inseamCm"], requiredMeasurements: ["waistCm", "lengthCm"] },
  { id: "shorts", label: "Shorts", group: "CLOTHING", measurements: ["waistCm", "hipCm", "lengthCm", "inseamCm"], requiredMeasurements: ["waistCm", "lengthCm"] },
  { id: "skirts", label: "Skirts", group: "CLOTHING", measurements: ["waistCm", "hipCm", "lengthCm"], requiredMeasurements: ["waistCm", "lengthCm"] },
  { id: "sneakers", label: "Sneakers", group: "FOOTWEAR", measurements: ["footLengthCm"], requiredMeasurements: [], authSensitive: true },
  { id: "footwear", label: "Other footwear", group: "FOOTWEAR", measurements: ["footLengthCm"], requiredMeasurements: [] },
  { id: "bags", label: "Bags", group: "BAG", measurements: ["lengthCm"], requiredMeasurements: [], authSensitive: true },
  { id: "accessories", label: "Accessories", group: "ACCESSORY", measurements: [], requiredMeasurements: [] },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
export const getCategory = (id: string | null | undefined) => (id ? byId.get(id) : undefined);

export const CONDITIONS = ["NEW_WITH_TAGS", "LIKE_NEW", "GOOD", "FAIR"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_INFO: Record<Condition, { label: string; meaning: string }> = {
  NEW_WITH_TAGS: { label: "New with tags", meaning: "Never worn, original tags attached." },
  LIKE_NEW: { label: "Like new", meaning: "Worn a few times, no visible wear." },
  GOOD: { label: "Good", meaning: "Gently used. Any wear is listed below with photos." },
  FAIR: { label: "Fair", meaning: "Visible wear. Every flaw is listed below with photos." },
};

export const PHOTO_KINDS = ["FRONT", "BACK", "LABEL", "FLAW", "DETAIL", "PROOF_OF_PURCHASE"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  FRONT: "Front",
  BACK: "Back",
  LABEL: "Label / size tag",
  FLAW: "Flaw close-up",
  DETAIL: "Detail",
  PROOF_OF_PURCHASE: "Proof of purchase",
};

export const MAX_PHOTOS = 12;
export const MIN_PRICE_PAISE = 5_000; // ₹50
export const MAX_PRICE_PAISE = 50_000_000; // ₹5,00,000

// ---------------------------------------------------------------------------
// Publish readiness
// ---------------------------------------------------------------------------

export type ListingDraft = {
  title: string | null;
  category: string | null;
  tagSize: string | null;
  measurements: Measurements;
  condition: string | null;
  flaws: string | null;
  noFlawsConfirmed: boolean;
  pricePaise: number | null;
  photoKinds: string[];
};

export type MissingField = { field: string; message: string };

/**
 * What still blocks publishing. The editor shows this list; the server enforces it.
 * Honesty rules: a garment needs front, back and label photos, measurements for its
 * category, and either described flaws (with a photo) or an explicit "no flaws".
 */
export function publishReadiness(d: ListingDraft): { ready: boolean; missing: MissingField[] } {
  const missing: MissingField[] = [];
  const add = (field: string, message: string) => missing.push({ field, message });
  const category = getCategory(d.category);
  const kinds = new Set(d.photoKinds);

  if (!d.title || d.title.trim().length < 5) add("title", "Add a title of at least 5 characters.");
  if (!category) add("category", "Choose a category.");
  if (!d.condition || !CONDITIONS.includes(d.condition as Condition)) add("condition", "Choose a condition.");
  if (d.pricePaise === null || d.pricePaise < MIN_PRICE_PAISE || d.pricePaise > MAX_PRICE_PAISE) {
    add("price", "Set a price between ₹50 and ₹5,00,000.");
  }

  if (!kinds.has("FRONT")) add("photos", "Add a front photo.");
  if (category?.group === "CLOTHING") {
    if (!kinds.has("BACK")) add("photos", "Add a back photo.");
    if (!kinds.has("LABEL")) add("photos", "Add a photo of the label or size tag.");
  }

  const flaws = d.flaws?.trim() ?? "";
  if (flaws && d.noFlawsConfirmed) add("flaws", "You described flaws but also ticked “no flaws”. Choose one.");
  if (!flaws && !d.noFlawsConfirmed) add("flaws", "Describe any flaws, or tick “No flaws” to confirm there are none.");
  if (flaws && !kinds.has("FLAW")) add("photos", "Add a close-up photo of the flaw you described.");

  if (category && (category.group === "CLOTHING" || category.group === "FOOTWEAR") && !d.tagSize?.trim()) {
    add("tagSize", "Add the size written on the tag.");
  }
  if (category) {
    for (const key of category.requiredMeasurements) {
      const v = d.measurements[key];
      if (typeof v !== "number" || !(v > 0)) add(`measurements.${key}`, `Measure the ${MEASUREMENT_LABELS[key].toLowerCase()}.`);
    }
    const hasWidth = WIDTH_MEASUREMENTS.some((k) => typeof d.measurements[k] === "number");
    if (hasWidth && !d.measurements.basis) {
      add("measurements.basis", "Say whether chest/waist/hip were measured flat or all the way around.");
    }
  }

  return { ready: missing.length === 0, missing };
}

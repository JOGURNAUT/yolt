import { describe, expect, it } from "vitest";
import { publishReadiness, type ListingDraft } from "./catalog";

const complete: ListingDraft = {
  title: "Vintage Levi's 501",
  category: "jeans",
  tagSize: "W32 L32",
  measurements: { basis: "FLAT", waistCm: 41, lengthCm: 104 },
  condition: "GOOD",
  flaws: null,
  noFlawsConfirmed: true,
  pricePaise: 129900,
  photoKinds: ["FRONT", "BACK", "LABEL"],
};

const fields = (d: ListingDraft) => publishReadiness(d).missing.map((m) => m.field);

describe("publishReadiness", () => {
  it("accepts a complete garment", () => {
    expect(publishReadiness(complete)).toEqual({ ready: true, missing: [] });
  });

  it("requires front, back and label photos for clothing", () => {
    const r = publishReadiness({ ...complete, photoKinds: [] });
    expect(r.missing.filter((m) => m.field === "photos")).toHaveLength(3);
  });

  it("needs only a front photo for bags and accessories", () => {
    expect(fields({ ...complete, category: "bags", tagSize: null, measurements: {}, photoKinds: ["FRONT"] })).toEqual([]);
  });

  it("requires flaws described or explicitly none, never both", () => {
    expect(fields({ ...complete, noFlawsConfirmed: false })).toContain("flaws");
    expect(fields({ ...complete, flaws: "Small hole", photoKinds: [...complete.photoKinds, "FLAW"] })).toContain("flaws");
  });

  it("requires a flaw photo when a flaw is described", () => {
    const d = { ...complete, flaws: "Bleach spot", noFlawsConfirmed: false };
    expect(fields(d)).toContain("photos");
    expect(fields({ ...d, photoKinds: [...d.photoKinds, "FLAW"] })).toEqual([]);
  });

  it("requires the category's measurements and a flat/around basis", () => {
    expect(fields({ ...complete, measurements: { basis: "FLAT", waistCm: 41 } })).toContain("measurements.lengthCm");
    expect(fields({ ...complete, measurements: { waistCm: 41, lengthCm: 104 } })).toContain("measurements.basis");
  });

  it("bounds the price and requires tag size for clothing and footwear", () => {
    expect(fields({ ...complete, pricePaise: 100 })).toContain("price");
    expect(fields({ ...complete, tagSize: " " })).toContain("tagSize");
    expect(fields({ ...complete, category: "sneakers", tagSize: null, measurements: {}, photoKinds: ["FRONT"] })).toContain("tagSize");
  });

  it("rejects unknown categories and conditions", () => {
    expect(fields({ ...complete, category: "spaceships" })).toContain("category");
    expect(fields({ ...complete, condition: "MINT" })).toContain("condition");
  });
});

import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@yolt/shared";
import { activeFilters, didYouMean, isExplore } from "./search-filters";

describe("activeFilters", () => {
  it("makes one chip per filter, each linking to the search without it", () => {
    const p = parseSearchParams({ q: "denim", cat: "jeans,jackets", price: "-2500", waist: "78-84", cond: "GOOD" });
    const chips = activeFilters(p);
    expect(chips.map((c) => c.label)).toEqual(["Jeans", "Jackets & coats", "Good", "₹up to 2500", "Waist 78–84 cm"]);
    expect(chips[0]!.href).toBe("/search?q=denim&cat=jackets&cond=GOOD&price=-2500&waist=78-84");
    expect(chips[3]!.href).not.toContain("price=");
  });
});

describe("isExplore", () => {
  it("is the no-query, no-filter state only", () => {
    expect(isExplore(parseSearchParams({}))).toBe(true);
    expect(isExplore(parseSearchParams({ q: "x" }))).toBe(false);
    expect(isExplore(parseSearchParams({ sort: "newest" }))).toBe(false);
    expect(isExplore(parseSearchParams({ size: "M" }))).toBe(false);
  });
});

describe("didYouMean", () => {
  it("swaps a misspelt word for the nearest title word", () => {
    expect(didYouMean("carhart", ["Oversized Carhartt workwear jacket"])).toBe("carhartt");
  });
  it("leaves a query alone when nothing is close", () => {
    expect(didYouMean("zzzzzz", ["Vintage Levi's 501 jeans"])).toBeNull();
    expect(didYouMean("levis", ["Vintage Levi's 501 jeans"])).toBeNull();
  });
});

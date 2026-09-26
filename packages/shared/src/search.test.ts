import { describe, expect, it } from "vitest";
import { parseSearchParams, searchParamsToQuery, tokenizeQuery } from "./search";

describe("search params", () => {
  it("parses a full URL and round-trips it canonically", () => {
    const p = parseSearchParams(
      new URLSearchParams("q=levi's%20501&cat=jeans,shorts&size=W32&cond=GOOD&price=500-2000&waist=76-86&sort=price_asc&status=sold-out&page=2"),
    );
    expect(p).toMatchObject({
      q: "levi's 501",
      categories: ["jeans", "shorts"],
      sizes: ["W32"],
      conditions: ["GOOD"],
      price: { min: 500, max: 2000 },
      measurements: { waist: { min: 76, max: 86 } },
      sort: "price_asc",
      stock: "sold-out",
      page: 2,
    });
    expect(parseSearchParams(new URLSearchParams(searchParamsToQuery(p).slice(1)))).toEqual(p);
  });

  it("drops junk instead of failing", () => {
    const p = parseSearchParams({ cat: "spaceships", cond: "MINT", price: "abc", chest: "10-5-3", sort: "hack", status: "x", page: "-4" });
    expect(p).toMatchObject({ categories: [], conditions: [], price: {}, measurements: {}, sort: "relevance", stock: "in-stock", page: 1 });
  });

  it("accepts min/max fields from plain HTML forms", () => {
    const p = parseSearchParams(new URLSearchParams("chest_min=96&chest_max=104&price_min=&price_max=1500&waist_min=abc"));
    expect(p.measurements).toEqual({ chest: { min: 96, max: 104 } });
    expect(p.price).toEqual({ max: 1500 });
    expect(searchParamsToQuery(p)).toBe("?price=-1500&chest=96-104");
  });

  it("normalises reversed ranges and omits defaults", () => {
    expect(parseSearchParams({ chest: "104-96" }).measurements.chest).toEqual({ min: 96, max: 104 });
    expect(searchParamsToQuery(parseSearchParams({}))).toBe("");
  });
});

describe("tokenizeQuery", () => {
  it("strips apostrophes and maps synonyms to categories", () => {
    expect(tokenizeQuery("Levi's baby TEE")).toEqual([
      { term: "levis", categories: [] },
      { term: "baby", categories: [] },
      { term: "tee", categories: ["tops"] },
    ]);
    expect(tokenizeQuery("denim").at(0)?.categories).toEqual(["jeans"]);
    expect(tokenizeQuery("shoes").at(0)?.categories).toEqual(["sneakers", "footwear"]);
    expect(tokenizeQuery("black t-shirt")).toEqual([{ term: "black", categories: [] }, { term: "tshirt", categories: ["tops"] }]);
    expect(tokenizeQuery("T Shirts").at(0)?.categories).toEqual(["tops"]);
    expect(tokenizeQuery("tshirt").at(0)?.categories).toEqual(["tops"]);
  });

  it("ignores punctuation-only input and caps the number of terms", () => {
    expect(tokenizeQuery("!!! --")).toEqual([]);
    expect(tokenizeQuery("a b c d e f g h i j")).toHaveLength(8);
  });
});

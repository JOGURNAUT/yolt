import { describe, expect, it } from "vitest";
import { isValidPincode, validateAddress } from "./address";

const good = {
  name: " Ananya  Sharma ",
  phone: "98765 43210",
  line1: "Flat 12, Sunrise Apartments",
  line2: "Koregaon Park",
  landmark: "",
  city: "Pune",
  state: "maharashtra",
  pincode: "411001",
};

describe("validateAddress", () => {
  it("normalises a good address", () => {
    const r = validateAddress(good);
    expect(r).toEqual({
      ok: true,
      address: {
        name: "Ananya Sharma",
        phone: "+919876543210",
        line1: "Flat 12, Sunrise Apartments",
        line2: "Koregaon Park",
        landmark: null,
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
      },
    });
  });

  it("reports every problem at once", () => {
    const r = validateAddress({ name: "", phone: "123", line1: "12", city: "", state: "Atlantis", pincode: "011001" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field).sort()).toEqual(["city", "line1", "name", "phone", "pincode", "state"]);
  });

  it("validates pincodes", () => {
    expect(isValidPincode("411001")).toBe(true);
    expect(isValidPincode("011001")).toBe(false);
    expect(isValidPincode("41100")).toBe(false);
    expect(isValidPincode("4110011")).toBe(false);
  });
});

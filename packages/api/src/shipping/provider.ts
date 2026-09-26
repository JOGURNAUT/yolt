/**
 * Courier aggregator boundary. Shiprocket is planned for launch (docs/decisions.md): its
 * serviceability API answers "can a courier pick up at A and deliver to B, and how fast".
 * DevShippingProvider stands in until credentials exist.
 */
export type Serviceability =
  | { serviceable: true; etaDaysMin: number; etaDaysMax: number }
  | { serviceable: false; reason: "PINCODE_NOT_SERVICEABLE" | "INVALID_PINCODE" };

export interface ShippingProvider {
  readonly name: string;
  checkServiceability(input: { pickupPincode: string; deliveryPincode: string; weightGrams: number }): Promise<Serviceability>;
}

/**
 * Development fake with a plausible shape: same PIN "region" (first two digits) → 2–3 days,
 * same zone (first digit) → 3–5 days, elsewhere → 5–7 days. Pincodes starting 99 are treated
 * as unserviceable so the "we can't deliver here" path can be exercised.
 */
export class DevShippingProvider implements ShippingProvider {
  readonly name = "dev";
  async checkServiceability(input: { pickupPincode: string; deliveryPincode: string }): Promise<Serviceability> {
    const { pickupPincode: from, deliveryPincode: to } = input;
    if (!/^[1-9]\d{5}$/.test(to)) return { serviceable: false, reason: "INVALID_PINCODE" };
    if (to.startsWith("99")) return { serviceable: false, reason: "PINCODE_NOT_SERVICEABLE" };
    if (from.slice(0, 2) === to.slice(0, 2)) return { serviceable: true, etaDaysMin: 2, etaDaysMax: 3 };
    if (from[0] === to[0]) return { serviceable: true, etaDaysMin: 3, etaDaysMax: 5 };
    return { serviceable: true, etaDaysMin: 5, etaDaysMax: 7 };
  }
}

/** Typical parcel weight by category, until sellers enter weights. Couriers bill by weight. */
export function estimatedWeightGrams(category: string | null | undefined) {
  switch (category) {
    case "jackets":
    case "knitwear":
      return 1000;
    case "jeans":
    case "trousers":
    case "sneakers":
    case "footwear":
      return 800;
    case "bags":
      return 600;
    default:
      return 400;
  }
}

export class ShippingUnavailableError extends Error {}

/** Production placeholder until Shiprocket is configured: never guesses serviceability. */
export class UnconfiguredShippingProvider implements ShippingProvider {
  readonly name = "unconfigured";
  async checkServiceability(): Promise<never> {
    throw new ShippingUnavailableError("No shipping provider configured (Shiprocket pending)");
  }
}

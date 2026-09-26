import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ShipmentStatus, TrackingEvent } from "@yolt/core";
import type { AddressSnapshot } from "@yolt/db";

/**
 * Courier aggregator boundary. Shiprocket is planned for launch (docs/decisions.md):
 * serviceability ("can a courier go from A to B, how fast"), booking a pickup with a label,
 * and signed tracking webhooks. DevShippingProvider stands in until credentials exist.
 */
export type Serviceability =
  | { serviceable: true; etaDaysMin: number; etaDaysMax: number }
  | { serviceable: false; reason: "PINCODE_NOT_SERVICEABLE" | "INVALID_PINCODE" };

export type CreateShipmentInput = {
  orderReference: string;
  pickup: { name: string; pincode: string; state: string | null };
  delivery: AddressSnapshot;
  weightGrams: number;
  declaredValuePaise: number;
};

export type CreatedShipment = {
  providerShipmentId: string;
  awb: string;
  courierName: string;
  trackingUrl: string | null;
  labelUrl: string | null;
  pickupScheduledFor: Date | null;
};

export interface ShippingProvider {
  readonly name: string;
  checkServiceability(input: { pickupPincode: string; deliveryPincode: string; weightGrams: number }): Promise<Serviceability>;
  createShipment(input: CreateShipmentInput): Promise<CreatedShipment>;
  cancelShipment(providerShipmentId: string): Promise<void>;
  /** Verifies a tracking webhook's signature and translates it; null for events we don't track. */
  parseTrackingWebhook(request: Request): Promise<Omit<TrackingEvent, "provider"> | null>;
}

export class ShippingUnavailableError extends Error {}
export class TrackingVerificationError extends Error {}

/** Next scan in a normal journey, used by the development "advance shipment" button. */
export const NEXT_DEV_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  BOOKED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

const DEV_DESCRIPTIONS: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: "Picked up from seller",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Returning to seller: delivery failed",
};

/**
 * Development fake. Serviceability: same PIN region (first two digits) → 2–3 days, same zone
 * (first digit) → 3–5, elsewhere → 5–7; pincodes starting 99 are unserviceable. Booking returns
 * a DEV AWB and a printable label page. Tracking webhooks are HMAC-signed so the webhook route
 * runs the same verify-then-apply path a real courier aggregator will.
 */
export class DevShippingProvider implements ShippingProvider {
  readonly name = "dev";
  constructor(private readonly secret = "dev-shipping-secret") {}

  async checkServiceability(input: { pickupPincode: string; deliveryPincode: string }): Promise<Serviceability> {
    const { pickupPincode: from, deliveryPincode: to } = input;
    if (!/^[1-9]\d{5}$/.test(to)) return { serviceable: false, reason: "INVALID_PINCODE" };
    if (to.startsWith("99")) return { serviceable: false, reason: "PINCODE_NOT_SERVICEABLE" };
    if (from.slice(0, 2) === to.slice(0, 2)) return { serviceable: true, etaDaysMin: 2, etaDaysMax: 3 };
    if (from[0] === to[0]) return { serviceable: true, etaDaysMin: 3, etaDaysMax: 5 };
    return { serviceable: true, etaDaysMin: 5, etaDaysMax: 7 };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    const awb = `DEV${randomBytes(5).toString("hex").toUpperCase()}`;
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setUTCHours(5, 30, 0, 0); // 11:00 IST
    return {
      providerShipmentId: `dev_${input.orderReference}_${awb}`,
      awb,
      courierName: "Dev Express",
      trackingUrl: null,
      labelUrl: `/api/dev/labels/${awb}`,
      pickupScheduledFor: tomorrow,
    };
  }

  async cancelShipment() {}

  sign(body: string) {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  buildTrackingWebhook(awb: string, status: ShipmentStatus) {
    const body = JSON.stringify({
      eventId: `dev_${randomUUID()}`,
      awb,
      status,
      description: DEV_DESCRIPTIONS[status] ?? status,
      location: "Pune Hub",
      occurredAt: new Date().toISOString(),
    });
    return new Request("http://dev.local/tracking", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dev-shipping-signature": this.sign(body) },
      body,
    });
  }

  async parseTrackingWebhook(request: Request) {
    const body = await request.text();
    const signature = request.headers.get("x-dev-shipping-signature") ?? "";
    const expected = this.sign(body);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new TrackingVerificationError("invalid signature");
    }
    const e = JSON.parse(body) as { eventId: string; awb: string; status: ShipmentStatus; description?: string; location?: string; occurredAt: string };
    return {
      awb: e.awb,
      providerEventId: e.eventId,
      status: e.status,
      description: e.description ?? null,
      location: e.location ?? null,
      occurredAt: new Date(e.occurredAt),
    };
  }
}

/** Production placeholder until Shiprocket is configured: never guesses, never fakes a booking. */
export class UnconfiguredShippingProvider implements ShippingProvider {
  readonly name = "unconfigured";
  private fail(): never {
    throw new ShippingUnavailableError("No shipping provider configured (Shiprocket pending)");
  }
  async checkServiceability(): Promise<never> {
    this.fail();
  }
  async createShipment(): Promise<never> {
    this.fail();
  }
  async cancelShipment(): Promise<never> {
    this.fail();
  }
  async parseTrackingWebhook(): Promise<never> {
    throw new TrackingVerificationError("No shipping provider configured");
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

import { normalizeIndianMobile } from "./phone";

/** States and union territories, as couriers expect them. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;
export type IndianState = (typeof INDIAN_STATES)[number];

/** Indian PIN codes are 6 digits and never start with 0. */
export const isValidPincode = (pin: string) => /^[1-9]\d{5}$/.test(pin.trim());

export type AddressInput = {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
};

export type NormalizedAddress = {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: IndianState;
  pincode: string;
};

export type AddressError = { field: keyof AddressInput; message: string };

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t.length ? t : null;
};

/**
 * Validates and normalises a delivery address. Couriers reject vague addresses, which is a
 * major cause of failed deliveries (RTO), so the house/street line must be specific.
 */
export function validateAddress(input: AddressInput): { ok: true; address: NormalizedAddress } | { ok: false; errors: AddressError[] } {
  const errors: AddressError[] = [];
  const name = clean(input.name);
  const phone = normalizeIndianMobile(input.phone ?? "");
  const line1 = clean(input.line1);
  const city = clean(input.city);
  const state = INDIAN_STATES.find((s) => s.toLowerCase() === clean(input.state)?.toLowerCase());
  const pincode = (input.pincode ?? "").trim();

  if (!name || name.length < 2 || name.length > 80) errors.push({ field: "name", message: "Enter the full name of the person receiving the parcel." });
  if (!phone) errors.push({ field: "phone", message: "Enter a 10-digit Indian mobile number for the courier." });
  if (!line1 || line1.length < 5 || line1.length > 200) errors.push({ field: "line1", message: "Enter the flat or house number and street." });
  if ((clean(input.line2)?.length ?? 0) > 200) errors.push({ field: "line2", message: "Area is too long." });
  if ((clean(input.landmark)?.length ?? 0) > 100) errors.push({ field: "landmark", message: "Landmark is too long." });
  if (!city || city.length > 80) errors.push({ field: "city", message: "Enter the city or town." });
  if (!state) errors.push({ field: "state", message: "Choose the state." });
  if (!isValidPincode(pincode)) errors.push({ field: "pincode", message: "Enter a 6-digit pincode." });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    address: { name: name!, phone: phone!, line1: line1!, line2: clean(input.line2), landmark: clean(input.landmark), city: city!, state: state!, pincode },
  };
}

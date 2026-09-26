const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Money is stored in paise; show whole rupees unless there are paise. */
export function formatINR(paise: number) {
  return paise % 100 === 0
    ? inr.format(paise / 100)
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

export { CONDITION_INFO as CONDITION } from "@yolt/shared";

const ist = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatIST(date: Date | string) {
  return `${ist.format(new Date(date))} IST`;
}

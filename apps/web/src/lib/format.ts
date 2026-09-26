const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Money is stored in paise; show whole rupees unless there are paise. */
export function formatINR(paise: number) {
  return paise % 100 === 0
    ? inr.format(paise / 100)
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

export const CONDITION: Record<string, { label: string; meaning: string }> = {
  NEW_WITH_TAGS: { label: "New with tags", meaning: "Never worn, original tags attached." },
  LIKE_NEW: { label: "Like new", meaning: "Worn a few times, no visible wear." },
  GOOD: { label: "Good", meaning: "Gently used. Any wear is listed below with photos." },
  FAIR: { label: "Fair", meaning: "Visible wear. Every flaw is listed below with photos." },
};

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

const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** "Wed 15 Oct", in IST. */
export function formatDay(date: Date | string) {
  return day.format(new Date(date)).replace(",", "");
}

/** 18400 becomes "18.4k"; small counts stay whole. */
export function formatCount(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

/** "Ananya Rao" becomes "Ananya": only a first name is shown on reviews. */
export function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || "Buyer";
}

/** "Second Loop" becomes "SL". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

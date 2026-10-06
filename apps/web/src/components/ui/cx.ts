/** Joins class names, skipping falsy ones. */
export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Lucide icons are drawn at stroke 1.75 everywhere (board C1). */
export const ICON_STROKE = 1.75;

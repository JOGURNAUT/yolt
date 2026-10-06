import { Clock } from "lucide-react";
import { cx, ICON_STROKE } from "../ui/cx";

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * HoldTimer (board Checkout): "Reserved for you for 4:59", pinned under the header. It turns amber
 * in the last minute and says so in words. The clock itself isn't announced every second.
 */
export function HoldTimer({ secondsLeft }: { secondsLeft: number }) {
  const low = secondsLeft < 60;
  return (
    <div className={cx("hold", low && "is-low")}>
      <Clock aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
      <div role="timer" aria-live="off" className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[14px] font-bold leading-[18px]">
          Reserved for you for <span className="t-mono !text-[22px] !leading-[26px] font-medium">{clock(secondsLeft)}</span>
        </span>
        <span className="text-xs font-medium leading-4">{low ? "Under a minute left. Pay now to keep it." : "Pay within the time shown. Nobody else can check it out."}</span>
      </div>
      <span role="status" className="sr-only">
        {low ? "Under a minute left to pay." : ""}
      </span>
    </div>
  );
}

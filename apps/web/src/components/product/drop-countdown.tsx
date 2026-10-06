"use client";

import { useEffect, useState } from "react";
import { Countdown } from "@/components/ui/countdown";

/**
 * Time until a drop opens. The clock is YOLT's, not the phone's: the offset between the server's
 * time at render and this device's is applied to every tick. Under reduced motion the numbers still
 * update, they just don't animate (the flip is CSS and is turned off there).
 */
export function DropCountdown({ startsAt, serverNow }: { startsAt: string; serverNow: string }) {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const target = new Date(startsAt).getTime();
  const [ms, setMs] = useState(() => target - new Date(serverNow).getTime());

  useEffect(() => {
    const tick = () => setMs(target - (Date.now() + offset));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target, offset]);

  return <Countdown ms={ms} size="sm" />;
}

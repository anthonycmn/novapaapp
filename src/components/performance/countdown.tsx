"use client";

import { useEffect, useState } from "react";
import { countdown, formatEastern } from "@/lib/performance/rules";

/** "Sign-ups close Fri, Oct 20, 11:00 PM ET · 3 days, 4 hours left", ticking once a minute. */
export function Countdown({ until, label = "Sign-ups close" }: { until?: string; label?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const left = now ? countdown(until, now) : null;
  const passed = now ? new Date(until) <= now : false;
  return (
    <span>
      {passed ? "Sign-ups closed" : label} {formatEastern(until)}
      {left && <span className="font-medium"> · {left}</span>}
    </span>
  );
}

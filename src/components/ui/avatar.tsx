import * as React from "react";
import { cn } from "@/lib/utils";

/** Simple initials avatar; swaps to an image when a URL is present. */
export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-secondary-foreground",
        className
      )}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

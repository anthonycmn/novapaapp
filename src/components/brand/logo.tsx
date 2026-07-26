import Image from "next/image";
import { org } from "@/config/org";
import { cn } from "@/lib/utils";

/**
 * The NOVA PA butterfly mark, extracted from the organization's website
 * (public/brand/novapa-logo.png). Decorative next to a visible wordmark;
 * pass `standalone` when it appears without one so it gets a real alt.
 */
export function Logo({
  size = 32,
  className,
  standalone = false,
}: {
  size?: number;
  className?: string;
  standalone?: boolean;
}) {
  return (
    <Image
      src="/brand/novapa-logo.png"
      alt={standalone ? `${org.name} logo` : ""}
      aria-hidden={standalone ? undefined : true}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      priority
    />
  );
}

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Outbound link to a service we don't host (#12, #13).
 * Opens a new tab in the PWA; a native wrapper swaps this for an in-app
 * browser via lib/platform/external-link. Always labeled so screen-reader
 * users know they're leaving the app.
 */
export function ExternalLinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline" | "subtle";
  className?: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border hover:bg-accent",
    subtle: "text-primary underline-offset-4 hover:underline",
  }[variant];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        variant === "subtle"
          ? "inline-flex items-center gap-1.5 text-sm font-medium"
          : "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold",
        styles,
        className
      )}
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

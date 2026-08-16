import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The staff portal's card: rounded-lg, a hairline border and a two-layer
 * shadow so soft it reads as a lifted edge rather than a drop shadow.
 *
 * `pad` is opt-in here, unlike the staff portal's where it defaults on. The
 * difference is not an oversight: most cards in this app already get their
 * padding from CardHeader/CardContent, and defaulting it on would silently
 * double the padding of every one of them.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { pad?: boolean }
>(({ className, pad = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-[var(--shadow-card)]",
      pad && "p-4",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

/**
 * Card heading. Defaults to <h2> because in this app cards are usually a
 * page's top-level sections, directly under the <h1> — and h1→h3 is a
 * heading-order violation (WCAG 1.3.1). A card nested inside an <h2>
 * section can stay h2 (repeating a level is fine; only *skipping* is not),
 * or pass `as="h3"` where the nesting is meaningful.
 */
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }
>(({ className, as: Tag = "h2", ...props }, ref) => (
  <Tag ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

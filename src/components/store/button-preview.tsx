import type { ButtonSize, ButtonStyle, ButtonTemplate } from "@/lib/api/types";
import { readableTextOn } from "@/lib/color";
import { cn } from "@/lib/utils";

/**
 * Live preview of a spirit button (#11). Rendered with CSS at a fixed
 * on-screen size; the admin print sheet renders the same markup at true
 * physical inches so what a family sees is what gets pressed.
 */
export function ButtonPreview({
  photoUrl,
  studentName,
  role,
  size,
  style,
  template,
  showTitle,
  className,
  printInches,
}: {
  photoUrl?: string;
  studentName: string;
  role: string;
  size: ButtonSize;
  style: ButtonStyle;
  template?: ButtonTemplate;
  showTitle?: string;
  className?: string;
  /** When set, render at true physical size for printing. */
  printInches?: boolean;
}) {
  const accent = template?.accentColor ?? "#8e1f2f";
  // Each show picks its own accent, so the label colour has to be derived
  // from it — fixed white fails WCAG AA on mid-tone accents.
  const onAccent = readableTextOn(accent);
  const dimension = printInches ? `${size}in` : "14rem";

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: dimension, height: dimension }}
    >
      {/* Outer ring in the show's accent color */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 25%, ${accent}, ${accent} 60%, rgba(0,0,0,0.25))`,
          boxShadow: printInches ? "none" : "0 6px 18px rgba(0,0,0,0.18)",
        }}
      />

      {/* Photo well */}
      <div className="absolute inset-[7%] overflow-hidden rounded-full bg-white">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="size-full object-cover"
            style={{
              // Ribbon style leaves room at the bottom for the name banner.
              objectPosition: style === "ribbon" ? "center 35%" : "center",
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-xs text-muted-foreground">
            Add a photo
          </div>
        )}
      </div>

      {/* Star burst accent */}
      {style === "star" && (
        <div
          aria-hidden
          className="absolute left-[10%] top-[10%] text-[1.6em] leading-none"
          style={{ color: template?.accentColor ?? "#a97a0e" }}
        >
          ★
        </div>
      )}

      {/* Name + role banner */}
      <div
        className="absolute inset-x-[7%] bottom-[9%] rounded-md px-1 py-0.5 text-center"
        style={{ backgroundColor: accent, color: onAccent }}
      >
        <p
          className="truncate font-semibold leading-tight"
          style={{ fontSize: printInches ? "0.16in" : "0.85rem" }}
        >
          {studentName || "Student name"}
        </p>
        {role && (
          <p
            className="truncate leading-tight opacity-90"
            style={{ fontSize: printInches ? "0.12in" : "0.7rem" }}
          >
            {role}
          </p>
        )}
      </div>

      {/* Show + season along the top. This sits over the photo well, whose
          colour we don't control (any uploaded image, or the empty-state
          background), so it carries its own accent pill — contrast is
          guaranteed rather than incidental. */}
      {(showTitle || template) && (
        <p
          className="absolute inset-x-[12%] top-[7%] truncate rounded px-1 text-center font-semibold leading-tight"
          style={{
            fontSize: printInches ? "0.11in" : "0.65rem",
            color: onAccent,
            backgroundColor: accent,
          }}
        >
          {showTitle ?? template?.seasonName}
        </p>
      )}
    </div>
  );
}

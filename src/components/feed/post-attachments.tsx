import { ExternalLink, FileText, Link2, Presentation, Sheet } from "lucide-react";
import type { PostAttachment } from "@/lib/api/types";

/**
 * What a post carries besides words, laid out to be tapped (hub 0076).
 *
 * CJ, 9 Sep 2026: "allow me to attach things to feed posts so parents can
 * click them and read them — for example a slideshow."
 *
 * Pictures are shown as thumbnails, because a picture is read by looking at
 * it. Everything else is a full-width row with the one word a parent needs
 * before tapping — Slideshow, PDF, Google Slides — because a filename off a
 * laptop tells them nothing about whether it will open on a phone. Every
 * row opens in a new tab: a PDF renders in the browser, an Office file
 * downloads, and neither should replace the app the family is standing in.
 *
 * The staff portal renders the same list with the same words, so what staff
 * see there is what a family sees here.
 */

/** "Slideshow", "PDF", "Google Slides" — the one word before tapping. */
export function attachmentKindLabel(a: PostAttachment): string {
  if (a.kind === "link") return linkHost(a.url);
  const m = a.mime ?? "";
  if (m === "application/pdf") return "PDF";
  if (m.includes("presentation") || m.includes("powerpoint") || m.includes("keynote")) {
    return "Slideshow";
  }
  if (m.includes("wordprocessingml") || m === "application/msword") return "Document";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || m === "text/csv") {
    return "Spreadsheet";
  }
  if (m.startsWith("image/")) return "Picture";
  return "File";
}

/** The site, not the whole address — a URL is a destination, not prose. */
export function linkHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "docs.google.com" && url.includes("/presentation/")) return "Google Slides";
    if (h === "docs.google.com") return "Google Docs";
    if (h === "drive.google.com") return "Google Drive";
    if (h === "canva.com") return "Canva";
    if (h === "youtube.com" || h === "youtu.be") return "YouTube";
    return h;
  } catch {
    return "Link";
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function KindIcon({ a }: { a: PostAttachment }) {
  const cls = "size-4 shrink-0 text-primary";
  if (a.kind === "link") return <Link2 aria-hidden className={cls} />;
  const m = a.mime ?? "";
  if (m.includes("presentation") || m.includes("powerpoint") || m.includes("keynote")) {
    return <Presentation aria-hidden className={cls} />;
  }
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv") {
    return <Sheet aria-hidden className={cls} />;
  }
  return <FileText aria-hidden className={cls} />;
}

export function PostAttachments({ attachments }: { attachments: PostAttachment[] | undefined }) {
  if (!attachments?.length) return null;
  const pictures = attachments.filter((a) => a.kind === "file" && a.mime?.startsWith("image/"));
  const rest = attachments.filter((a) => !pictures.includes(a));

  return (
    <div className="flex flex-col gap-2">
      {pictures.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {pictures.map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
              title={a.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className="h-28 rounded-lg bg-muted object-cover"
                loading="lazy"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rest.map((a) => (
            <li key={a.url}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent"
              >
                <KindIcon a={a} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {attachmentKindLabel(a)}
                    {a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ""}
                    {a.kind === "file" && a.mime && a.mime !== "application/pdf" && !a.mime.startsWith("image/")
                      ? " · downloads"
                      : ""}
                  </span>
                </span>
                <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

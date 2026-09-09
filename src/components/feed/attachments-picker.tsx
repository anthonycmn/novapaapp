"use client";

import { useRef, useState } from "react";
import { Link2, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachmentKindLabel, formatBytes } from "@/components/feed/post-attachments";

/**
 * The attachments on a new post, as staff build the list (hub 0076).
 *
 * A file goes straight from the browser to storage the moment it is picked,
 * by the same sign-then-PUT road the audition uploads take: the server signs
 * a one-shot URL and steps aside, so a 40 MB slideshow never meets the 4 MB
 * server-action body limit. What the form carries back is a hidden input
 * holding the list as JSON — for a file, only the storage PATH the server
 * handed out, never a URL, so the action rebuilds the address itself.
 *
 * A link is a URL somebody else hosts — Google Slides, Canva, an unlisted
 * YouTube video — with a label, because "docs.google.com/presentation/d/1x…"
 * is not what a parent should have to read to decide whether to tap.
 */

type PickedAttachment =
  | { kind: "file"; name: string; path: string; mime?: string; sizeBytes?: number }
  | { kind: "link"; name: string; url: string };

const ACCEPT = ".pdf,.pptx,.ppt,.key,.docx,.doc,.xlsx,.xls,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  key: "application/vnd.apple.keynote",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/**
 * A browser routinely hands over an empty type for a .pptx or a .key, and the
 * signing route refuses a file it cannot name — so the extension speaks when
 * the browser does not.
 */
function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "";
}

function normalizeLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function AttachmentsPicker({ onDirty }: { onDirty?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PickedAttachment[]>([]);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [error, setError] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  function update(next: PickedAttachment[]) {
    setItems(next);
    onDirty?.();
  }

  async function uploadOne(file: File): Promise<PickedAttachment> {
    const contentType = mimeOf(file);
    const signResponse = await fetch("/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket: "feed-attachments",
        contentType,
        sizeBytes: file.size,
        fileName: file.name,
      }),
    });
    const signed = await signResponse.json();
    if (!signResponse.ok) throw new Error(signed.error ?? "Could not start the upload");

    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", signed.uploadUrl);
      request.setRequestHeader("Content-Type", contentType);
      request.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, progress } : x)));
        }
      };
      request.onload = () =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${request.status})`));
      request.onerror = () => reject(new Error("The upload was interrupted. Please try again."));
      request.send(file);
    });

    return {
      kind: "file",
      name: file.name,
      path: signed.path,
      mime: contentType || undefined,
      sizeBytes: file.size,
    };
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    setError("");
    setUploading((u) => [...u, ...files.map((f) => ({ name: f.name, progress: 0 }))]);
    // One at a time, in the order picked, so a failure names the one file.
    let next = items;
    for (const file of files) {
      try {
        const picked = await uploadOne(file);
        next = [...next, picked];
        update(next);
      } catch (cause) {
        setError(`${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
      } finally {
        setUploading((u) => u.filter((x) => x.name !== file.name));
      }
    }
  }

  function addLink() {
    const url = normalizeLink(linkUrl);
    if (!url) {
      setError("That does not look like a web address. It should start with https://");
      return;
    }
    setError("");
    update([...items, { kind: "link", name: linkName.trim() || url, url }]);
    setLinkUrl("");
    setLinkName("");
    setAddingLink(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Attachments (optional)</span>
      <input type="hidden" name="attachments" value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((a, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border p-2 text-[13px]">
              <Input
                aria-label="Label families see"
                value={a.name}
                onChange={(e) =>
                  update(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                className="h-9 min-w-0 flex-1"
              />
              <span className="shrink-0 text-[11.5px] text-muted-foreground">
                {attachmentKindLabel(
                  a.kind === "file"
                    ? { kind: "file", name: a.name, url: "https://x/", mime: a.mime }
                    : a
                )}
                {a.kind === "file" && a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ""}
              </span>
              <button
                type="button"
                onClick={() => update(items.filter((_, j) => j !== i))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${a.name}`}
              >
                <X aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploading.map((u) => (
        <div key={u.name} className="rounded-md border p-2.5 text-[13px]">
          <div className="flex items-center gap-2">
            <Upload aria-hidden size={15} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            <span className="tabular-nums text-muted-foreground">{u.progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={u.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${u.name}`}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${u.progress}%` }}
            />
          </div>
        </div>
      ))}

      {addingLink ? (
        <div className="flex flex-col gap-2 rounded-md border p-2.5">
          <Input
            aria-label="Web address"
            placeholder="https://docs.google.com/presentation/…"
            value={linkUrl}
            autoFocus
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <Input
            aria-label="Label (optional)"
            placeholder="Label families see, e.g. Parent Night slides"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={addLink}>
              Add link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingLink(false);
                setLinkUrl("");
                setLinkName("");
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Check the link opens for somebody who is not signed in as you — a Google file is
            Restricted until you share it.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={onPick}
            className="sr-only"
            id="feed-attachment-file"
            aria-label="Attach a file"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip aria-hidden />
            Attach a file
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddingLink(true)}>
            <Link2 aria-hidden />
            Add a link
          </Button>
        </div>
      )}

      {error ? (
        <p className="text-[12.5px] text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Slides, PDFs, documents and pictures up to 50 MB. A PDF opens right in the browser; a
          PowerPoint downloads — export slides to PDF if you can. Attachments are as public as
          the lobby noticeboard.
        </p>
      )}
    </div>
  );
}

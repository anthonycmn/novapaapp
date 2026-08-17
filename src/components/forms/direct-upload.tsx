"use client";

import { useRef, useState } from "react";
import { Check, FileVideo, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A file that goes straight from the browser to storage.
 *
 * The server signs a one-shot URL and then steps out of the way, so a 300 MB
 * self-tape never passes through a serverless function — it cannot, since the
 * request-body cap on this host is 6 MB. What comes back into the form is a
 * hidden input carrying the file's address.
 *
 * A phone upload on a home connection is minutes, not seconds, so the progress
 * bar is not decoration: without it a parent assumes it has hung and reloads,
 * and reloading halfway through is how you lose a video and the goodwill with
 * it. XMLHttpRequest rather than fetch purely because it reports upload
 * progress and fetch still does not.
 */
export function DirectUpload({
  name,
  bucket,
  studentId,
  label,
  accept,
  hint,
  existingUrl,
}: {
  /** Form field carrying the resulting URL. */
  name: string;
  bucket: string;
  studentId: string;
  label: string;
  accept: string;
  hint?: string;
  existingUrl?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(existingUrl ?? "");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    setProgress(0);

    try {
      const signResponse = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket,
          studentId,
          contentType: file.type,
          sizeBytes: file.size,
          fileName: file.name,
        }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error ?? "Could not start the upload");

      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", signed.uploadUrl);
        request.setRequestHeader("Content-Type", file.type);
        request.upload.onprogress = (progressEvent) => {
          if (progressEvent.lengthComputable) {
            setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${request.status})`));
        request.onerror = () =>
          reject(new Error("The upload was interrupted. Please try again."));
        request.send(file);
      });

      setUrl(signed.publicUrl);
      setProgress(100);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setProgress(null);
      setFileName("");
    } finally {
      // Let the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const uploading = progress !== null && progress < 100;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {/* The empty string is meaningful: it CLEARS the stored file, where a
          missing field would leave it alone. */}
      <input type="hidden" name={name} value={url} />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onPick}
        className="sr-only"
        id={`upload-${name}`}
        aria-label={label}
      />

      {url ? (
        <div className="flex items-center gap-2 rounded-md border p-2.5">
          <Check aria-hidden className="size-4 shrink-0 text-primary" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-[13px] text-primary underline-offset-4 hover:underline"
          >
            {fileName || "Uploaded — view"}
          </a>
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setFileName("");
              setProgress(null);
            }}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${label}`}
          >
            <Trash2 aria-hidden size={14} />
          </button>
        </div>
      ) : uploading ? (
        <div className="rounded-md border p-2.5">
          <div className="flex items-center gap-2 text-[13px]">
            <FileVideo aria-hidden size={15} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{fileName}</span>
            <span className="tabular-nums text-muted-foreground">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${label}`}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Keep this page open until it finishes.
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="justify-start"
        >
          <Upload aria-hidden />
          Choose a file
        </Button>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-destructive">
          <X aria-hidden size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

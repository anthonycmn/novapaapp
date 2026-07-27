"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, ZoomIn } from "lucide-react";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

/**
 * Headshot cropper with an 8×10 guide (#4).
 *
 * Theatrical headshots are 8"×10" — a 0.8 aspect ratio. Rather than make a
 * parent crop precisely, we show a fixed 8×10 frame and let them pan and zoom
 * the photo behind it. On save we render two sizes from the ORIGINAL image
 * (not the on-screen preview, which would bake in the display resolution):
 *
 *   web   —  800 × 1000  for the app
 *   print — 2400 × 3000  = 300 DPI at 8×10, what a printed headshot needs
 */

const ASPECT = 0.8; // 8 ÷ 10
const WEB_WIDTH = 800;
const PRINT_WIDTH = 2400;

export interface HeadshotResult {
  webDataUrl: string;
  printDataUrl: string;
}

export function HeadshotCropper({
  currentUrl,
  onCropped,
  disabled,
}: {
  currentUrl?: string;
  onCropped: (result: HeadshotResult | null) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the chosen file into an Image we can draw to canvas later.
  useEffect(() => {
    if (!source) {
      imageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = source;
  }, [source]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const picked = await readImageFile(file);
      if (Math.min(picked.width, picked.height) < 600) {
        setError(
          `That photo is ${picked.width}×${picked.height}. Headshots print best at 1200px or more on the short side.`
        );
      }
      setSource(picked.dataUrl);
    } catch (cause) {
      setError(
        cause instanceof ImageRejectedError ? cause.message : "Could not read that photo."
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * Renders the visible crop at a target width. The on-screen frame maps to
   * the source image through `zoom` and `offset`, so we invert that mapping
   * to find the source rectangle, then draw it at full resolution.
   */
  const render = useCallback(
    (targetWidth: number): string | null => {
      const image = imageRef.current;
      const frame = frameRef.current;
      if (!image || !frame) return null;

      const frameWidth = frame.clientWidth;
      const frameHeight = frameWidth / ASPECT;

      // How the image is laid out on screen: cover the frame, then zoom.
      const coverScale = Math.max(frameWidth / image.width, frameHeight / image.height);
      const scale = coverScale * zoom;
      const drawnWidth = image.width * scale;
      const drawnHeight = image.height * scale;

      // Top-left of the drawn image relative to the frame.
      const left = (frameWidth - drawnWidth) / 2 + offset.x;
      const top = (frameHeight - drawnHeight) / 2 + offset.y;

      // The frame in source-image coordinates.
      const sx = -left / scale;
      const sy = -top / scale;
      const sw = frameWidth / scale;
      const sh = frameHeight / scale;

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = Math.round(targetWidth / ASPECT);
      const context = canvas.getContext("2d");
      if (!context) return null;

      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL("image/jpeg", 0.9);
    },
    [zoom, offset]
  );

  function save() {
    setBusy(true);
    try {
      const webDataUrl = render(WEB_WIDTH);
      const printDataUrl = render(PRINT_WIDTH);
      if (webDataUrl && printDataUrl) {
        onCropped({ webDataUrl, printDataUrl });
        setSource(null);
      }
    } finally {
      setBusy(false);
    }
  }

  /* pointer panning */
  const lastPoint = useRef({ x: 0, y: 0 });
  function onPointerDown(event: React.PointerEvent) {
    if (!source) return;
    setDragging(true);
    lastPoint.current = { x: event.clientX, y: event.clientY };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - lastPoint.current.x;
    const dy = event.clientY - lastPoint.current.y;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  }
  function onPointerUp(event: React.PointerEvent) {
    setDragging(false);
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="sr-only"
        id="headshot-file"
        disabled={disabled}
      />

      {!source && (
        <div className="flex items-center gap-4">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Current headshot"
              className="h-32 w-[102px] rounded-lg border object-cover"
            />
          ) : (
            <div className="flex h-32 w-[102px] items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">
              No headshot
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            <Upload aria-hidden />
            {currentUrl ? "Replace headshot" : "Upload headshot"}
          </Button>
        </div>
      )}

      {source && (
        <>
          <p className="text-sm text-muted-foreground">
            Drag to reposition, then set the zoom. The frame is 8×10 — the
            standard theatrical headshot shape.
          </p>

          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative mx-auto w-56 cursor-grab touch-none overflow-hidden rounded-lg border-2 bg-muted active:cursor-grabbing"
            style={{ aspectRatio: "8 / 10" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                width: "100%",
                height: "auto",
                minHeight: "100%",
                objectFit: "cover",
              }}
            />
            {/* Rule-of-thirds guide */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-1/3 border-t border-white/30" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/30" />
              <div className="absolute inset-y-0 left-1/3 border-l border-white/30" />
              <div className="absolute inset-y-0 left-2/3 border-l border-white/30" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <ZoomIn aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </label>

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={busy}>
              {busy ? "Processing…" : "Use this crop"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSource(null);
                onCropped(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}

      <FieldError message={error ?? undefined} />
    </div>
  );
}

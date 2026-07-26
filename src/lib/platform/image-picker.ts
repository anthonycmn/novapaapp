/**
 * Platform adapter: reading an image the user picked (web implementation).
 * A native wrapper swaps this for the camera/photo-library plugin while
 * keeping the same return shape.
 */

export interface PickedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  type: string;
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export class ImageRejectedError extends Error {}

/**
 * Reads a File into a data URL and measures it. Type and size are enforced
 * here (the "every uploaded file is type/size-restricted" rule); resolution
 * is returned so callers can warn about low-res prints.
 */
export async function readImageFile(file: File): Promise<PickedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageRejectedError(
      "Please choose a JPEG, PNG, or WebP photo."
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please choose one under 12 MB.`
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageRejectedError("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(new ImageRejectedError("That file doesn't look like an image."));
      image.src = dataUrl;
    }
  );

  return { dataUrl, width, height, bytes: file.size, type: file.type };
}

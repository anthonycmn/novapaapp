import { describe, expect, it } from "vitest";
import {
  BASE64_OVERHEAD,
  dataUrlBytes,
  fitWithin,
  FUNCTION_BODY_CAP_BYTES,
  MAX_ENCODED_BYTES,
  REFERENCE_PHOTO_BUDGET,
  ACCEPTED_IMAGE_TYPES,
} from "@/lib/platform/image-picker";
import { MAX_REFERENCE_PHOTOS } from "@/lib/api/photos/types";
import { UPLOAD_LIMITS } from "@/lib/api/storage";

/**
 * Why a parent's uploads all failed.
 *
 * Every photo went up as a raw base64 data URL inside a form post, and a form
 * post here is a serverless function with a 6 MB request-body cap. A phone
 * photo is 3–9 MB before base64 adds a third, so it was dropped at the edge —
 * no error of ours, nothing on screen worth reading. The face-matching form
 * sends up to four at once, which is the one that finally got reported.
 *
 * These hold the arithmetic that has to stay true.
 */

const transmitted = (bytes: number) => bytes * BASE64_OVERHEAD;

describe("what actually fits in a request", () => {
  it("keeps one re-encoded photo inside the body cap", () => {
    expect(transmitted(MAX_ENCODED_BYTES)).toBeLessThan(FUNCTION_BODY_CAP_BYTES);
  });

  it("keeps a full set of face-matching photos inside the body cap", () => {
    // The case that broke: four photos, one request.
    const worstCase = transmitted(REFERENCE_PHOTO_BUDGET.maxBytes! * MAX_REFERENCE_PHOTOS);
    expect(worstCase).toBeLessThan(FUNCTION_BODY_CAP_BYTES);
  });

  it("leaves room for the rest of the form, not just the photos", () => {
    const worstCase = transmitted(REFERENCE_PHOTO_BUDGET.maxBytes! * MAX_REFERENCE_PHOTOS);
    expect(FUNCTION_BODY_CAP_BYTES - worstCase).toBeGreaterThan(1024 * 1024);
  });
});

describe("the format that leaves the browser", () => {
  it("re-encodes to something storage will accept", () => {
    // HEIC is offered to the parent but never sent; the picker always emits
    // JPEG, which is why this has to be in the bucket's list.
    expect(UPLOAD_LIMITS["button-photos"].contentTypes).toContain("image/jpeg");
    expect(UPLOAD_LIMITS["reference-photos"].contentTypes).toContain("image/jpeg");
  });

  it("lets an iPhone hand over its own camera roll", () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain("image/heic");
  });
});

describe("scaling a photo down", () => {
  it("leaves a photo already inside the limit alone", () => {
    expect(fitWithin(1200, 900, 3200)).toEqual({ width: 1200, height: 900 });
  });

  it("scales the long edge to the cap and keeps the shape", () => {
    expect(fitWithin(6000, 4000, 3200)).toEqual({ width: 3200, height: 2133 });
  });

  it("works the same on a portrait photo", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never scales below a single pixel", () => {
    expect(fitWithin(10000, 1, 100).height).toBe(1);
  });
});

describe("measuring a data URL", () => {
  it("counts the bytes a data URL really carries", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const base64 = Buffer.from(bytes).toString("base64");
    expect(dataUrlBytes(`data:image/jpeg;base64,${base64}`)).toBe(5);
  });

  it("handles both padding lengths", () => {
    for (const size of [3, 4, 5, 6, 7, 8]) {
      const base64 = Buffer.from(new Uint8Array(size)).toString("base64");
      expect(dataUrlBytes(`data:image/jpeg;base64,${base64}`)).toBe(size);
    }
  });
});

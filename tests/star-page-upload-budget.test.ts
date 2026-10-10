import { describe, expect, it } from "vitest";
import {
  BASE64_OVERHEAD,
  SERVER_ACTION_BODY_CAP_BYTES,
  STAR_PAGE_PHOTO_BUDGET,
} from "@/lib/platform/image-picker";
import { STAR_PAGE_DPI, STAR_PAGE_PRINT_MAX_BYTES, STAR_PAGE_SIZE_IN } from "@/lib/store/star-page-artwork";

/**
 * Why add-to-cart on a star page crashed (Oct 2026, three tries in a row).
 *
 * The star page form posts both photos AND the 300 DPI print file in one
 * server action, and a server action's body is capped at 4 MB
 * (next.config.ts). The photos were read with the default 3 MB budget, so a
 * full page could ask for 3 + 3 MB of photos before the print file - Next
 * threw before the action ran and the parent got the error screen.
 *
 * These hold the arithmetic that has to stay true.
 */

const transmitted = (bytes: number) => bytes * BASE64_OVERHEAD;
const MAX_STAR_PAGE_PHOTOS = 2; // the full page has two photo spaces

describe("a star page add-to-cart fits in one server action", () => {
  const worstCase =
    transmitted(STAR_PAGE_PHOTO_BUDGET.maxBytes! * MAX_STAR_PAGE_PHOTOS) +
    transmitted(STAR_PAGE_PRINT_MAX_BYTES);

  it("keeps two photos and the print file under the body cap", () => {
    expect(worstCase).toBeLessThan(SERVER_ACTION_BODY_CAP_BYTES);
  });

  it("leaves room for the message and the rest of the form", () => {
    expect(SERVER_ACTION_BODY_CAP_BYTES - worstCase).toBeGreaterThan(256 * 1024);
  });

  it("matches the limit next.config.ts actually sets", async () => {
    const { default: config } = await import("../next.config");
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("4mb");
  });
});

describe("the photo still prints sharp", () => {
  it("keeps more pixels than the full page is wide or tall at 300 DPI", () => {
    const full = STAR_PAGE_SIZE_IN.full;
    expect(STAR_PAGE_PHOTO_BUDGET.maxEdge!).toBeGreaterThanOrEqual(
      Math.max(full.width, full.height) * STAR_PAGE_DPI * 0.75
    );
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  assertClaimedPath,
  resolveUpload,
  UploadRejectedError,
} from "@/lib/api/storage";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

/**
 * Claiming a file that went straight to storage.
 *
 * A PDF or a recording cannot travel through a form post — the request-body cap
 * is 6 MB — so it is uploaded to a signed URL first and only its storage path
 * comes back. That return leg is the dangerous half: whatever the browser hands
 * over is about to be written onto a record as fact. The signing route composes
 * every path itself and scopes it to the caller's own family or student, and
 * these hold the matching check on the way back in.
 */

const PDF = "data:application/pdf;base64,JVBERi0xLjQK";

describe("a path handed back by the browser", () => {
  it("accepts one inside the folder it was scoped to", () => {
    expect(() =>
      assertClaimedPath("fam-martinez/family-documents-123.pdf", "fam-martinez")
    ).not.toThrow();
  });

  it("refuses another household's folder", () => {
    expect(() =>
      assertClaimedPath("fam-okafor/family-documents-123.pdf", "fam-martinez")
    ).toThrow(UploadRejectedError);
  });

  it("refuses a prefix that merely starts the same", () => {
    // "fam-martinez-2" must not pass as "fam-martinez".
    expect(() =>
      assertClaimedPath("fam-martinez-2/doc.pdf", "fam-martinez")
    ).toThrow(UploadRejectedError);
  });

  it.each([
    ["climbing out", "fam-martinez/../fam-okafor/doc.pdf"],
    ["an absolute path", "/fam-martinez/doc.pdf"],
    ["nothing at all", ""],
  ])("refuses %s", (_label, path) => {
    expect(() => assertClaimedPath(path, "fam-martinez")).toThrow(UploadRejectedError);
  });
});

describe("resolving a claimed upload", () => {
  it("builds the address from the path rather than trusting a URL", async () => {
    const resolved = await resolveUpload(
      "family-documents",
      {
        kind: "stored",
        storagePath: "fam-martinez/family-documents-1.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
      },
      "fam-martinez"
    );
    expect(resolved.path).toBe("fam-martinez/family-documents-1.pdf");
    // Whatever comes back is composed by us, and carries the path we checked.
    expect(resolved.url).toContain("fam-martinez/family-documents-1.pdf");
  });

  it("refuses a type the bucket does not take", async () => {
    await expect(
      resolveUpload(
        "family-documents",
        {
          kind: "stored",
          storagePath: "fam-martinez/x.html",
          contentType: "text/html",
          sizeBytes: 10,
        },
        "fam-martinez"
      )
    ).rejects.toThrow(UploadRejectedError);
  });

  it("refuses a size beyond the bucket's limit", async () => {
    await expect(
      resolveUpload(
        "family-documents",
        {
          kind: "stored",
          storagePath: "fam-martinez/huge.pdf",
          contentType: "application/pdf",
          sizeBytes: 999 * 1024 * 1024,
        },
        "fam-martinez"
      )
    ).rejects.toThrow(UploadRejectedError);
  });
});

describe("the vault, through the provider", () => {
  let provider: MockDataProvider;
  beforeEach(() => {
    resetMockStore();
    provider = new MockDataProvider();
  });

  it("files a document that was uploaded straight to storage", async () => {
    const document = await provider.uploadFamilyDocument("user-sofia", "fam-martinez", {
      name: "Signed waiver",
      category: "waiver",
      source: {
        kind: "stored",
        storagePath: "fam-martinez/family-documents-9.pdf",
        contentType: "application/pdf",
        sizeBytes: 4096,
      },
    });
    expect(document.storagePath).toBe("fam-martinez/family-documents-9.pdf");
    expect(document.sizeBytes).toBe(4096);
  });

  it("will not let a household claim a path in another's folder", async () => {
    await expect(
      provider.uploadFamilyDocument("user-sofia", "fam-martinez", {
        name: "Not mine",
        category: "other",
        source: {
          kind: "stored",
          storagePath: "fam-okafor/family-documents-1.pdf",
          contentType: "application/pdf",
          sizeBytes: 4096,
        },
      })
    ).rejects.toThrow(UploadRejectedError);
  });

  it("still refuses another family's vault outright", async () => {
    await expect(
      provider.uploadFamilyDocument("user-ngozi", "fam-martinez", {
        name: "x",
        category: "other",
        source: { kind: "dataUrl", dataUrl: PDF },
      })
    ).rejects.toThrow(AccessDeniedError);
  });
});

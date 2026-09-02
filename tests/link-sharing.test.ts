import { describe, expect, it } from "vitest";
import { hostOf, sharingReminder } from "@/lib/link-sharing";

/**
 * The reminder has to fire on the links families actually paste, and stay quiet
 * otherwise. A notice that appears on every link is one nobody reads by the
 * third field.
 */

describe("hostOf", () => {
  it("recognises the services a self-tape actually lives on", () => {
    expect(hostOf("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
    expect(hostOf("https://youtu.be/abc123")).toBe("youtube");
    expect(hostOf("https://drive.google.com/file/d/1a2b3c/view")).toBe("drive");
    expect(hostOf("https://docs.google.com/document/d/1a2b/edit")).toBe("drive");
    expect(hostOf("https://www.dropbox.com/s/abc/tape.mov?dl=0")).toBe("dropbox");
    expect(hostOf("https://1drv.ms/v/s!abc")).toBe("onedrive");
    expect(hostOf("https://www.icloud.com/iclouddrive/abc")).toBe("icloud");
  });

  it("is not fooled by a lookalike domain", () => {
    // The check is on the hostname, not on the string containing "drive".
    expect(hostOf("https://drive.google.com.example.com/file")).toBe("other");
    expect(hostOf("https://example.com/youtube.com/watch")).toBe("other");
  });

  it("says nothing about an empty or non-web value", () => {
    expect(hostOf("")).toBeNull();
    expect(hostOf("   ")).toBeNull();
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf("not a link")).toBeNull();
  });
});

describe("sharingReminder", () => {
  it("warns that a YouTube upload defaults to Private", () => {
    const reminder = sharingReminder("https://youtu.be/abc123");
    expect(reminder?.tone).toBe("warn");
    expect(reminder?.title).toMatch(/unlisted/i);
    expect(reminder?.steps.join(" ")).toMatch(/private/i);
  });

  it("gives Drive's own words for the setting that has to change", () => {
    const steps = sharingReminder("https://drive.google.com/file/d/1a2b3c/view")?.steps ?? [];
    expect(steps.join(" ")).toMatch(/Anyone with the link/);
    expect(steps.join(" ")).toMatch(/Restricted/);
  });

  it("tells Dropbox users to copy the share link, not the address bar", () => {
    const steps = sharingReminder("https://www.dropbox.com/s/abc/tape.mov")?.steps ?? [];
    expect(steps.join(" ")).toMatch(/address bar/i);
  });

  it("stays quiet for a link it has no real instructions for", () => {
    expect(sharingReminder("https://vimeo.com/123456")).toBeNull();
    expect(sharingReminder("https://example.org/tape.mp4")).toBeNull();
    expect(sharingReminder("")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  collectEnvironment,
  describeEnvironment,
  type BugEnvironment,
} from "@/lib/bug-report/environment";

/**
 * The system information a parent should not have to type.
 *
 * Yin, 8 Sep 2026: "I also found it harder to report iOS bugs because I shall
 * provide system information (eg, browser, iOS version) to help developers
 * replicate them" — and, in the same message, "Ask AI to write the test
 * case(s) whenever a bug is fixed or a feature is developed!"
 *
 * The user agents below are real ones, hers first. They are the only part of
 * this feature that can be wrong in a way nobody notices: a report that says
 * Safari when it means Chrome sends the next hour of work to the wrong
 * browser.
 */

const AGENTS = {
  // Yin's own: iPhone 17, iOS 26.6.1, Safari.
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  // Chrome on an iPhone is Safari underneath and says so twice.
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Version/18.0 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.51",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

/** A browser, near enough for the eight things this reads off one. */
function fakeWindow(userAgent: string, extra: Partial<Window> = {}) {
  return {
    navigator: { userAgent, platform: "test", onLine: true },
    location: { href: "https://portal.novapa.org/dashboard?token=secret" },
    innerWidth: 393,
    innerHeight: 852,
    devicePixelRatio: 3,
    matchMedia: () => ({ matches: false }),
    ...extra,
  } as unknown as Window;
}

describe("reading the browser a bug happened in", () => {
  it("names Yin's phone the way she named it", () => {
    const env = collectEnvironment(fakeWindow(AGENTS.iosSafari), "abc1234");
    expect(env.device).toBe("iPhone · iOS 26.6.1");
    expect(env.browser).toBe("Safari 26");
  });

  it("does not call Chrome on an iPhone Safari", () => {
    expect(collectEnvironment(fakeWindow(AGENTS.iosChrome)).browser).toBe("Chrome 126");
  });

  it("does not call Edge Chrome", () => {
    expect(collectEnvironment(fakeWindow(AGENTS.windowsEdge)).browser).toBe("Edge 124");
  });

  it("reads Android and Mac too", () => {
    const android = collectEnvironment(fakeWindow(AGENTS.androidChrome));
    expect(android.device).toBe("Android 14 · Pixel 8");
    expect(android.browser).toBe("Chrome 125");

    const mac = collectEnvironment(fakeWindow(AGENTS.macSafari));
    expect(mac.device).toBe("Mac · macOS 10.15.7");
    expect(mac.browser).toBe("Safari 17");
  });

  it("says it does not know rather than guessing", () => {
    const env = collectEnvironment(fakeWindow("some robot"));
    expect(env.device).toBe("test");
    expect(env.browser).toBe("Unknown browser");
  });

  it("stamps a time that fits on a phone", () => {
    const env = collectEnvironment(fakeWindow(AGENTS.iosSafari));
    // "Sep 10, 2026, 1:53 PM EDT" — short enough to read without scrolling
    // sideways, and it names the zone so it can be matched against a log.
    expect(env.reportedAt.length).toBeLessThan(34);
    expect(env.reportedAt).toMatch(/\d{4}/);
  });

  it("keeps the page but never the query string", () => {
    // The office-issued sign-in links put a one-time token there, and a bug
    // report is not a place to copy one.
    const env = collectEnvironment(fakeWindow(AGENTS.iosSafari));
    expect(env.page).toBe("/dashboard");
    expect(JSON.stringify(env)).not.toContain("secret");
  });

  it("knows the portal from the home screen", () => {
    const installed = collectEnvironment(
      fakeWindow(AGENTS.iosSafari, {
        matchMedia: (() => ({ matches: true })) as unknown as Window["matchMedia"],
      })
    );
    expect(installed.installed).toBe(true);
  });
});

describe("what the reporter is shown before they send", () => {
  const env: BugEnvironment = {
    page: "/dashboard",
    reportedAt: "Sep 8, 2026, 9:02 PM EDT",
    device: "iPhone · iOS 26.6.1",
    browser: "Safari 26",
    screen: "393 × 852 at 3×",
    installed: false,
    build: "abc1234",
    online: true,
  };

  it("shows every field that will be sent", () => {
    const shown = describeEnvironment(env);
    for (const value of [env.page, env.device, env.browser, env.screen, env.build]) {
      expect(shown).toContain(value);
    }
  });

  it("mentions the network only when it was the problem", () => {
    expect(describeEnvironment(env)).not.toContain("OFFLINE");
    expect(describeEnvironment({ ...env, online: false })).toContain("OFFLINE");
  });
});

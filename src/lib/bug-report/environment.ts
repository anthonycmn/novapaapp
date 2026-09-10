/**
 * What the browser can tell us about where a bug happened.
 *
 * Yin, a parent, 8 Sep 2026: "I also found it harder to report iOS bugs
 * because I shall provide system information (eg, browser, iOS version) to
 * help developers replicate them."
 *
 * She had been doing this by hand, and doing it well — her report named iOS
 * 26.6.1 on an iPhone 17, which is how we knew to check whether the bug was
 * hers or ours. Nobody should have to. Every field below is already sitting in
 * the page; none of it needs a permission prompt, and none of it is worth
 * anything to anybody but us.
 *
 * It is COLLECTED here and SHOWN, verbatim, on the form before it is sent —
 * see describeEnvironment. That is the whole consent design: a parent reads
 * the eight lines that will travel with their report and presses Send, or
 * doesn't. Nothing is gathered in the background, and nothing is gathered
 * unless they are already typing a report.
 */

export interface BugEnvironment {
  /** The page they were on, path only — never the query string. */
  page: string;
  /**
   * Local time where the reporter is, named zone included — "Sep 10, 2026,
   * 1:53 PM EDT". Their clock rather than ours: "it broke at 7" is the only
   * timestamp they have, and it has to be matchable against a log.
   */
  reportedAt: string;
  /** "iPhone · iOS 26.6.1", as best the browser will admit to. */
  device: string;
  /** "Safari 26" — the thing a fix has to be checked against. */
  browser: string;
  /** "393 × 852 at 3×" — the difference between a layout bug and a real one. */
  screen: string;
  /** Installed to the home screen, or open in a browser tab. */
  installed: boolean;
  /** Which build was serving them. Reports outlive deploys. */
  build: string;
  /** Offline reports are usually not bugs, and this is how we tell. */
  online: boolean;
}

/**
 * A query string can carry a token — the office-issued sign-in links do — so
 * only the path is ever recorded, and an id inside it is enough to find the
 * page again anyway.
 */
function pagePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0] || "/";
  }
}

/**
 * The version of the OS, where the browser says it out loud.
 *
 * Safari's user agent writes iOS as "OS 26_6_1", which is not a number
 * anybody types, so it is put back the way Yin wrote it. Android and Windows
 * are already readable. Anything else is left alone rather than guessed at: a
 * wrong version is worse than a missing one, because it sends the fix to the
 * wrong platform.
 */
function deviceFrom(userAgent: string, platformHint?: string): string {
  const ios = userAgent.match(/(iPhone|iPad); CPU (?:iPhone )?OS (\d+[\d_]*)/);
  if (ios) return `${ios[1]} · iOS ${ios[2].replace(/_/g, ".")}`;

  const mac = userAgent.match(/Mac OS X (\d+[\d_]*)/);
  if (mac) return `Mac · macOS ${mac[1].replace(/_/g, ".")}`;

  const android = userAgent.match(/Android (\d+(?:\.\d+)*)(?:; ([^;)]+))?/);
  if (android) {
    const model = android[2]?.replace(/\s+Build.*/, "").trim();
    return `Android ${android[1]}${model ? ` · ${model}` : ""}`;
  }

  if (/Windows NT 10\.0/.test(userAgent)) return "Windows 10 or 11";
  const windows = userAgent.match(/Windows NT ([\d.]+)/);
  if (windows) return `Windows NT ${windows[1]}`;

  return platformHint || "Unknown device";
}

/**
 * Which browser, in the order the checks have to happen: every browser on an
 * iPhone claims to be Safari, and Edge and Chrome both claim to be the other.
 */
function browserFrom(userAgent: string): string {
  /*
   * Order is the whole of it, and it runs most-specific first: Edge's user
   * agent contains Chrome's, Chrome's contains Safari's, and on an iPhone all
   * three contain Safari's because Apple requires the same engine underneath.
   * Read the other way round, every browser on Yin's phone would report as
   * Safari and a fix would be checked in the wrong one.
   */
  const candidates: Array<[RegExp, string]> = [
    [/(?:EdgiOS|EdgA|Edg)\/(\d+)/, "Edge"],
    [/(?:CriOS|Chrome)\/(\d+)/, "Chrome"],
    [/(?:FxiOS|Firefox)\/(\d+)/, "Firefox"],
    [/Version\/(\d+)[\d.]*.*Safari/, "Safari"],
  ];
  for (const [pattern, name] of candidates) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return "Unknown browser";
}

/**
 * "Sep 10, 2026, 1:53 PM EDT".
 *
 * Not Date.toString(), whose "(Eastern Daylight Time)" runs off the right of a
 * phone — and a line a parent cannot finish reading is a line they have not
 * agreed to. Written out field by field rather than with dateStyle/timeStyle,
 * because timeZoneName may not be combined with those and the whole form
 * throws if it is: the test for this caught exactly that, which is the reason
 * Yin's second suggestion — write the test with the feature — is in this file
 * as well as her first.
 *
 * The try/catch is for the same reason. Nothing about a timestamp is worth a
 * form that will not open.
 */
function localStamp(now: Date): string {
  try {
    return now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return now.toISOString();
  }
}

/** Everything above, read off one browser. Safe to call in any client render. */
export function collectEnvironment(
  win: Window = window,
  build = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
): BugEnvironment {
  const nav = win.navigator;
  const userAgent = nav?.userAgent ?? "";
  return {
    page: pagePath(win.location?.href ?? "/"),
    reportedAt: localStamp(new Date()),
    device: deviceFrom(userAgent, nav?.platform),
    browser: browserFrom(userAgent),
    screen: `${win.innerWidth} × ${win.innerHeight} at ${win.devicePixelRatio ?? 1}×`,
    installed: Boolean(win.matchMedia?.("(display-mode: standalone)")?.matches),
    build,
    online: nav?.onLine ?? true,
  };
}

/**
 * The block a reporter reads before they send it, and the same block CJ reads
 * in the email. One rendering, so there is no version of this that the person
 * who sent it never saw.
 */
export function describeEnvironment(env: BugEnvironment): string {
  return [
    `Page:     ${env.page}`,
    `When:     ${env.reportedAt}`,
    `Device:   ${env.device}`,
    `Browser:  ${env.browser}`,
    `Window:   ${env.screen}`,
    `Opened:   ${env.installed ? "installed on the home screen" : "in a browser tab"}`,
    `Build:    ${env.build}`,
    ...(env.online ? [] : ["Network:  OFFLINE when this was sent"]),
  ].join("\n");
}

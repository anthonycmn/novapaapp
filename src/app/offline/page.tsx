import { org } from "@/config/org";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      {/* Plain <img>: the offline shell must render without Next's image
          optimizer, which needs a network round-trip. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/novapa-logo.png" alt="" aria-hidden width={72} height={72} />
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        No connection right now — theater basements will do that. Pages
        you&apos;ve visited recently still work.
      </p>
      {/* Plain <a> links, on purpose: this page renders OUTSIDE the app
          shell, so there is no sidebar here — the old copy said "use the
          navigation" on a page that had none (Sep 5 2026 audit). These load
          from the service worker's cache. */}
      <p className="flex flex-wrap justify-center gap-4 text-sm font-medium">
        <a className="underline underline-offset-4" href="/schedule">
          Your schedule
        </a>
        <a className="underline underline-offset-4" href="/dashboard">
          Dashboard
        </a>
        <a className="underline underline-offset-4" href="/family/documents">
          Documents
        </a>
      </p>
      <p className="text-sm text-muted-foreground">{org.appName}</p>
    </main>
  );
}

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
        you&apos;ve visited recently (including your schedule) are still
        available from the navigation.
      </p>
      <p className="text-sm text-muted-foreground">{org.appName}</p>
    </main>
  );
}

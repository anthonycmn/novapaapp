import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <span aria-hidden className="text-5xl">🔦</span>
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that</h1>
      <p className="max-w-sm text-muted-foreground">
        The page may have moved, or you may not have access to it.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}

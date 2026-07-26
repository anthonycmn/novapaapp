"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Error boundary for the whole authenticated app. Shows a human message and
 * a way forward rather than a stack trace — the audience is a parent on a
 * phone, not a developer.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span aria-hidden className="text-4xl">🎭</span>
          <h1 className="text-xl font-semibold">Something went wrong backstage</h1>
          <p className="text-sm text-muted-foreground">
            That page didn&apos;t load. Try again — if it keeps happening, let
            the front office know.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
              Go home
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

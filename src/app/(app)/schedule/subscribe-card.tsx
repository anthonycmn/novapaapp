"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * iCal subscription (#5). The webcal:// scheme makes Apple Calendar and
 * Outlook subscribe (rather than one-time import); Google needs the https
 * URL pasted into "From URL".
 *
 * `feedUrl` arrives absolute, built on the server from the request host. It
 * used to be assembled here from `window.location.origin`, which is empty
 * during SSR — so the server shipped "/api/calendar/…" and the client
 * hydrated "http://host/api/calendar/…", and React tore down and re-rendered
 * this whole subtree on every visit to /schedule.
 */
export function SubscribeCard({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);

  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the URL is visible for manual copy.
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle as="h2" className="text-base">
          Add to your phone&apos;s calendar
        </CardTitle>
        <CardDescription>
          Subscribe once and every rehearsal change syncs automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="flex flex-wrap gap-2">
          <a
            href={webcalUrl}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Apple / Outlook
          </a>
          <a
            href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            Google Calendar
          </a>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p className="break-all rounded-lg bg-muted p-2 font-mono text-xs text-muted-foreground">
          {feedUrl}
        </p>
        <p className="text-xs text-muted-foreground">
          This link is private to your family — anyone with it can see your
          schedule, so don&apos;t post it publicly.
        </p>
      </CardContent>
    </Card>
  );
}

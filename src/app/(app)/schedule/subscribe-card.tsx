"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { resetCalendarLinkAction } from "@/lib/actions/calendar";
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
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, startReset] = useTransition();

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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            This link is private to your family — anyone with it can see your
            schedule, so don&apos;t post it publicly.
          </span>
          {/* The lever that warning always implied. Two taps on purpose: a
              reset silently unsubscribes every device on the old link. */}
          {confirmingReset ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-foreground">
                Every subscribed device will need the new link.
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={resetting}
                onClick={() =>
                  startReset(async () => {
                    await resetCalendarLinkAction();
                    setConfirmingReset(false);
                  })
                }
              >
                {resetting ? "Resetting…" : "Yes, reset it"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                Keep it
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:text-foreground"
            >
              <RotateCcw aria-hidden size={12} /> Leaked? Reset the link
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

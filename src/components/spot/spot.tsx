"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, MessageCircleQuestion, Send, X } from "lucide-react";
import { askSpot, SPOT_SUGGESTIONS } from "@/lib/spot/match";
import type { SpotAnswer } from "@/lib/spot/knowledge";
import { cn } from "@/lib/utils";

/**
 * Spot — the portal's help desk, and free to run.
 *
 * Everything Spot knows is compiled into the bundle and matched in the
 * browser: no API key, no per-message cost, no request leaving the page, and
 * nothing to keep paying for as families grow. That is not a compromise made
 * to save money so much as the reason Spot can be trusted at all — it cannot
 * improvise a refund policy or a medication instruction, because it has no
 * capacity to write a sentence nobody wrote first.
 *
 * When it does not recognize a question it says so and offers the message
 * form, which reaches a named person. "I don't know, here is who does" is a
 * better answer than a plausible guess, and it is the one a parent can act on.
 */

interface Turn {
  question: string;
  answers: SpotAnswer[];
}

export function Spot() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Escape closes it — a help panel that traps you is not help.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setTurns((current) => [
      ...current,
      { question: trimmed, answers: askSpot(trimmed).map((match) => match.answer) },
    ]);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5",
          "bg-card shadow-lg transition-colors gold-band gold-hover sm:bottom-6"
        )}
      >
        {open ? (
          <X aria-hidden size={17} />
        ) : (
          <MessageCircleQuestion aria-hidden size={17} />
        )}
        <span className="text-[13px] font-semibold">
          {open ? "Close" : "Ask Spot"}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Ask Spot"
          className="fixed bottom-20 right-4 z-40 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-lg border bg-card shadow-xl sm:bottom-[5.5rem]"
        >
          <div className="gold-band border-b px-4 py-2.5">
            <p className="text-[13px] font-semibold">Spot</p>
            <p className="text-[11.5px] opacity-80">
              I can point you at the right page. I don&apos;t know anything
              about your child specifically.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-[12.5px] text-muted-foreground">
                  What are you looking for?
                </p>
                {SPOT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="block w-full rounded-md border px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {turns.map((turn, index) => (
              <div key={index} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-muted px-3 py-1.5 text-[12.5px]">
                  {turn.question}
                </p>

                {turn.answers.length === 0 ? (
                  /* The honest answer. Spot does not guess, and the handoff is
                     to the message form, which routes to a real person. */
                  <div className="rounded-lg border p-3">
                    <p className="text-[12.5px]">
                      I don&apos;t know that one — I&apos;d rather say so than
                      guess. The office will know.
                    </p>
                    <Link
                      href="/messages/new"
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Message the office <ArrowRight aria-hidden size={13} />
                    </Link>
                  </div>
                ) : (
                  turn.answers.map((answer) => (
                    <div key={answer.id} className="rounded-lg border p-3">
                      <p className="text-[12.5px] font-semibold">{answer.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                        {answer.body}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {answer.links.map((link) =>
                          link.external ? (
                            <a
                              key={link.href}
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {link.label}
                              <ExternalLink aria-hidden size={11} />
                              <span className="sr-only">(opens in a new tab)</span>
                            </a>
                          ) : (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setOpen(false)}
                              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {link.label}
                              <ArrowRight aria-hidden size={12} />
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(query);
            }}
            className="flex items-center gap-2 border-t p-2"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about anything in the portal…"
              aria-label="Ask Spot a question"
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-[13px]"
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={!query.trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send aria-hidden size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

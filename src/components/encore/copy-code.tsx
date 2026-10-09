"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A reward code in large type, with a Copy button that never fails silently. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="select-all rounded-md border bg-card px-2 py-0.5 font-mono text-[15px] font-semibold tracking-wider text-foreground">
        {code}
      </code>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Copy ${code}`}
        onClick={() => {
          navigator.clipboard
            ?.writeText(code)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? <Check aria-hidden size={15} /> : <Copy aria-hidden size={15} />}
      </button>
    </span>
  );
}

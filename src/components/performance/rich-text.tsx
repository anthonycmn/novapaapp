/**
 * The event description and terms, written the way contract templates are:
 * a block starting "## " is a heading, lines starting "- " are a list,
 * anything else a paragraph. Blocks are split on blank lines. Plain text in,
 * React out; nothing CJ types is ever injected as HTML.
 */
export function RichText({ body, className }: { body?: string; className?: string }) {
  if (!body?.trim()) return null;
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className={className ?? "flex flex-col gap-2 text-sm leading-relaxed"}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines[0].startsWith("## ")) {
          const rest = lines.slice(1);
          return (
            <div key={i} className="flex flex-col gap-1">
              <h3 className="mt-1 text-[15px] font-semibold">{lines[0].slice(3)}</h3>
              {rest.length > 0 && <RichText body={rest.join("\n")} />}
            </div>
          );
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

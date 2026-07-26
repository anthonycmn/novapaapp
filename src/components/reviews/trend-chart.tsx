import type { TrendPoint } from "@/lib/api/reviews/types";

/**
 * Review trend over time (#15). Inline SVG — no chart dependency, works in
 * both themes via currentColor, and carries a text alternative so the data
 * is available to screen readers rather than being a decorative picture.
 */
export function TrendChart({
  points,
  label,
}: {
  points: TrendPoint[];
  label: string;
}) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough reviews yet to show a trend.
      </p>
    );
  }

  const width = 320;
  const height = 120;
  const padding = { top: 8, right: 8, bottom: 22, left: 24 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scores are 1–5, so pin the axis rather than auto-scaling: a jump from
  // 4.1 to 4.3 shouldn't look like a cliff.
  const yMin = 1;
  const yMax = 5;
  const x = (index: number) =>
    padding.left +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) =>
    padding.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.overall)}`)
    .join(" ");

  const summary = points
    .map((point) => `${point.period}: ${point.overall.toFixed(1)} of 5 from ${point.count} review${point.count === 1 ? "" : "s"}`)
    .join("; ");

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-sm text-primary"
        role="img"
        aria-label={`${label}. ${summary}`}
      >
        {[1, 2, 3, 4, 5].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 1 ? 0.35 : 0.12}
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-current text-[8px] opacity-60"
            >
              {tick}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />

        {points.map((point, index) => (
          <circle key={point.period} cx={x(index)} cy={y(point.overall)} r={3} fill="currentColor" />
        ))}

        {points.map((point, index) => (
          <text
            key={`${point.period}-label`}
            x={x(index)}
            y={height - 6}
            textAnchor="middle"
            className="fill-current text-[8px] opacity-60"
          >
            {point.period.slice(5)}
          </text>
        ))}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

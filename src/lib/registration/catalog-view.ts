/**
 * The /register catalog, shaped for browsing (CJ, 30 Sep 2026: "everything,
 * with filters"). Pure: rows from public.catalog_list in, cards out.
 */

/** A row as public.catalog_list returns it. */
export interface CatalogRow {
  id: number;
  category: string;
  name: string;
  schedule_name: string | null;
  age_range: string | null;
  pricing: string[] | null;
  price_cents: number | null;
  image_url: string | null;
  bookable: boolean;
  remaining: number | null;
  class_times: unknown;
  description: string | null;
  offering_kind: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

export type Kind = "class" | "show" | "camp" | "day_camp" | "coaching" | "other";

export const KIND_LABEL: Record<Kind, string> = {
  class: "Classes",
  show: "Shows",
  camp: "Camps",
  day_camp: "Day camps",
  coaching: "Coaching",
  other: "Workshops & more",
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface CatalogCard {
  id: number;
  kind: Kind;
  isClass: boolean;
  name: string;
  label: string | null;
  when: string | null;
  description: string | null;
  imageUrl: string | null;
  priceLabel: string;
  minAge: number | null;
  maxAge: number | null;
  ageLabel: string | null;
  days: string[];
  status: "open" | "full" | "closed";
  spotsLeft: number | null;
}

/**
 * The twelve Broadway Bound summer listings sell by show and age band from a
 * seat grid (`{show, band}` items), not by activity id. Until the front door
 * learns that grid they stay on novapa.org's checkout, and the page links there.
 */
export function isSummerSeatGrid(row: Pick<CatalogRow, "name" | "category">): boolean {
  const n = row.name.toLowerCase();
  return row.category !== "class" && n.includes("broadway bound") && /dragon|charlie|chocolate|trolls/.test(n);
}

export function kindOf(row: Pick<CatalogRow, "category" | "offering_kind">): Kind {
  const k = row.offering_kind ?? "";
  if (row.category === "class" || k === "class") return "class";
  if (k === "show" || k === "camp" || k === "day_camp" || k === "coaching") return k;
  if (row.category === "coaching") return "coaching";
  if (row.category === "camp") return "show";
  return "other";
}

/** "9 – 12 yrs", "7+ yrs", "up to 6 yrs" → numbers. */
export function parseAges(label: string | null): { min: number | null; max: number | null } {
  if (!label) return { min: null, max: null };
  const nums = label.match(/\d+/g)?.map(Number) ?? [];
  if (/up to/i.test(label)) return { min: null, max: nums[0] ?? null };
  if (/\+/.test(label) && nums.length === 1) return { min: nums[0], max: null };
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null };
}

function daysOf(times: unknown): string[] {
  if (!Array.isArray(times)) return [];
  const out = new Set<string>();
  for (const t of times) {
    const k = String((t as { title_text?: unknown })?.title_text ?? "").trim().slice(0, 3);
    const hit = DAY_NAMES.find((d) => d.toLowerCase() === k.toLowerCase());
    if (hit) out.add(hit);
  }
  return DAY_NAMES.filter((d) => out.has(d));
}

function price(row: CatalogRow, isClass: boolean): string {
  if (row.pricing?.[0]) return row.pricing[0];
  if (row.price_cents == null) return "";
  const d = row.price_cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}${isClass ? "/mo" : ""}`;
}

export function toCard(row: CatalogRow): CatalogCard {
  const kind = kindOf(row);
  const isClass = kind === "class";
  const ages = parseAges(row.age_range);
  const [label, when] = (row.schedule_name ?? "").split("|").map((s) => s.trim());
  const full = row.remaining != null && row.remaining <= 0;
  return {
    id: row.id,
    kind,
    isClass,
    name: row.name,
    label: when ? label || null : null,
    when: when || label || null,
    description: row.description,
    imageUrl: row.image_url,
    priceLabel: price(row, isClass),
    minAge: ages.min,
    maxAge: ages.max,
    ageLabel: row.age_range,
    days: daysOf(row.class_times),
    status: !row.bookable ? "closed" : full ? "full" : "open",
    spotsLeft: row.remaining,
  };
}

export interface Filters {
  kinds: Kind[];
  age: number | null;
  days: string[];
  q: string;
}

export function matches(c: CatalogCard, f: Filters): boolean {
  if (f.kinds.length && !f.kinds.includes(c.kind)) return false;
  if (f.age != null) {
    if (c.minAge != null && f.age < c.minAge) return false;
    if (c.maxAge != null && f.age > c.maxAge) return false;
  }
  if (f.days.length && !c.days.some((d) => f.days.includes(d))) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !`${c.name} ${c.label ?? ""} ${c.description ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}

/** Cards for the page: summer seat-grid listings out, open first, then by kind and name. */
export function buildCatalog(rows: CatalogRow[]): CatalogCard[] {
  const order: Kind[] = ["class", "show", "camp", "day_camp", "other", "coaching"];
  const rank = { open: 0, full: 1, closed: 2 } as const;
  return rows
    .filter((r) => !isSummerSeatGrid(r))
    .map(toCard)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        a.name.localeCompare(b.name)
    );
}

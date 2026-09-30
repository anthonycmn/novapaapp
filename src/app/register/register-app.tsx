"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_NAMES,
  KIND_LABEL,
  matches,
  type CatalogCard,
  type Filters,
  type Kind,
} from "@/lib/registration/catalog-view";
import {
  checkoutPart,
  holdCart,
  joinWaitlist,
  type Family,
  type Holds,
  type PartAnswer,
  type PartPricing,
} from "@/lib/registration/front-door-actions";
import { TERMS_LINKS } from "@/lib/registration/terms";

/**
 * The front door, in the browser (CJ, 30 Sep 2026).
 *
 * browse → checkout (who is it for · your details · review · pay) → done.
 * No sign-in anywhere: the family types their email at checkout, and after
 * payment the registration system emails a receipt and a link into the
 * portal. Every number shown on the review step came from the server
 * (reg-pay quote_only); nothing here decides what anything costs.
 *
 * The cart, the students and the family details are kept in this browser
 * (localStorage) so a refresh or a trip to read the policies loses nothing.
 */

/* ── Stripe.js, loaded from js.stripe.com on the checkout step only ─────── */

interface StripeElement { mount(el: HTMLElement | string): void; destroy(): void; }
interface StripeElements {
  create(type: "payment", opts?: Record<string, unknown>): StripeElement;
  submit(): Promise<{ error?: { message?: string } }>;
  update(opts: Record<string, unknown>): void;
}
interface StripeResult {
  error?: { message?: string };
  paymentIntent?: { id: string; status: string };
  setupIntent?: { id: string; status: string };
}
interface StripeJs {
  elements(opts: Record<string, unknown>): StripeElements;
  confirmPayment(opts: Record<string, unknown>): Promise<StripeResult>;
  confirmSetup(opts: Record<string, unknown>): Promise<StripeResult>;
}
declare global {
  interface Window { Stripe?: (key: string) => StripeJs }
}
function loadStripe(key: string): Promise<StripeJs | null> {
  if (!key) return Promise.resolve(null);
  if (window.Stripe) return Promise.resolve(window.Stripe(key));
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.async = true;
    s.onload = () => resolve(window.Stripe ? window.Stripe(key) : null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

/* ── local state ────────────────────────────────────────────────────────── */

interface Line { key: string; card: CatalogCard; student: number | null; }
interface Student { name: string; bday: string; }

const STORE = "npa-reg-v1";
function readStore(): { cart: { id: number; student: number | null }[]; students: Student[]; family: Omit<Family, "bdays"> } | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeStore(v: unknown) {
  try { window.localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private window: fine */ }
}
function clearStore() {
  try { window.localStorage.removeItem(STORE); } catch { /* fine */ }
}
const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;
const dateOf = (utc?: number) =>
  utc ? new Date(utc * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

type Step = "browse" | "checkout" | "done";

export default function RegisterApp(props: {
  catalog: CatalogCard[];
  preselect: number[];
  loadError: string | null;
  refCode?: string;
  returnedFromBank: boolean;
  stripeKey: string;
  summerUrl: string;
  freeClassUrl: string;
}) {
  const byId = useMemo(() => new Map(props.catalog.map((c) => [c.id, c])), [props.catalog]);
  const [step, setStep] = useState<Step>(props.returnedFromBank ? "done" : "browse");
  const [lines, setLines] = useState<Line[]>([]);
  const [students, setStudents] = useState<Student[]>([{ name: "", bday: "" }]);
  const [family, setFamily] = useState<Omit<Family, "bdays">>({ email: "", parentName: "", phone: "", smsConsent: false });
  const [loaded, setLoaded] = useState(false);

  // Restore, then add ?activity= listings not already in the cart.
  useEffect(() => {
    const saved = readStore();
    let restored: Line[] = [];
    if (saved) {
      restored = saved.cart
        .map((l) => ({ key: newId(), card: byId.get(l.id)!, student: l.student }))
        .filter((l) => l.card && l.card.status === "open");
      if (saved.students?.length) setStudents(saved.students);
      if (saved.family) setFamily(saved.family);
    }
    for (const id of props.preselect) {
      const c = byId.get(id);
      if (c && c.status === "open" && !restored.some((l) => l.card.id === id)) {
        restored.push({ key: newId(), card: c, student: null });
      }
    }
    setLines(restored);
    if (props.returnedFromBank) clearStore();
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded || step === "done") return;
    writeStore({ cart: lines.map((l) => ({ id: l.card.id, student: l.student })), students, family });
  }, [loaded, lines, students, family, step]);

  const add = (c: CatalogCard) => setLines((ls) => [...ls, { key: newId(), card: c, student: null }]);
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  if (step === "done") {
    return <Done email={family.email} />;
  }
  if (step === "checkout") {
    return (
      <Checkout
        lines={lines}
        setLines={setLines}
        students={students}
        setStudents={setStudents}
        family={family}
        setFamily={setFamily}
        stripeKey={props.stripeKey}
        refCode={props.refCode}
        onBack={() => setStep("browse")}
        onRemove={remove}
        onDone={() => {
          clearStore();
          setStep("done");
        }}
      />
    );
  }
  return (
    <Browse
      catalog={props.catalog}
      lines={lines}
      onAdd={add}
      onRemove={remove}
      loadError={props.loadError}
      summerUrl={props.summerUrl}
      freeClassUrl={props.freeClassUrl}
      onCheckout={() => {
        setStep("checkout");
        window.scrollTo(0, 0);
      }}
    />
  );
}

/* ── browse ─────────────────────────────────────────────────────────────── */

function Browse(props: {
  catalog: CatalogCard[];
  lines: Line[];
  onAdd: (c: CatalogCard) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
  loadError: string | null;
  summerUrl: string;
  freeClassUrl: string;
}) {
  const [f, setF] = useState<Filters>({ kinds: [], age: null, days: [], q: "" });
  const [waitFor, setWaitFor] = useState<CatalogCard | null>(null);
  const kinds = useMemo(() => [...new Set(props.catalog.map((c) => c.kind))] as Kind[], [props.catalog]);
  const shown = props.catalog.filter((c) => matches(c, f));
  const inCart = (id: number) => props.lines.filter((l) => l.card.id === id);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="wrap">
      <div className="eyebrow">Northern Virginia Performing Arts</div>
      <h1>
        Find your <em style={{ color: "var(--gold2)" }}>spotlight</em>
      </h1>
      <p className="sub">
        Classes, shows, camps and more. Add what you like to your cart — you&apos;ll pick which student each is for at
        checkout. No account needed; we&apos;ll set up your Parent Portal when you register.
      </p>

      <div className="filters" role="group" aria-label="Filters">
        {kinds.map((k) => (
          <button key={k} type="button" className={`chip ${f.kinds.includes(k) ? "on" : ""}`} onClick={() => setF({ ...f, kinds: toggle(f.kinds, k) })}>
            {KIND_LABEL[k]}
          </button>
        ))}
        <input
          className="age"
          type="number"
          min={2}
          max={99}
          placeholder="Age"
          aria-label="Student age"
          value={f.age ?? ""}
          onChange={(e) => setF({ ...f, age: e.target.value === "" ? null : Number(e.target.value) })}
        />
        {DAY_NAMES.map((d) => (
          <button key={d} type="button" className={`chip ${f.days.includes(d) ? "on" : ""}`} onClick={() => setF({ ...f, days: toggle(f.days, d) })}>
            {d}
          </button>
        ))}
        <input className="search" type="text" placeholder="Search" aria-label="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>

      {props.loadError && <p className="err">{props.loadError}</p>}
      {!props.loadError && !shown.length && <p className="sub">Nothing matches those filters. Try fewer.</p>}

      <div className="grid">
        {shown.map((c) => {
          const n = inCart(c.id).length;
          return (
            <article key={c.id} className={`item ${n ? "sel" : ""}`}>
              <div className="art" style={c.imageUrl ? { backgroundImage: `url("${c.imageUrl.replace(/"/g, "")}")` } : undefined} />
              <div className="body">
                <span className={`tag ${c.status !== "open" ? "warn" : ""}`}>
                  {KIND_LABEL[c.kind]}
                  {c.status === "full" ? " · Full" : c.status === "closed" ? " · Not open yet" : c.spotsLeft != null && c.spotsLeft <= 5 ? ` · ${c.spotsLeft} left` : ""}
                </span>
                <div className="t">{c.name}</div>
                <div className="d">{[c.label, c.when, c.ageLabel].filter(Boolean).join(" · ")}</div>
                {c.description && <p className="desc">{c.description}</p>}
                <div className="foot">
                  <span className="price">{c.priceLabel}</span>
                  {c.status === "open" ? (
                    <button type="button" className="btn btn-sm" onClick={() => props.onAdd(c)}>
                      {n ? `Add another (${n})` : "Add"}
                    </button>
                  ) : c.status === "full" ? (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setWaitFor(c)}>
                      Join waitlist
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="tiny" style={{ marginTop: 22 }}>
        Looking for Broadway Bound summer camps? <a href={props.summerUrl}>Register for summer here</a>. Want to try a class first?{" "}
        <a href={props.freeClassUrl}>Book a free class</a>.
      </p>

      {waitFor && <Waitlist card={waitFor} onClose={() => setWaitFor(null)} />}

      {props.lines.length > 0 && (
        <div className="cartbar">
          <div className="in">
            <span>
              <b>{props.lines.length}</b> in your cart
            </span>
            <button type="button" className="btn" onClick={props.onCheckout}>
              Check out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Waitlist({ card, onClose }: { card: CatalogCard; onClose: () => void }) {
  const [camper, setCamper] = useState("");
  const [parent, setParent] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Waitlist for ${card.name}`}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}
      onClick={onClose}
    >
      <div className="card narrow" style={{ width: "100%", background: "var(--navy1)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Join the waitlist</h2>
        <p className="tiny" style={{ marginBottom: 12 }}>
          {card.name} is full. We&apos;ll email you if a spot opens.
        </p>
        <label className="field"><span>Student&apos;s name</span><input type="text" value={camper} onChange={(e) => setCamper(e.target.value)} /></label>
        <label className="field"><span>Your name</span><input type="text" value={parent} onChange={(e) => setParent(e.target.value)} /></label>
        <label className="field"><span>Your email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {msg && <p className={msg.ok ? "okmsg" : "err"}>{msg.text}</p>}
        <div className="two" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await joinWaitlist({ activityId: card.id, camperName: camper, parentName: parent, email });
              setMsg({ ok: r.ok, text: r.message });
              setBusy(false);
            }}
          >
            {busy ? "Adding…" : "Join waitlist"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── checkout ───────────────────────────────────────────────────────────── */

interface Quotes { cls: PartAnswer | null; other: PartAnswer | null; }

function Checkout(props: {
  lines: Line[];
  setLines: (f: (ls: Line[]) => Line[]) => void;
  students: Student[];
  setStudents: (s: Student[]) => void;
  family: Omit<Family, "bdays">;
  setFamily: (f: Omit<Family, "bdays">) => void;
  stripeKey: string;
  refCode?: string;
  onBack: () => void;
  onRemove: (key: string) => void;
  onDone: () => void;
}) {
  const { lines, students, family } = props;
  const hasClass = lines.some((l) => l.card.isClass);
  const hasOther = lines.some((l) => !l.card.isClass);
  const insurable = lines.some((l) => l.card.kind === "show" || l.card.kind === "camp");
  // Day camps and coaching are always paid in full; only a show, camp or
  // workshop can go on a plan, so the choice is offered only when one is here.
  const planable = lines.some((l) => !l.card.isClass && l.card.kind !== "day_camp" && l.card.kind !== "coaching");
  const [plan, setPlan] = useState<"full" | "deposit">("deposit");
  const [insurance, setInsurance] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [terms, setTerms] = useState(false);
  const [cartId] = useState(newId);
  const [holds, setHolds] = useState<Holds | null>(null);
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classNeedsCard, setClassNeedsCard] = useState<string | null>(null);
  const stripeRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Anything that changes the price throws the old quote away.
  useEffect(() => {
    setQuotes(null);
    setHolds(null);
  }, [lines.length, plan, insurance, coupon, family.email]);

  const named = students.map((s, i) => ({ ...s, i })).filter((s) => s.name.trim());
  const allAssigned = lines.every((l) => l.student != null && students[l.student]?.name.trim());
  const detailsOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(family.email.trim()) && family.parentName.trim().length > 1
    && family.phone.replace(/\D/g, "").length >= 10;
  const bdayOk = named.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.bday));
  const ready = lines.length > 0 && allAssigned && detailsOk && bdayOk;

  const fam = (): Family => ({
    ...family,
    bdays: Object.fromEntries(named.map((s) => [s.name.trim(), s.bday])),
  });
  const cartLines = () =>
    lines.map((l) => ({ activityId: l.card.id, isClass: l.card.isClass, camper: students[l.student!].name.trim(), ci: l.student! }));
  const otherPlan = (): "full" | "deposit" => (planable ? plan : "full");
  // A coupon rides the show/camp half of a mixed cart, so it is spent once.
  const couponFor = (part: "cls" | "other") => (part === "other" || !hasOther ? coupon : "");

  async function review() {
    setError(null);
    setBusy("Holding your spots…");
    setQuotes(null);
    const h = await holdCart(family.email, cartLines());
    if (!h.ok || !h.holds) {
      setBusy(null);
      setError(h.message ?? "Couldn't hold your spots.");
      return;
    }
    setHolds(h.holds);
    setBusy("Working out your total…");
    const base = { family: fam(), insurance, cartId, quote: true, ref: props.refCode };
    const [other, cls] = await Promise.all([
      h.holds.otherHold ? checkoutPart({ ...base, holdId: h.holds.otherHold, plan: otherPlan(), coupon: couponFor("other") }) : Promise.resolve(null),
      h.holds.classHold ? checkoutPart({ ...base, holdId: h.holds.classHold, plan: "subscription", coupon: couponFor("cls"), insurance: false }) : Promise.resolve(null),
    ]);
    setBusy(null);
    const bad = [other, cls].find((q) => q && !q.ok);
    if (bad) {
      if (bad.error === "pay_full_only" && plan === "deposit") setPlan("full");
      setError(bad.message ?? "Couldn't price your cart.");
      return;
    }
    setQuotes({ other, cls });
  }

  const first: "other" | "cls" = hasOther ? "other" : "cls";
  const firstQuote = quotes ? (first === "other" ? quotes.other : quotes.cls) : null;
  const everythingFree = quotes != null && (!quotes.other || quotes.other.free) && (!quotes.cls || (quotes.cls.pricing?.today_cents ?? 0) === 0 && !quotes.cls.pricing?.monthly_cents);

  // Mount the card form once the total is known and the terms are agreed.
  useEffect(() => {
    let cancelled = false;
    async function mount() {
      if (!quotes || !terms || everythingFree || !mountRef.current) return;
      const p = firstQuote?.pricing;
      if (!p) return;
      const stripe = stripeRef.current ?? (await loadStripe(props.stripeKey));
      if (cancelled) return;
      if (!stripe) {
        setError("The card form didn't load. Check your connection and refresh.");
        return;
      }
      stripeRef.current = stripe;
      const setupOnly = first === "cls" && p.today_cents === 0;
      const needsSave = hasClass || (first === "other" && otherPlan() === "deposit") || first === "cls";
      const elements = stripe.elements({
        mode: setupOnly ? "setup" : "payment",
        ...(setupOnly ? {} : { amount: p.today_cents }),
        currency: "usd",
        ...(needsSave ? { setupFutureUsage: "off_session" } : {}),
        paymentMethodTypes: ["card", "link"],
        appearance: { theme: "stripe", variables: { colorPrimary: "#c8892a", borderRadius: "10px" } },
      });
      const el = elements.create("payment", { layout: "tabs" });
      mountRef.current.innerHTML = "";
      el.mount(mountRef.current);
      elementsRef.current = elements;
    }
    mount();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, terms]);

  async function pay() {
    if (!holds || !quotes) return;
    setError(null);
    const base = { family: fam(), insurance, cartId, ref: props.refCode };

    // Nothing to charge anywhere: the $0 path, no card.
    if (everythingFree && holds.otherHold && !holds.classHold) {
      setBusy("Registering…");
      const r = await checkoutPart({ ...base, holdId: holds.otherHold, plan: "full", coupon: couponFor("other"), confirmFree: true });
      setBusy(null);
      if (!r.ok || !r.confirmed) return setError(r.message ?? "Couldn't finish.");
      return props.onDone();
    }

    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return setError("The card form isn't ready yet.");
    setBusy("Checking your card…");
    const sub = await elements.submit();
    if (sub.error) {
      setBusy(null);
      return setError(sub.error.message ?? "Please check your card details.");
    }

    // Part one: the card is typed for this one, and saved if part two follows.
    setBusy("Paying…");
    const firstHold = first === "other" ? holds.otherHold! : holds.classHold!;
    const r1 = await checkoutPart({
      ...base,
      holdId: firstHold,
      plan: first === "other" ? otherPlan() : "subscription",
      coupon: couponFor(first),
      insurance: first === "other" ? insurance : false,
      saveCard: hasClass && hasOther,
    });
    if (!r1.ok || !r1.clientSecret) {
      setBusy(null);
      return setError(r1.message ?? "Couldn't start the payment.");
    }
    const returnUrl = `${window.location.origin}/register?paid=1`;
    const res = r1.setup
      ? await stripe.confirmSetup({ elements, clientSecret: r1.clientSecret, confirmParams: { return_url: returnUrl }, redirect: "if_required" })
      : await stripe.confirmPayment({ elements, clientSecret: r1.clientSecret, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
    if (res.error) {
      setBusy(null);
      // A new intent will be made on the next press; the old one is left unpaid.
      return setError(res.error.message ?? "The payment didn't go through.");
    }
    if (!(hasClass && hasOther)) {
      setBusy(null);
      return props.onDone();
    }

    // Part two: classes, on the card part one saved.
    setBusy("Setting up the monthly class billing…");
    const piId = res.paymentIntent?.id;
    const r2 = piId
      ? await checkoutPart({ ...base, holdId: holds.classHold!, plan: "subscription", coupon: "", insurance: false, payWithIntent: piId })
      : ({ ok: false, error: "saved_card_unavailable" } as PartAnswer);
    setBusy(null);
    if (r2.ok && r2.enrolled) return props.onDone();
    setClassNeedsCard(r2.message ?? "We need one more step for the classes.");
  }

  // Rare: the bank wanted to approve the class charge in person.
  async function finishClasses() {
    if (!holds?.classHold || !stripeRef.current || !elementsRef.current) return;
    setError(null);
    setBusy("Finishing the class payment…");
    const r = await checkoutPart({ family: fam(), insurance: false, cartId, holdId: holds.classHold, plan: "subscription", coupon: "" });
    if (!r.ok || !r.clientSecret) {
      setBusy(null);
      return setError(r.message ?? "Couldn't start the class payment.");
    }
    const elements = elementsRef.current;
    if (!r.setup) elements.update({ amount: r.pricing?.today_cents ?? 0 });
    const sub = await elements.submit();
    if (sub.error) {
      setBusy(null);
      return setError(sub.error.message ?? "Please check your card details.");
    }
    const returnUrl = `${window.location.origin}/register?paid=1`;
    const res = r.setup
      ? await stripeRef.current.confirmSetup({ elements, clientSecret: r.clientSecret, confirmParams: { return_url: returnUrl }, redirect: "if_required" })
      : await stripeRef.current.confirmPayment({ elements, clientSecret: r.clientSecret, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
    setBusy(null);
    if (res.error) return setError(res.error.message ?? "The class payment didn't go through.");
    props.onDone();
  }

  const setStudent = (i: number, patch: Partial<Student>) =>
    props.setStudents(students.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="wrap narrow">
      <button type="button" className="btn btn-ghost btn-sm" onClick={props.onBack} style={{ marginBottom: 16 }}>
        ← Keep browsing
      </button>
      <div className="eyebrow">Checkout</div>
      <h1>Almost there</h1>

      <section className="card">
        <h2>1. Students</h2>
        {students.map((s, i) => (
          <div key={i} className="two" style={{ marginBottom: 10 }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Student {i + 1} — first and last name</span>
              <input type="text" value={s.name} onChange={(e) => setStudent(i, { name: e.target.value })} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Birthday</span>
              <input type="date" value={s.bday} onChange={(e) => setStudent(i, { bday: e.target.value })} />
            </label>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => props.setStudents([...students, { name: "", bday: "" }])}>
          + Add another student
        </button>
      </section>

      <section className="card">
        <h2>2. Who is each for?</h2>
        {!lines.length && <p className="tiny">Your cart is empty.</p>}
        {lines.map((l) => (
          <div key={l.key} className="row">
            <div className="grow">
              <div style={{ fontWeight: 700, color: "#fff" }}>{l.card.name}</div>
              <div className="tiny">{[l.card.when, l.card.priceLabel].filter(Boolean).join(" · ")}</div>
            </div>
            <select
              aria-label={`Student for ${l.card.name}`}
              value={l.student ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                props.setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, student: v } : x)));
              }}
              style={{ width: "auto", minWidth: 180 }}
            >
              <option value="">Choose a student</option>
              {named.map((s) => (
                <option key={s.i} value={s.i}>{s.name}</option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => props.onRemove(l.key)}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>3. Your details</h2>
        <label className="field"><span>Your name</span><input type="text" autoComplete="name" value={family.parentName} onChange={(e) => props.setFamily({ ...family, parentName: e.target.value })} /></label>
        <label className="field"><span>Email — your receipt and Parent Portal link go here</span><input type="email" autoComplete="email" value={family.email} onChange={(e) => props.setFamily({ ...family, email: e.target.value })} /></label>
        <label className="field"><span>Mobile phone</span><input type="tel" autoComplete="tel" value={family.phone} onChange={(e) => props.setFamily({ ...family, phone: e.target.value })} /></label>
        <label className="check">
          <input type="checkbox" checked={family.smsConsent} onChange={(e) => props.setFamily({ ...family, smsConsent: e.target.checked })} />
          <span>
            By checking this box, you agree to receive recurring text messages from NOVAPA (Northern Virginia Performing
            Arts) about registrations, schedules, and programs at the number provided. Message frequency varies. Message
            and data rates may apply. Reply HELP for help or STOP to cancel at any time. Consent is not a condition of
            purchase. Your mobile information will not be sold or shared with third parties for promotional or marketing
            purposes. See our <a href={TERMS_LINKS.privacySms} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </span>
        </label>
      </section>

      <section className="card">
        <h2>4. Review</h2>
        {planable && (
          <>
            <div className={`opt ${plan === "deposit" ? "on" : ""}`} onClick={() => setPlan("deposit")}>
              <input type="radio" checked={plan === "deposit"} readOnly />
              <div><b>Payment plan</b><div className="tiny">Pay part today and the rest in monthly payments (a small plan fee applies).</div></div>
            </div>
            <div className={`opt ${plan === "full" ? "on" : ""}`} onClick={() => setPlan("full")}>
              <input type="radio" checked={plan === "full"} readOnly />
              <div><b>Pay in full</b><div className="tiny">One payment today.</div></div>
            </div>
          </>
        )}
        {insurable && (
          <label className="check" style={{ margin: "10px 0" }}>
            <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} />
            <span>Add tuition insurance (10% of the show/camp price) — refunds on a sliding scale if you have to withdraw. <a href={`${TERMS_LINKS.policies}#tuition-insurance`} target="_blank" rel="noopener noreferrer">How it works</a></span>
          </label>
        )}
        <label className="field" style={{ marginTop: 10 }}>
          <span>Coupon or credit code (optional){hasClass && hasOther ? " — applies to the show/camp part" : ""}</span>
          <input type="text" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
        </label>

        {!quotes && (
          <button type="button" className="btn" disabled={!ready || !!busy} onClick={review}>
            {busy ?? "See my total"}
          </button>
        )}
        {!ready && !quotes && (
          <p className="tiny" style={{ marginTop: 8 }}>
            {!allAssigned ? "Choose a student for everything in your cart. " : ""}
            {!bdayOk ? "Add each student's birthday. " : ""}
            {!detailsOk ? "Add your name, email and a mobile number." : ""}
          </p>
        )}

        {quotes && <Totals quotes={quotes} hasClass={hasClass} hasOther={hasOther} />}
      </section>

      {quotes && (
        <section className="card">
          <h2>5. Pay</h2>
          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              I agree to NOVAPA&apos;s <a href={TERMS_LINKS.terms} target="_blank" rel="noopener noreferrer">terms and conditions</a>,{" "}
              <a href={TERMS_LINKS.policies} target="_blank" rel="noopener noreferrer">policies</a>, and{" "}
              <a href={TERMS_LINKS.photo} target="_blank" rel="noopener noreferrer">Photo and Media Release</a>: <b>all sales are final
              (no refunds)</b>. Casting is at the director&apos;s discretion: not receiving a hoped-for role is not grounds for a
              refund or for stopping a payment plan.
            </span>
          </label>
          {terms && !everythingFree && <div id="pay-element" ref={mountRef}><div className="spinner" /></div>}
          {classNeedsCard ? (
            <>
              <p className="err">{classNeedsCard}</p>
              <button type="button" className="btn" disabled={!!busy} onClick={finishClasses}>{busy ?? "Finish the class payment"}</button>
            </>
          ) : (
            <button type="button" className="btn" style={{ marginTop: 14 }} disabled={!terms || !!busy} onClick={pay}>
              {busy ?? (everythingFree ? "Register" : `Pay ${usd(todayTotal(quotes))}`)}
            </button>
          )}
          <p className="tiny" style={{ marginTop: 10, textAlign: "center" }}>
            Payments are processed securely by Stripe. Your spots are held for 30 minutes.
          </p>
        </section>
      )}

      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

function todayTotal(q: Quotes): number {
  return (q.other?.pricing?.today_cents ?? 0) + (q.cls?.pricing?.today_cents ?? 0);
}

function Totals({ quotes, hasClass, hasOther }: { quotes: Quotes; hasClass: boolean; hasOther: boolean }) {
  const o = quotes.other?.pricing;
  const c = quotes.cls?.pricing;
  const rows: [string, string][] = [];
  const part = (p: PartPricing, label: string) => {
    rows.push([`${label} subtotal`, usd(p.subtotal_cents)]);
    if (p.coupon_cents) rows.push([`Code ${p.coupon ?? ""}`, `−${usd(p.coupon_cents)}`]);
    if (p.insurance_cents) rows.push(["Tuition insurance", usd(p.insurance_cents)]);
    if (p.plan_fee_cents) rows.push(["Payment plan fee", usd(p.plan_fee_cents)]);
  };
  if (o) part(o, hasClass ? "Shows & camps" : "Order");
  if (c) {
    rows.push([
      `Classes — ${c.class_month ? `rest of ${c.class_month}` : "first month"}${c.first_class_free ? " (free class taken off)" : ""}`,
      usd(c.today_cents),
    ]);
  }
  return (
    <div style={{ marginTop: 14 }}>
      <table className="money">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td>{k}</td><td>{v}</td></tr>
          ))}
          <tr className="total"><td>Due today</td><td>{usd(todayTotal(quotes))}</td></tr>
        </tbody>
      </table>
      {o && o.n_installments > 0 && (
        <p className="tiny" style={{ marginTop: 8 }}>
          Then {o.n_installments} monthly payment{o.n_installments === 1 ? "" : "s"} of {usd(o.installment_cents)}, starting {dateOf(o.first_installment_utc)}. Total {usd(o.total_cents)}.
        </p>
      )}
      {c && c.monthly_cents > 0 && (
        <p className="tiny" style={{ marginTop: 6 }}>
          Classes then bill {usd(c.monthly_cents)} a month on the 1st, from {dateOf(c.next_bill_utc)}
          {c.cancel_at_utc ? ` until ${dateOf(c.cancel_at_utc)}` : ""}.
        </p>
      )}
      {hasClass && hasOther && (
        <p className="tiny" style={{ marginTop: 6 }}>You&apos;ll enter your card once; it covers both.</p>
      )}
    </div>
  );
}

/* ── done ───────────────────────────────────────────────────────────────── */

function Done({ email }: { email: string }) {
  return (
    <div className="wrap narrow" style={{ textAlign: "center", paddingTop: 60 }}>
      <div className="eyebrow">You&apos;re registered</div>
      <h1>Welcome to NoVAPA!</h1>
      <p className="sub">
        We&apos;ve emailed {email ? <b>{email}</b> : "you"} a receipt and a separate link that signs you straight into your
        Parent Portal — your schedule, payments and everything else live there.
      </p>
      <a className="btn" href="/login/code" style={{ maxWidth: 360 }}>
        Open my Parent Portal
      </a>
      <p className="tiny" style={{ marginTop: 14 }}>
        No email in a few minutes? Check spam, or write to <a href="mailto:info@novapa.org">info@novapa.org</a>.
      </p>
    </div>
  );
}

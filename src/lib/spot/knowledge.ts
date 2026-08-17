/**
 * What Spot knows.
 *
 * Spot is a lookup, not a language model. Every answer below is written by a
 * human and points at a page in this portal — which is why Spot costs nothing
 * to run, works with no network after the page loads, and cannot invent a
 * refund policy at two in the morning.
 *
 * That last property is the reason for the design, not a consequence of it. A
 * chatbot that answers a parent's question about their child's medication with
 * a plausible guess is worse than no chatbot. Spot either recognises the
 * question and hands over a real page, or says it does not know and points at
 * the message form, which reaches a named person.
 *
 * To teach Spot something new, add an entry. `keywords` are the words a parent
 * would actually type — including the wrong ones. "Absent" and "sick" belong on
 * the same entry as "illness", because families do not use our vocabulary.
 */

export interface SpotAnswer {
  id: string;
  /** How Spot introduces the answer. */
  title: string;
  /** The answer itself. Two sentences at most — this is a signpost. */
  body: string;
  /** Where to actually go. */
  links: Array<{ label: string; href: string; external?: boolean }>;
  /**
   * Words a parent might type. Matched loosely: plurals and common endings are
   * stripped on both sides, so "tickets" finds "ticket".
   */
  keywords: string[];
  /**
   * Whole phrases that should win outright when they appear. Used where a
   * single word is ambiguous — "call" alone could be a phone call.
   */
  phrases?: string[];
}

export const SPOT_ANSWERS: SpotAnswer[] = [
  {
    id: "schedule",
    title: "Your week is on the dashboard",
    body: "The dashboard shows every rehearsal, class and lesson your children are registered for, week by week. The full calendar has a month view and lets you subscribe from your own phone calendar.",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Full calendar", href: "/schedule" },
    ],
    keywords: [
      "schedule", "calendar", "when", "time", "rehearsal", "week", "diary",
      "timetable", "dates", "date", "upcoming", "next", "today", "tomorrow",
    ],
    // Interrogative frames like "what time" are deliberately NOT here: they
    // open questions about anything, and as a phrase they outscored the actual
    // subject of the sentence. Only distinctive terms earn phrase weight.
    phrases: ["next call", "call time", "this week", "when is my", "when does my"],
  },
  {
    id: "subscribe-calendar",
    title: "Add our calendar to your phone",
    body: "The full calendar page has a subscribe link. Add it once and every rehearsal appears in your own calendar app, updating on its own when something changes.",
    links: [{ label: "Full calendar", href: "/schedule" }],
    keywords: ["subscribe", "ical", "sync", "google", "apple", "outlook", "import", "phone"],
    phrases: ["add to my calendar", "google calendar", "apple calendar", "phone calendar"],
  },
  {
    id: "tickets",
    title: "Tickets are on BookTix",
    body: "Show tickets are sold through BookTix. There is a link on the dashboard and on every show page.",
    links: [
      { label: "Shows", href: "/shows" },
      { label: "Buy tickets", href: "https://novapa.booktix.com", external: true },
    ],
    keywords: ["ticket", "booktix", "seat", "buy", "performance", "audience", "grandparent"],
    phrases: ["buy tickets", "get tickets", "how many tickets"],
  },
  {
    id: "absence",
    title: "Tell us your child will be away",
    body: "Message the office and choose \"My child is unwell\" — it goes straight to our Director of Health & Safety. For a one-off late arrival or early collection, use the pickup and drop-off form instead.",
    links: [
      { label: "Message the office", href: "/messages/new" },
      { label: "Pickup & drop-off", href: "/family/pickup" },
    ],
    keywords: [
      "absent", "absence", "miss", "missing", "sick", "ill", "illness", "unwell",
      "away", "holiday", "vacation", "conflict", "cant", "unable", "skip",
    ],
    phrases: ["not coming", "will be away", "going to miss", "can't make", "cannot make"],
  },
  {
    id: "pickup",
    title: "Early pickup and late drop-off",
    body: "Fill in the pickup and drop-off form and it notifies the right staff. When you arrive, press \"I'm here\" and they will know you are at the kerb.",
    links: [{ label: "Pickup & drop-off", href: "/family/pickup" }],
    keywords: [
      "pickup", "pick", "dropoff", "drop", "collect", "collection", "late",
      "early", "kerb", "curb", "park", "parking", "arrive", "arrival",
    ],
    phrases: ["pick up", "drop off", "im here", "i'm here", "running late"],
  },
  {
    id: "payment",
    title: "Balances and payment plans",
    body: "Your outstanding balance is on the dashboard. For an invoice, a payment plan or financial aid, message the office and choose \"Billing or a payment plan\" — it reaches our CFO.",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Message about billing", href: "/messages/new" },
    ],
    keywords: [
      "pay", "payment", "balance", "invoice", "bill", "billing", "owe", "owing",
      "cost", "price", "fee", "instalment", "installment", "scholarship", "aid",
      "financial", "money", "charge",
    ],
    phrases: ["how much", "payment plan", "financial aid", "do i owe"],
  },
  {
    id: "refund",
    title: "Refund requests",
    body: "Message the office and choose \"Refund request\". It goes to our CFO, who decides refunds.",
    links: [{ label: "Request a refund", href: "/messages/new" }],
    keywords: ["refund", "cancel", "cancellation", "withdraw", "money back", "reimburse"],
    phrases: ["get my money back", "cancel my", "drop out"],
  },
  {
    id: "fsa",
    title: "Dependent Care FSA statement",
    body: "The document vault generates an FSA statement for each child under 13 with camp fees, with our EIN and address already filled in. Open it and print or save as PDF.",
    links: [{ label: "Document vault", href: "/family/documents" }],
    keywords: [
      "fsa", "dependent", "care", "tax", "taxes", "ein", "receipt", "statement",
      "reimbursement", "hsa", "deduction", "irs",
    ],
    phrases: ["dependent care", "tax statement", "for my taxes", "flexible spending"],
  },
  {
    id: "documents",
    title: "The document vault",
    body: "Signed agreements, health forms and your FSA statement all live in the document vault. You can upload your own documents there too.",
    links: [{ label: "Document vault", href: "/family/documents" }],
    keywords: [
      "document", "vault", "waiver", "agreement", "form", "paperwork", "upload",
      "signed", "contract", "release", "consent", "pdf",
    ],
    phrases: ["photo release", "where are my forms"],
  },
  {
    id: "health-form",
    title: "Health forms",
    body: "Health forms are on each child's profile. Fill it in and press submit and it syncs straight to the staff portal, so the people in the room have it.",
    links: [
      { label: "Family profile", href: "/family" },
      { label: "Document vault", href: "/family/documents" },
    ],
    keywords: [
      "health", "medical", "medication", "allergy", "allergies", "epipen",
      "asthma", "inhaler", "dietary", "diet", "condition", "doctor", "emergency",
    ],
    phrases: ["health form", "medical form", "my child's allergies"],
  },
  {
    id: "profile",
    title: "Update your family's details",
    body: "You can edit your children's names, birthdays, schools, shirt sizes and photos, and your own contact details — and add another parent or guardian — on the family profile.",
    links: [{ label: "Family profile", href: "/family" }],
    keywords: [
      "profile", "update", "edit", "change", "address", "phone", "email",
      "parent", "guardian", "birthday", "school", "grade", "shirt", "size",
      "nickname", "pronoun", "photo", "headshot", "spelling",
    ],
    phrases: ["change my email", "add a parent", "wrong name", "update my details"],
  },
  {
    id: "casting",
    title: "Casting and roles",
    body: "Your child's role appears on the casting page once casting is published, along with the playbill confirmation.",
    links: [
      { label: "Casting", href: "/casting" },
      { label: "Auditions", href: "/auditions" },
    ],
    keywords: [
      "cast", "casting", "role", "part", "audition", "callback", "playbill",
      "character", "understudy", "ensemble", "lead",
    ],
    phrases: ["what part", "which role", "did my child get"],
  },
  {
    id: "staff",
    title: "Who teaches your child",
    body: "Our staff shows the people assigned to your children's own shows and classes. Tap anyone to read their bio and their message to families.",
    links: [{ label: "Our staff", href: "/staff" }],
    keywords: [
      "staff", "teacher", "teach", "director", "who", "bio", "instructor",
      "artist", "team", "choreographer", "coach", "person",
    ],
    phrases: ["who is teaching", "who runs", "who is the director", "meet the"],
  },
  {
    id: "message",
    title: "Message the office",
    body: "Pick what your message is about and it goes straight to the person who handles it — registration to Jason, refunds to Todd, anything health-related to Katie. You will see who it reaches before you send.",
    links: [{ label: "Message the office", href: "/messages/new" }],
    keywords: [
      "message", "contact", "email", "ask", "question", "reach", "talk", "speak",
      "office", "complain", "complaint", "help", "someone", "phone", "call",
    ],
    phrases: ["get in touch", "who do i contact", "talk to someone", "speak to"],
  },
  {
    id: "photos",
    title: "Photos of your child",
    body: "Show galleries are on the photos page, and photos we have matched to your child are pinned at the top of News.",
    links: [
      { label: "Photos", href: "/photos" },
      { label: "News", href: "/feed" },
    ],
    keywords: ["photo", "picture", "gallery", "image", "video", "camera", "shoot", "headshot"],
    phrases: ["photos of my child", "show photos"],
  },
  {
    id: "register",
    title: "Signing up for something new",
    body: "What is open right now is on the dashboard, under \"Sign up for something\" — classes, camps and musicals, each linking straight to the booking page. Private lessons are booked in the portal.",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Private lessons", href: "/store/lessons" },
    ],
    keywords: [
      "register", "registration", "signup", "enrol", "enroll", "enrolment",
      "enrollment", "join", "book", "booking", "class", "camp", "lesson",
      "waitlist", "spot", "place", "available",
    ],
    phrases: ["sign up", "how do i register", "is there space", "next season"],
  },
  {
    id: "store",
    title: "Spirit buttons and star pages",
    body: "Spirit buttons and playbill star pages are in the store, and your past orders are there too.",
    links: [
      { label: "Spirit buttons", href: "/store/buttons" },
      { label: "Star pages", href: "/store/star-pages" },
      { label: "Your orders", href: "/store/orders" },
    ],
    keywords: [
      "button", "badge", "pin", "star", "shoutout", "tribute", "merchandise",
      "merch", "order", "shop", "store", "buy", "playbill", "advert", "ad",
    ],
    phrases: ["spirit button", "star page", "my order"],
  },
  {
    id: "notifications",
    title: "Notifications and what we send you",
    body: "Everything we have told you is on the notifications page, and you can choose what we notify you about — including quiet hours — in notification settings.",
    links: [
      { label: "Notifications", href: "/notifications" },
      { label: "Notification settings", href: "/notifications/settings" },
    ],
    keywords: [
      "notification", "alert", "notify", "push", "reminder", "quiet", "unsubscribe",
      "stop", "too many", "settings", "preference",
    ],
    phrases: ["stop emails", "turn off", "quiet hours"],
  },
  {
    id: "feed",
    title: "News and show updates",
    body: "Company-wide announcements are on News. Updates about one show or class are on that show or class's own page, where you can also ask a question only staff can see.",
    links: [
      { label: "News", href: "/feed" },
      { label: "Shows", href: "/shows" },
      { label: "Classes", href: "/classes" },
    ],
    keywords: ["news", "announcement", "update", "post", "feed", "notice", "bulletin"],
    phrases: ["any news", "what's happening"],
  },
  {
    id: "feedback",
    title: "Telling us how it went",
    body: "The feedback page is private — it goes to the office, not to the teaching artist, and it is how we find out what to change.",
    links: [{ label: "Give feedback", href: "/reviews" }],
    keywords: ["feedback", "review", "rate", "rating", "survey", "opinion", "suggestion"],
    phrases: ["leave feedback", "tell you what i think"],
  },
];

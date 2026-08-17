import { SPOT_ANSWERS, type SpotAnswer } from "./knowledge";

/**
 * How Spot decides what a parent meant.
 *
 * Deliberately small and deliberately dumb: token overlap against a hand-written
 * knowledge base, with exact phrases weighted above single words. There is no
 * model here and no request leaves the browser, which is what makes Spot free
 * to run — and, more usefully, what makes it incapable of inventing an answer.
 *
 * The single most important behaviour in this file is the floor. Below it,
 * Spot says it does not know and hands over to the message form. A confident
 * wrong answer about a child's medication is the failure this design exists to
 * prevent, so the bar for answering at all is set high enough that "no idea"
 * is a common and acceptable outcome.
 */

/** Words that carry no signal and would otherwise match everything. */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "did",
  "do", "does", "for", "from", "get", "had", "has", "have", "how", "i", "if",
  "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "please", "she",
  "so", "that", "the", "their", "them", "there", "they", "this", "to", "up",
  "was", "we", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your", "am", "been", "just", "need", "want", "know",
  "tell", "find", "im", "ive", "id", "hi", "hello", "hey", "thanks", "thank",
]);

/**
 * Crude stemming — enough to make "tickets" match "ticket" and "allergies"
 * match "allergy", and nothing more. A real stemmer would be a dependency and
 * a source of surprises for the sake of a handful of words.
 */
export function stem(word: string): string {
  let value = word;
  if (value.length > 4 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 4 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 3 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) {
    value = value.slice(0, -1);
  }
  return value;
}

/** Lower-case, strip punctuation, drop the noise, stem what is left. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}

/**
 * Words that are real signal but weak signal.
 *
 * "What time is pickup" is a question about pickup, not about time — yet
 * "time" is a legitimate keyword on the schedule answer, and left at full
 * weight it beat "pickup" and sent a parent to the calendar. These are the
 * generic nouns that describe the shape of a question rather than its subject,
 * so they count for half. A query made only of them scores below the floor and
 * Spot says it does not know, which is the right outcome for "what time".
 */
const WEAK_TOKENS = new Set([
  "time", "day", "date", "week", "class", "child", "children", "kid", "son",
  "daughter", "thing", "next", "place", "person", "page",
].map((word) => word));

/** The query with punctuation flattened, for phrase matching. */
function flatten(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
}

export interface SpotMatch {
  answer: SpotAnswer;
  score: number;
}

/**
 * The score a match must clear to be offered at all.
 *
 * Tuned so that a question using one of our words answers, and a question
 * using none of them does not. It is better for Spot to shrug at something it
 * could have half-answered than to answer something it misread.
 */
export const CONFIDENCE_FLOOR = 1;

export function scoreAnswer(query: string, answer: SpotAnswer): number {
  const flat = flatten(query);
  let score = 0;

  // A whole phrase is worth far more than the words in it: "call time" means
  // something the words "call" and "time" separately do not.
  for (const phrase of answer.phrases ?? []) {
    if (flat.includes(` ${flatten(phrase).trim()} `)) score += 3;
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return score;

  const keywordStems = new Set(answer.keywords.map((word) => stem(word.toLowerCase())));
  const seen = new Set<string>();
  for (const token of queryTokens) {
    // Count each distinct word once — "ticket ticket ticket" is one question.
    if (seen.has(token)) continue;
    seen.add(token);
    if (keywordStems.has(token)) score += WEAK_TOKENS.has(token) ? 0.5 : 1;
  }

  return score;
}

/**
 * The best answers for a question, most confident first.
 *
 * Returns an empty list rather than a weak guess. The caller shows the "I
 * don't know, here's a human" message on empty, which is a real answer.
 */
export function askSpot(query: string, limit = 3): SpotMatch[] {
  if (!query.trim()) return [];
  return SPOT_ANSWERS.map((answer) => ({ answer, score: scoreAnswer(query, answer) }))
    .filter((match) => match.score >= CONFIDENCE_FLOOR)
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Stable: the same question gives the same answer every time, which
        // matters when a parent asks a colleague "what did it say?"
        a.answer.id.localeCompare(b.answer.id)
    )
    .slice(0, limit);
}

/** A few things worth asking, shown before anyone types anything. */
export const SPOT_SUGGESTIONS = [
  "When is my child's next rehearsal?",
  "How do I buy tickets?",
  "My child will be away next week",
  "Where is my FSA statement?",
  "Who teaches my child?",
];

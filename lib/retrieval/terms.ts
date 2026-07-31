/** Words too common to say anything about what a question is asking. */
const STOPWORDS = new Set([
  "a", "about", "all", "am", "an", "and", "any", "are", "as", "at", "be",
  "been", "but", "by", "can", "did", "do", "does", "doing", "for", "from",
  "get", "had", "has", "have", "how", "i", "if", "in", "into", "is", "it",
  "its", "just", "me", "my", "need", "no", "not", "of", "on", "or", "our",
  "out", "over", "she", "should", "so", "some", "than", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "to", "too",
  "up", "us", "was", "we", "were", "what", "when", "where", "which", "who",
  "why", "will", "with", "would", "you", "your",
]);

/** Lowercased, de-punctuated content words. Crude stemming on trailing s. */
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * Fraction of the question's distinct terms that appear in the text.
 * 0–1, and deliberately simple — Phase 1 explicitly rules out embeddings.
 */
export function overlap(questionTerms: string[], text: string): number {
  const unique = new Set(questionTerms);
  if (unique.size === 0) return 0;

  const haystack = new Set(terms(text));
  let hits = 0;
  for (const term of unique) if (haystack.has(term)) hits++;

  return hits / unique.size;
}

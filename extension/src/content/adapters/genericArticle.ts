import type { Adapter } from "./types";

// Readability-style heuristic fallback. Only shows a button if we find a
// confident article-like block on the page.
export const genericArticleAdapter: Adapter = {
  name: "generic-article",
  matches: () => true, // fallback last
  findTargets(root) {
    const doc = (root as Document).body ? (root as Document) : document;
    // Prefer semantic tags
    const candidates = new Set<HTMLElement>();
    doc.querySelectorAll<HTMLElement>("article, main article, main [role='article']").forEach(
      (el) => candidates.add(el)
    );
    // If no article tag, pick the densest content block
    if (candidates.size === 0) {
      const dense = pickDensest(doc);
      if (dense) candidates.add(dense);
    }
    // Filter to those with enough text
    return Array.from(candidates).filter(
      (el) => (el.innerText || "").trim().length > 400
    );
  },
  extract(target) {
    const text = target.innerText?.trim() || "";
    if (text.length < 400) return null;
    const title =
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
      document.title ||
      "";
    return { text, title };
  },
  anchorEl(target) {
    return target;
  },
};

function pickDensest(doc: Document): HTMLElement | null {
  const nodes = Array.from(
    doc.querySelectorAll<HTMLElement>("main, section, div")
  );
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const el of nodes) {
    if (el.offsetHeight === 0) continue;
    const paragraphs = el.querySelectorAll("p").length;
    const textLen = (el.innerText || "").length;
    if (textLen < 500 || paragraphs < 3) continue;
    // Score: text length weighted by paragraph count, penalize link-heavy blocks
    const links = el.querySelectorAll("a").length;
    const linkTextLen = Array.from(el.querySelectorAll("a")).reduce(
      (s, a) => s + (a.textContent || "").length,
      0
    );
    const linkDensity = textLen > 0 ? linkTextLen / textLen : 0;
    if (linkDensity > 0.5) continue;
    const score = textLen * Math.log(paragraphs + 1) * (1 - linkDensity);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

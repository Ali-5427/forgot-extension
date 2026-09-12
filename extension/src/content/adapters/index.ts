import { xAdapter } from "./x";
import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { perplexityAdapter } from "./perplexity";
import { genericArticleAdapter } from "./genericArticle";
import type { Adapter } from "./types";

// Order matters: site-specific first, generic last.
const SITE_ADAPTERS: Adapter[] = [
  xAdapter,
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  perplexityAdapter,
];

export function pickAdapter(url: string): Adapter | null {
  for (const a of SITE_ADAPTERS) {
    try {
      if (a.matches(url)) return a;
    } catch {
      // ignore
    }
  }
  return genericArticleAdapter;
}

export { SITE_ADAPTERS, genericArticleAdapter };

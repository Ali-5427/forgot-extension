import type { Adapter } from "./types";

export const perplexityAdapter: Adapter = {
  name: "perplexity",
  matches: (url) => /(^|\.)perplexity\.ai$/.test(new URL(url).hostname),
  findTargets(root) {
    // Perplexity renders answer blocks with prose class; scope by common answer wrappers.
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        'div[id^="markdown-content"], div.prose'
      )
    );
    return nodes.filter((n) => (n.innerText || "").trim().length > 80);
  },
  extract(target) {
    const text = target.innerText?.trim() || "";
    if (!text) return null;
    return { text, title: "Perplexity answer" };
  },
  anchorEl(target) {
    return target;
  },
};

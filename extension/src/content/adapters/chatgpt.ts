import type { Adapter } from "./types";

export const chatgptAdapter: Adapter = {
  name: "chatgpt",
  matches: (url) => /(^|\.)chatgpt\.com$/.test(new URL(url).hostname) || /(^|\.)chat\.openai\.com$/.test(new URL(url).hostname),
  findTargets(root) {
    // Assistant messages only
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-message-author-role="assistant"]'
      )
    );
  },
  extract(target) {
    const contentEl =
      target.querySelector<HTMLElement>(".markdown") ||
      target.querySelector<HTMLElement>('[data-message-id]') ||
      target;
    const text = contentEl.innerText?.trim() || "";
    if (!text) return null;
    return { text, title: "ChatGPT response" };
  },
  anchorEl(target) {
    return target;
  },
};

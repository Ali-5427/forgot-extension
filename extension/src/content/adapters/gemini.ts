import type { Adapter } from "./types";

export const geminiAdapter: Adapter = {
  name: "gemini",
  matches: (url) => /(^|\.)gemini\.google\.com$/.test(new URL(url).hostname),
  findTargets(root) {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        "model-response, message-content.model-response-text, .model-response-text"
      )
    );
  },
  extract(target) {
    const text = target.innerText?.trim() || "";
    if (!text) return null;
    return { text, title: "Gemini response" };
  },
  anchorEl(target) {
    return target;
  },
};

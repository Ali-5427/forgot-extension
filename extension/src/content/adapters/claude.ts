import type { Adapter } from "./types";

export const claudeAdapter: Adapter = {
  name: "claude",
  matches: (url) => /(^|\.)claude\.ai$/.test(new URL(url).hostname),
  findTargets(root) {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-testid="assistant-message"], div.font-claude-message, .font-claude-response'
      )
    );
  },
  extract(target) {
    const text = target.innerText?.trim() || "";
    if (!text) return null;
    return { text, title: "Claude response" };
  },
  anchorEl(target) {
    return target;
  },
};

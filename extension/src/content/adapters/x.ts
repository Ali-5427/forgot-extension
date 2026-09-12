import type { Adapter } from "./types";

export const xAdapter: Adapter = {
  name: "x",
  matches: (url) => /(^|\.)(twitter|x)\.com$/.test(new URL(url).hostname),
  findTargets(root) {
    return Array.from(
      root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
    );
  },
  extract(target) {
    const textEl = target.querySelector<HTMLElement>('[data-testid="tweetText"]');
    const text = textEl?.innerText?.trim() || "";
    if (!text) return null;
    const userLink = target.querySelector<HTMLAnchorElement>(
      'a[role="link"][href*="/status/"]'
    );
    const author =
      target
        .querySelector<HTMLElement>('[data-testid="User-Name"]')
        ?.innerText?.split("\n")[0]
        ?.trim() || "";
    return {
      text,
      title: author ? `${author} on X` : "Tweet",
    };
  },
  anchorEl(target) {
    return target;
  },
};

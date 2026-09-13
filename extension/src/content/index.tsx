// Content script entry: Mode A (selection) + Mode B (per-item injection).
// The content script uses no React on the page — the pill button is a
// vanilla-DOM element inside a Shadow Root for zero style bleed and minimal cost.

import { createPill, positionNearSelectionRect, positionAnchored } from "./ui/pill";
import type { PillHandle } from "./ui/pill";
import { pickAdapter, genericArticleAdapter } from "./adapters";
import type { Adapter } from "./adapters/types";
import type { SaveResponse } from "../lib/messages";

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------
const url = () => location.href;
const adapter: Adapter = pickAdapter(url())!;
const isGeneric = adapter.name === genericArticleAdapter.name;

// Mode A
let modeAPill: PillHandle | null = null;
let selectionActive = false;

// Mode B
const modeBPills = new Map<HTMLElement, PillHandle>();
const scheduledTargets = new WeakSet<HTMLElement>();

// -----------------------------------------------------------------------------
// Helpers — guards, save, feedback
// -----------------------------------------------------------------------------
function isEditable(node: Node | null): boolean {
  if (!node) return false;
  let el: HTMLElement | null =
    node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

function currentSelectionText(): { text: string; rect: DOMRect | null } {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return { text: "", rect: null };
  const text = sel.toString().trim();
  if (!text) return { text: "", rect: null };
  const range = sel.getRangeAt(0);
  if (isEditable(range.startContainer) || isEditable(range.endContainer)) {
    return { text: "", rect: null };
  }
  const rect = range.getBoundingClientRect();
  return { text, rect };
}

async function saveMemory(payload: {
  capture_type: "highlight" | "content";
  original_content: string;
  source_title: string;
}): Promise<SaveResponse> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ ok: false, error: "Request timed out. Please try again." });
    }, 12000);

    chrome.runtime.sendMessage(
      {
        type: "SAVE_MEMORY",
        payload: {
          capture_type: payload.capture_type,
          original_content: payload.original_content,
          source_url: url(),
          source_title: payload.source_title || document.title || "",
          source_domain: location.hostname,
        },
      },
      (resp: SaveResponse) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "runtime error" });
        } else {
          resolve(resp);
        }
      }
    );
  });
}

function autoDismiss(pill: PillHandle, delay = 1600) {
  setTimeout(() => pill.destroy(), delay);
}

// -----------------------------------------------------------------------------
// Mode A — highlight save
// -----------------------------------------------------------------------------
function destroyModeA() {
  if (modeAPill) {
    modeAPill.destroy();
    modeAPill = null;
  }
}

function refreshModeA() {
  const { text, rect } = currentSelectionText();
  if (!text || !rect) {
    selectionActive = false;
    destroyModeA();
    // Re-show any Mode B pills that were hidden
    for (const p of modeBPills.values()) p.host.style.display = "";
    return;
  }
  selectionActive = true;
  // Priority: Mode A wins — hide all Mode B pills
  for (const p of modeBPills.values()) p.host.style.display = "none";

  if (!modeAPill) {
    modeAPill = createPill({
      testId: "forgot-ai-mode-a-pill",
      onClick: async () => {
        const snapshot = currentSelectionText();
        const content = snapshot.text || text;
        modeAPill?.setState("saving");
        try {
          const resp = await saveMemory({
            capture_type: "highlight",
            original_content: content,
            source_title: document.title || "",
          });
          if (resp.ok) {
            modeAPill?.setState("saved");
            if (modeAPill) autoDismiss(modeAPill);
          } else if (resp.unauthenticated) {
            modeAPill?.setState("error", "Sign in to save");
            chrome.runtime.sendMessage({ type: "OPEN_AUTH_TAB" });
          } else {
            modeAPill?.setState("error", "Save failed — retry");
          }
        } catch (err) {
          modeAPill?.setState("error", "Extension reloaded. Please refresh the page.");
        }
      },
    });
  }
  positionNearSelectionRect(modeAPill, rect);
}

document.addEventListener("selectionchange", () => {
  // Debounce via microtask + rAF; selectionchange fires often.
  requestAnimationFrame(refreshModeA);
});

// Also handle scroll/resize while a selection is active to reposition.
window.addEventListener(
  "scroll",
  () => {
    if (selectionActive) refreshModeA();
  },
  { passive: true, capture: true }
);
window.addEventListener("resize", () => {
  if (selectionActive) refreshModeA();
});

// -----------------------------------------------------------------------------
// Mode B — per-item save injection
// -----------------------------------------------------------------------------
function isVisibleEnough(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const vh = window.innerHeight;
  return rect.bottom > 0 && rect.top < vh + 200;
}

function injectModeBFor(target: HTMLElement): boolean {
  if (modeBPills.has(target)) return true;
  const extracted = adapter.extract(target);
  if (!extracted || !extracted.text || extracted.text.length < 20) return false;
  const pill = createPill({
    testId: "forgot-ai-mode-b-pill",
    onClick: async () => {
      pill.setState("saving");
      try {
        const resp = await saveMemory({
          capture_type: "content",
          original_content: extracted.text,
          source_title: extracted.title || document.title || "",
        });
        if (resp.ok) {
          pill.setState("saved");
          // Keep saved pill for a bit longer since it's anchored, then remove.
          setTimeout(() => {
            pill.destroy();
            modeBPills.delete(target);
          }, 1800);
        } else if (resp.unauthenticated) {
          pill.setState("error", "Sign in to save");
          chrome.runtime.sendMessage({ type: "OPEN_AUTH_TAB" });
        } else {
          pill.setState("error", "Save failed — retry");
        }
      } catch (err) {
        pill.setState("error", "Extension reloaded. Please refresh the page.");
      }
    },
  });
  positionAnchored(pill, adapter.anchorEl(target));
  if (selectionActive) pill.host.style.display = "none";
  modeBPills.set(target, pill);
  return true;
}

function cleanupModeB() {
  for (const [target, pill] of modeBPills.entries()) {
    if (!target.isConnected || !isVisibleEnough(target)) {
      pill.destroy();
      modeBPills.delete(target);
    }
  }
}

function refreshModeB() {
  const targets = adapter.findTargets(document);
  const visible = targets.filter(isVisibleEnough);
  for (const t of visible) {
    if (!modeBPills.has(t) && !scheduledTargets.has(t)) {
      const success = injectModeBFor(t);
      if (success) {
        scheduledTargets.add(t);
      }
    }
  }
  // Reposition existing pills so they follow scroll on next tick.
  for (const [target, pill] of modeBPills.entries()) {
    if (target.isConnected) positionAnchored(pill, adapter.anchorEl(target));
  }
  cleanupModeB();
}

// Only run Mode B on sites where the adapter actually produces targets.
// For the generic article adapter, this often means one big anchored button
// near the top of the article — which is fine per spec.
let mo: MutationObserver | null = null;
function startModeB() {
  refreshModeB();
  mo = new MutationObserver(() => {
    // throttle via rAF
    requestAnimationFrame(refreshModeB);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("scroll", () => requestAnimationFrame(refreshModeB), {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", () => requestAnimationFrame(refreshModeB));
}

// Kick off after DOM is ready-ish.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startModeB, { once: true });
} else {
  // Small delay for generic sites to finish rendering
  setTimeout(startModeB, isGeneric ? 800 : 200);
}

// Handle SPA navigations
let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    // Rebuild Mode B on SPA route change
    for (const [t, p] of modeBPills.entries()) {
      p.destroy();
      modeBPills.delete(t);
    }
    setTimeout(refreshModeB, 400);
  }
}, 800);

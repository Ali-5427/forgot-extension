// Pill button rendered inside a Shadow Root. State-driven, framework-free
// to keep bundle tiny and avoid React DOM re-mount issues on host pages.
import { PILL_CSS, ICONS } from "./styles";

export type PillState = "idle" | "saving" | "saved" | "error";

export interface PillOptions {
  label?: string;
  onClick: () => void;
  testId?: string;
}

export interface PillHandle {
  host: HTMLElement;
  setState: (state: PillState, message?: string) => void;
  setPosition: (rect: { top: number; left: number; fixed?: boolean }) => void;
  destroy: () => void;
  el: HTMLDivElement;
}

export function createPill(opts: PillOptions): PillHandle {
  const host = document.createElement("div");
  host.setAttribute("data-forgot-ai", "pill");
  // The host itself is unstyled; all styling lives inside the shadow.
  host.style.all = "unset";
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PILL_CSS;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill floating";
  btn.setAttribute("data-testid", opts.testId || "forgot-ai-pill-button");
  btn.innerHTML = `<span class="icon">${ICONS.bookmark}</span><span class="label" data-testid="forgot-ai-pill-status">${opts.label || "Save to Forgot AI"}</span>`;

  // Prevent selection loss on click.
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onClick();
  });

  wrap.appendChild(btn);
  shadow.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("visible"));

  document.documentElement.appendChild(host);

  const setState: PillHandle["setState"] = (state, message) => {
    btn.classList.remove("saving", "saved", "error");
    const label = btn.querySelector(".label") as HTMLElement;
    const icon = btn.querySelector(".icon") as HTMLElement;
    switch (state) {
      case "saving":
        btn.classList.add("saving");
        btn.setAttribute("disabled", "true");
        icon.innerHTML = `<span class="spinner"></span>`;
        label.textContent = message || "Saving…";
        break;
      case "saved":
        btn.classList.add("saved");
        btn.setAttribute("disabled", "true");
        icon.innerHTML = ICONS.check;
        label.textContent = message || "Saved to Forgot AI";
        break;
      case "error":
        btn.classList.add("error");
        btn.removeAttribute("disabled");
        icon.innerHTML = ICONS.alert;
        label.textContent = message || "Save failed";
        break;
      case "idle":
      default:
        btn.removeAttribute("disabled");
        icon.innerHTML = ICONS.bookmark;
        label.textContent = "Save to Forgot AI";
        break;
    }
  };

  const setPosition: PillHandle["setPosition"] = ({ top, left, fixed = true }) => {
    host.style.position = fixed ? "fixed" : "absolute";
    host.style.top = `${Math.max(4, top)}px`;
    host.style.left = `${Math.max(4, left)}px`;
    // Enable pointer events only on the button; leave wrap transparent.
    btn.style.pointerEvents = "auto";
  };

  const destroy = () => {
    wrap.classList.remove("visible");
    setTimeout(() => host.remove(), 180);
  };

  return { host, setState, setPosition, destroy, el: btn as unknown as HTMLDivElement };
}

// Position the pill near a selection rect, viewport-edge aware.
export function positionNearSelectionRect(
  handle: PillHandle,
  rect: DOMRect
): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = 180;
  const h = 36;
  let left = rect.left + rect.width / 2 - w / 2;
  let top = rect.top - h - 8;
  if (top < 8) top = rect.bottom + 8;
  if (top + h > vh - 8) top = vh - h - 8;
  if (left < 8) left = 8;
  if (left + w > vw - 8) left = vw - w - 8;
  handle.setPosition({ top, left, fixed: true });
}

// Position anchored beside an element (Mode B). Uses fixed positioning
// pinned to element's viewport rect so it follows scroll cleanly on next tick.
export function positionAnchored(handle: PillHandle, el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const w = 180;
  let left = rect.right - w;
  let top = rect.top + 8;
  if (left < 8) left = rect.left + 8;
  if (left + w > vw - 8) left = vw - w - 8;
  handle.setPosition({ top, left, fixed: true });
}

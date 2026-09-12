// Site adapter interface for Mode B (per-item save).
export type CaptureType = "highlight" | "content";

export interface ExtractedContent {
  text: string;
  title?: string;
}

export interface Adapter {
  name: string;
  matches(url: string): boolean;
  // Return list of candidate elements (e.g. tweets, chat messages, articles).
  findTargets(root: ParentNode): HTMLElement[];
  // Extract text/title from a target.
  extract(target: HTMLElement): ExtractedContent | null;
  // Return the element the pill button should be anchored to (usually target itself).
  anchorEl(target: HTMLElement): HTMLElement;
}

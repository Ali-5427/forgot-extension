// Message bus types shared between content-script and service-worker.
import type { SaveMemoryInput, Memory } from "./api";

export type SaveRequest = { type: "SAVE_MEMORY"; payload: SaveMemoryInput };
export type SaveResponse =
  | { ok: true; memory: Memory; deduped: boolean }
  | { ok: false; error: string; unauthenticated?: boolean };

export type OpenAuthRequest = { type: "OPEN_AUTH_TAB" };
export type GetAuthRequest = { type: "GET_AUTH_STATUS" };
export type GetAuthResponse = { authenticated: boolean; email?: string };

export type ExtMessage = SaveRequest | OpenAuthRequest | GetAuthRequest;

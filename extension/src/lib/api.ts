import { CONFIG } from "./config";
import { getSession, setSession } from "./storage";

// Shape returned by POST /api/items/text on the live backend.
// The real backend returns { id, title, status, ... } — we only need
// enough to satisfy the pill success path. Extra fields are kept as-is.
export interface SavedItem {
  id: string;
  title?: string;
  status?: string;
  [k: string]: any;
}

// Kept for compatibility with the rest of the extension code paths.
export type Memory = SavedItem & {
  processing_status?: string;
  deduped?: boolean;
};

export interface SaveMemoryInput {
  capture_type: "highlight" | "content";
  original_content: string;
  source_url: string;
  source_title: string;
  source_domain: string;
}

interface AuthPayload {
  token: string;
  refresh_token?: string;
  user: { id: string; email: string; [k: string]: any };
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth) {
    const s = await getSession();
    if (s?.token) headers.set("Authorization", `Bearer ${s.token}`);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let res: Response;
  try {
    res = await fetch(`${CONFIG.BACKEND_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e: any) {
    throw new Error(
      e?.name === 'AbortError'
        ? "Network timeout — the server took too long to respond."
        : e?.message
        ? `Network error: ${e.message}`
        : "Network error — check your connection."
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Auto-refresh token on 401
  if (res.status === 401 && init.auth) {
    const s = await getSession();
    if (s?.refresh_token) {
      try {
        const refreshRes = await fetch(`${CONFIG.BACKEND_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        
        if (refreshRes.ok) {
          const newAuth: AuthPayload = await refreshRes.json();
          await setSession({
            token: newAuth.token,
            refresh_token: newAuth.refresh_token,
            user: {
              id: newAuth.user.id,
              email: newAuth.user.email,
              created_at: newAuth.user.created_at || newAuth.user.createdAt || new Date().toISOString(),
            },
          });
          
          // Retry the original request with the new token
          headers.set("Authorization", `Bearer ${newAuth.token}`);
          res = await fetch(`${CONFIG.BACKEND_URL}${path}`, { ...init, headers });
        }
      } catch (err) {
        // Fall through to regular error handling if refresh fails
      }
    }
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const j: any = await res.json();
      detail =
        (typeof j?.detail === "string" && j.detail) ||
        (typeof j?.error === "string" && j.error) ||
        (typeof j?.message === "string" && j.message) ||
        detail;
    } catch {
      // ignore
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export const api = {
  // Live backend uses /register (not /signup). Kept exported as `signup`
  // so AuthApp.tsx doesn't need to change.
  signup: (email: string, password: string) =>
    request<AuthPayload>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    request<{ id: string; email: string; [k: string]: any }>("/api/auth/me", {
      auth: true,
    }),

  logout: async () => {
    // Best-effort — token is stateless client-side either way.
    try {
      await request<any>("/api/auth/logout", { method: "POST", auth: true });
    } catch {
      // ignore server errors on logout
    }
  },

  // The live backend saves via /api/items/text with { text, source_url?, source_title? }.
  // We adapt our internal SaveMemoryInput to that shape and return a
  // Memory-shaped object so the content-script / service-worker paths
  // don't need to change.
  createMemory: async (input: SaveMemoryInput): Promise<Memory> => {
    const body: Record<string, unknown> = {
      text: input.original_content,
    };
    if (input.source_url) body.source_url = input.source_url;
    if (input.source_title) body.source_title = input.source_title;

    const saved = await request<SavedItem>("/api/items/text", {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    });

    return {
      ...saved,
      processing_status: saved.status || "done",
      deduped: false,
    };
  },
};

// Helper used by AuthApp: persist token + optional refresh_token in the
// existing chrome.storage session shape.
export async function persistAuth(payload: AuthPayload): Promise<void> {
  await setSession({
    token: payload.token,
    refresh_token: payload.refresh_token,
    user: {
      id: payload.user.id,
      email: payload.user.email,
      created_at:
        (payload.user as any).created_at ||
        (payload.user as any).createdAt ||
        new Date().toISOString(),
    },
  });
}

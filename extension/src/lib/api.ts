import { CONFIG } from "./config";
import { getSession } from "./storage";

export interface Memory {
  id: string;
  user_id: string;
  capture_type: "highlight" | "content";
  original_content: string;
  source_url: string;
  source_title: string;
  source_domain: string;
  content_hash: string;
  ai_title: string | null;
  ai_summary: string | null;
  ai_topics: string[];
  ai_keywords: string[];
  ai_entities: string[];
  processing_status: "pending" | "processing" | "done" | "failed";
  created_at: string;
  updated_at: string;
  deduped?: boolean;
}

export interface SaveMemoryInput {
  capture_type: "highlight" | "content";
  original_content: string;
  source_url: string;
  source_title: string;
  source_domain: string;
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (init.auth) {
    const s = await getSession();
    if (s?.token) headers.set("Authorization", `Bearer ${s.token}`);
  }
  const res = await fetch(`${CONFIG.BACKEND_URL}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = (j.detail as string) || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ token: string; user: any }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: string; email: string; created_at: string }>("/api/auth/me", { auth: true }),
  createMemory: (input: SaveMemoryInput) =>
    request<Memory>("/api/memories", {
      method: "POST",
      body: JSON.stringify(input),
      auth: true,
    }),
};

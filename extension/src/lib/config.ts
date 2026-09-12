// Global config. Backend URL is baked at build time; override via .env if needed.
// The backend implements InsForge-compatible endpoints (see /app/backend/server.py)
// or your real InsForge project (see /app/insforge/).
export const CONFIG = {
  BACKEND_URL:
    (import.meta as any).env?.VITE_BACKEND_URL ||
    "https://fb92672c-f00f-417d-b4e4-d0a6d051052c.preview.emergentagent.com",
  APP_NAME: "Forgot AI",
  APP_URL:
    (import.meta as any).env?.VITE_APP_URL ||
    "https://forgot.ai",
};

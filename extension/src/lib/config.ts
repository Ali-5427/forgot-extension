// Global config. Points at the live Forgot AI production API.
export const CONFIG = {
  BACKEND_URL:
    (import.meta as any).env?.VITE_BACKEND_URL ||
    "https://forgot-ai.onrender.com",
  APP_URL:
    (import.meta as any).env?.VITE_APP_URL ||
    "https://forgot-ai.vercel.app",
  APP_NAME: "Forgot AI",
};

import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Forgot AI",
  description: "Save highlights, tweets, AI responses, and articles to Forgot AI in one click.",
  version: "1.0.0",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Forgot AI",
    default_icon: {
      "16": "public/icons/icon-16.png",
      "48": "public/icons/icon-48.png",
      "128": "public/icons/icon-128.png",
    },
  },
  icons: {
    "16": "public/icons/icon-16.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/auth/index.html", "public/icons/*"],
      matches: ["<all_urls>"],
    },
  ],
  permissions: ["storage", "activeTab", "scripting", "tabs"],
  host_permissions: ["<all_urls>"],
});

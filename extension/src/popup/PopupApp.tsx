import { useEffect, useState } from "react";
import { Bookmark, ExternalLink, LogOut, User } from "lucide-react";
import { api } from "../lib/api";
import { CONFIG } from "../lib/config";
import { clearSession, getSession, onSessionChange } from "../lib/storage";

export default function PopupApp() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((s) => {
      setEmail(s?.user.email || null);
      setLoading(false);
    });
    const off = onSessionChange((s) => setEmail(s?.user.email || null));
    return off;
  }, []);

  const openAuth = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/auth/index.html") });
    window.close();
  };
  const openApp = () => {
    chrome.tabs.create({ url: CONFIG.APP_URL });
    window.close();
  };
  const logout = async () => {
    await api.logout();
    await clearSession();
    setEmail(null);
  };

  return (
    <div
      data-testid="extension-popup-container"
      className="w-[280px] bg-bg text-textPrimary p-4 border border-border space-y-3 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-textPrimary font-semibold text-sm">
          <Bookmark className="w-4 h-4" />
          <span>Forgot AI</span>
        </div>
        <span className="text-[10px] tracking-widest text-textMuted uppercase">
          v1
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-textMuted py-2">Loading…</div>
      ) : email ? (
        <>
          <div
            data-testid="popup-user-panel"
            className="flex items-center space-x-2.5 p-2 bg-surface border border-borderSubtle rounded-lg"
          >
            <div className="w-7 h-7 rounded-full bg-surfaceActive flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-textSecondary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-textMuted uppercase tracking-wider">
                Signed in
              </div>
              <div
                data-testid="popup-user-email"
                className="text-xs font-medium text-textPrimary truncate max-w-[190px]"
              >
                {email}
              </div>
            </div>
          </div>
          <button
            data-testid="popup-open-app-button"
            onClick={openApp}
            className="flex items-center justify-center space-x-2 w-full bg-textPrimary hover:bg-[#E4E4E7] text-bg font-semibold text-xs rounded-md py-2 px-3 transition-opacity duration-150"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Forgot AI</span>
          </button>
          <button
            data-testid="popup-logout-button"
            onClick={logout}
            className="flex items-center justify-center space-x-2 w-full bg-surfaceHover hover:bg-surfaceActive text-textSecondary hover:text-textPrimary font-medium text-xs rounded-md py-2 px-3 border border-border transition-colors duration-150"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </>
      ) : (
        <>
          <div className="text-xs text-textSecondary py-1">
            Sign in to start saving highlights, tweets, and AI responses.
          </div>
          <button
            data-testid="popup-login-redirect-button"
            onClick={openAuth}
            className="flex items-center justify-center space-x-2 w-full bg-textPrimary hover:bg-[#E4E4E7] text-bg font-semibold text-xs rounded-md py-2 px-3 transition-opacity duration-150"
          >
            <span>Sign in</span>
          </button>
        </>
      )}
    </div>
  );
}

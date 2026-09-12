import { useEffect, useState } from "react";
import { Bookmark, Lock, Mail, Loader2, Sparkles } from "lucide-react";
import { api, persistAuth } from "../lib/api";
import { getSession } from "../lib/storage";

type Mode = "login" | "signup";

export default function AuthApp() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<{ email: string } | null>(null);

  useEffect(() => {
    getSession().then((s) => {
      if (s) setSignedIn({ email: s.user.email });
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const fn = mode === "login" ? api.login : api.signup;
      const res = await fn(email.trim(), password);
      await persistAuth(res);
      setSignedIn({ email: res.user.email });
      // Auto-close after a moment so the flow feels seamless.
      setTimeout(() => {
        if (typeof chrome !== "undefined" && chrome.tabs?.getCurrent) {
          chrome.tabs.getCurrent((t) => t?.id && chrome.tabs.remove(t.id));
        } else {
          window.close();
        }
      }, 900);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (signedIn) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-bg">
        <div
          data-testid="auth-signed-in-panel"
          className="w-full max-w-[400px] bg-surface border border-border rounded-xl p-8 shadow-2xl text-center space-y-4"
        >
          <div className="flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-textPrimary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-textPrimary">
            You're all set
          </h1>
          <p className="text-sm text-textSecondary">
            Signed in as <span className="text-textPrimary">{signedIn.email}</span>.
            You can close this tab and start saving from any page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-bg">
      <div
        data-testid="auth-tab-container"
        className="w-full max-w-[400px] bg-surface border border-border rounded-xl p-8 shadow-2xl space-y-6"
      >
        <div className="flex items-center justify-center space-x-2 text-textPrimary font-bold text-xl mb-2">
          <Bookmark className="w-5 h-5" />
          <span>Forgot AI</span>
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-textPrimary">
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </h1>
          <p className="text-xs text-textMuted">
            Save highlights, tweets, AI responses, and articles in one click.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-textSecondary flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </span>
            <input
              data-testid={mode === "login" ? "login-email-input" : "signup-email-input"}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-surfaceHover border border-border text-textPrimary placeholder-textMuted text-sm rounded-lg focus:border-borderFocus focus:ring-0 transition-colors duration-150 h-10 px-3 w-full"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-textSecondary flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Password
            </span>
            <input
              data-testid={mode === "login" ? "login-password-input" : "signup-password-input"}
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-surfaceHover border border-border text-textPrimary placeholder-textMuted text-sm rounded-lg focus:border-borderFocus focus:ring-0 transition-colors duration-150 h-10 px-3 w-full"
              placeholder="At least 8 characters"
            />
          </label>
          {error && (
            <div
              data-testid="auth-error"
              className="text-xs text-red-300 bg-[#450A0A] border border-[#991B1B] rounded-md px-3 py-2"
            >
              {error}
            </div>
          )}
          <button
            data-testid={mode === "login" ? "login-submit-button" : "signup-submit-button"}
            type="submit"
            disabled={busy}
            className="bg-textPrimary hover:bg-[#E4E4E7] text-bg font-semibold text-sm rounded-lg h-10 px-4 w-full transition-opacity duration-150 cursor-pointer disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <button
          data-testid="toggle-auth-mode-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="text-xs text-textMuted hover:text-textPrimary transition-colors duration-150 w-full text-center"
        >
          {mode === "login"
            ? "No account yet? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
      <p className="text-[11px] text-textMuted mt-4">
        Your session is stored locally in this browser only.
      </p>
    </div>
  );
}

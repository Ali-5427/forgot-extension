/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#09090B",
        surface: "#121215",
        surfaceHover: "#18181B",
        surfaceActive: "#27272A",
        border: "#27272A",
        borderSubtle: "#1E1E22",
        borderFocus: "#52525B",
        textPrimary: "#FAFAFA",
        textSecondary: "#A1A1AA",
        textMuted: "#71717A",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

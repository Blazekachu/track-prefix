import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
      },
      colors: {
        terminal: {
          bg: "#0a0a0a",
          surface: "#111111",
          border: "#1a1a1a",
          green: "#00ff41",
          amber: "#ffb000",
          red: "#ff3333",
          dim: "#555555",
          text: "#cccccc",
          bright: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
export default config;
